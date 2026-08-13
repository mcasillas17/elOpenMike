import { test, expect, type Page } from "@playwright/test";

const YOUTUBE_REQUEST = /(^|\.)(youtube\.com|youtube-nocookie\.com|ytimg\.com)(?:\/|$)/i;
const CSP_MESSAGE = /content security policy|refused to (load|frame|connect|execute|apply)/i;

type Violation = { directive: string; blocked: string };

async function watchPolicy(page: Page): Promise<{
  violations: Violation[];
  cspErrors: string[];
}> {
  const violations: Violation[] = [];
  const cspErrors: string[] = [];

  await page.exposeFunction("__reportViolation", (violation: Violation) => {
    violations.push(violation);
  });
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      const detail = event as SecurityPolicyViolationEvent;
      void (
        window as unknown as {
          __reportViolation: (violation: Violation) => void;
        }
      ).__reportViolation({
        directive: detail.effectiveDirective || detail.violatedDirective,
        blocked: detail.blockedURI,
      });
    });
  });
  page.on("console", (message) => {
    if (
      (message.type() === "error" || message.type() === "warning") &&
      CSP_MESSAGE.test(message.text())
    ) {
      cspErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    if (CSP_MESSAGE.test(error.message)) cspErrors.push(error.message);
  });

  return { violations, cspErrors };
}

async function serveIntentionalPlayer(page: Page): Promise<{ hits: string[] }> {
  const hits: string[] = [];
  await page.route("https://www.youtube-nocookie.com/**", async (route) => {
    hits.push(route.request().url());
    await route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Intentional player</title><p>player</p>",
    });
  });
  return { hits };
}

async function watchYouTubeRequests(page: Page): Promise<string[]> {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (YOUTUBE_REQUEST.test(new URL(request.url()).hostname)) {
      requests.push(request.url());
    }
  });
  return requests;
}

for (const path of ["/", "/comedy", "/projects/light-master"]) {
  test(`the ${path} facade stays local until Play and then navigates its permitted player frame`, async ({ page }) => {
    const policy = await watchPolicy(page);
    const requests = await watchYouTubeRequests(page);
    const { hits } = await serveIntentionalPlayer(page);

    await page.goto(path);
    const play = page.getByRole("button", { name: /^Play:/ }).first();
    await expect(play).toBeVisible();
    expect(requests).toEqual([]);
    expect(policy.violations).toEqual([]);
    expect(policy.cspErrors).toEqual([]);

    await play.click();
    const player = page.locator("iframe").first();
    await expect(player).toHaveAttribute(
      "src",
      /^https:\/\/www\.youtube-nocookie\.com\/embed\//,
    );
    await expect(player).toHaveAttribute("loading", "lazy");
    await expect(player).toHaveAttribute("referrerpolicy", "no-referrer");
    await expect
      .poll(() =>
        page
          .frames()
          .filter((frame) =>
            frame.url().startsWith("https://www.youtube-nocookie.com/embed/"),
          ).length,
      )
      .toBeGreaterThan(0);

    expect(hits.some((url) => url.includes("/embed/"))).toBe(true);
    expect(requests.some((url) => url.includes("/embed/"))).toBe(true);
    expect(policy.violations).toEqual([]);
    expect(policy.cspErrors).toEqual([]);
  });
}

test("the local facade policy permits only the intentional video frame origin", async ({
  request,
}) => {
  const response = await request.get("/comedy");
  expect(response.status()).toBe(200);

  const policy = response.headers()["content-security-policy"];
  expect(policy).toContain("img-src 'self' data: blob:");
  expect(policy).toContain("frame-src https://www.youtube-nocookie.com");
  expect(policy).not.toContain("ytimg");
  expect(policy).not.toContain("img.youtube.com");
  expect(policy).not.toContain("*.youtube");
  expect(policy).not.toContain("https://youtube.com");
  expect(policy).not.toContain("http://");
  expect(policy).toContain("default-src 'self'");
  expect(policy).toContain("object-src 'none'");
});

test("the rest of the primary site loads under the same CSP without violations", async ({
  page,
}) => {
  const policy = await watchPolicy(page);

  for (const route of ["/", "/blog", "/projects"]) {
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }

  expect(policy.violations).toEqual([]);
  expect(policy.cspErrors).toEqual([]);
});
