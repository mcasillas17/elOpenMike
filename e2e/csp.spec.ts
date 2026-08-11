import { test, expect, type Page } from "@playwright/test";

// The comedy page is the only page that reaches off-site for content: the
// facade thumbnail on img.youtube.com, and — once somebody clicks it — the
// privacy-friendly player on www.youtube-nocookie.com. The policy every
// response carries said neither, so the browser refused both and printed a
// Content Security Policy error for each. Nothing in the suite looked at the
// console, so the page shipped with its content blocked and its tests green.
//
// Both hosts are served from the test rather than from the internet. What is
// being proved is the policy, and a policy that refuses something refuses it
// before a request is ever made: a blocked load never reaches a route handler,
// so serving these locally makes the check hermetic without weakening it.

const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const CSP_MESSAGE = /content security policy|refused to (load|frame|connect|execute|apply)/i;

type Violation = { directive: string; blocked: string };

// Everything the browser says about the policy, from both directions: the
// console text a developer would see, and the event the page itself gets.
async function watchPolicy(page: Page): Promise<{
  violations: Violation[];
  cspErrors: string[];
  otherErrors: string[];
}> {
  const violations: Violation[] = [];
  const cspErrors: string[] = [];
  const otherErrors: string[] = [];

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
    if (message.type() !== "error" && message.type() !== "warning") return;
    const text = message.text();
    if (CSP_MESSAGE.test(text)) cspErrors.push(text);
    else otherErrors.push(text);
  });
  page.on("pageerror", (error) => {
    const text = error.message;
    if (CSP_MESSAGE.test(text)) cspErrors.push(text);
    else otherErrors.push(text);
  });

  return { violations, cspErrors, otherErrors };
}

async function serveYouTube(page: Page): Promise<{ hits: string[] }> {
  const hits: string[] = [];
  await page.route("https://img.youtube.com/**", async (route) => {
    hits.push(route.request().url());
    await route.fulfill({ contentType: "image/png", body: PIXEL });
  });
  await page.route("https://www.youtube-nocookie.com/**", async (route) => {
    hits.push(route.request().url());
    await route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>player</title><p>player</p>",
    });
  });
  return { hits };
}

test("the policy names the two hosts the comedy page uses, and no more", async ({
  request,
}) => {
  const response = await request.get("/comedy");
  expect(response.status()).toBe(200);

  const policy = response.headers()["content-security-policy"];
  expect(policy).toContain("img-src 'self' data: blob: https://img.youtube.com");
  expect(policy).toContain("frame-src https://www.youtube-nocookie.com");
  // Named in full: no wildcard host, and not the bare site.
  expect(policy).not.toContain("*.youtube");
  expect(policy).not.toContain("https://youtube.com");
  expect(policy).not.toContain("http://");
  expect(policy).toContain("default-src 'self'");
  expect(policy).toContain("object-src 'none'");
});

test("the comedy page draws its thumbnails with nothing refused", async ({
  page,
}) => {
  const said = await watchPolicy(page);
  const { hits } = await serveYouTube(page);

  await page.goto("/comedy");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  const thumbnail = page.locator('img[src^="https://img.youtube.com/"]').first();
  await thumbnail.scrollIntoViewIfNeeded();
  // The image is what proves the policy let it through: a refused load leaves
  // a broken image whose intrinsic width is zero.
  await expect
    .poll(() => thumbnail.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);

  expect(hits.some((url) => url.startsWith("https://img.youtube.com/"))).toBe(
    true,
  );
  expect(said.violations).toEqual([]);
  expect(said.cspErrors).toEqual([]);
});

test("clicking a clip frames the nocookie player, with nothing refused", async ({
  page,
}) => {
  const said = await watchPolicy(page);
  const { hits } = await serveYouTube(page);

  await page.goto("/comedy");
  await page.getByRole("button", { name: /^Play:/ }).first().click();

  const player = page.locator("iframe").first();
  await expect(player).toHaveAttribute(
    "src",
    /^https:\/\/www\.youtube-nocookie\.com\/embed\//,
  );

  // The frame is in the page, not merely the element: a refused frame leaves
  // the iframe element with a src the browser never navigated to.
  await expect
    .poll(() =>
      page
        .frames()
        .filter((frame) =>
          frame.url().startsWith("https://www.youtube-nocookie.com/embed/"),
        )
        .length,
    )
    .toBeGreaterThan(0);

  expect(
    hits.some((url) => url.startsWith("https://www.youtube-nocookie.com/embed/")),
  ).toBe(true);
  expect(said.violations).toEqual([]);
  expect(said.cspErrors).toEqual([]);
});

test("the rest of the site still loads under the same policy", async ({
  page,
}) => {
  const said = await watchPolicy(page);
  // The home page carries the same embeds in its comedy section, so it reaches
  // the same two hosts; served here for the same reason.
  await serveYouTube(page);

  for (const route of ["/", "/blog", "/projects"]) {
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }

  expect(said.violations).toEqual([]);
  expect(said.cspErrors).toEqual([]);
});
