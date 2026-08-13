import { test, expect, type Page } from "@playwright/test";

const YOUTUBE_REQUEST = /(^|\.)(youtube\.com|youtube-nocookie\.com|ytimg\.com)(?:\/|$)/i;

async function watchYouTubeRequests(page: Page): Promise<string[]> {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (YOUTUBE_REQUEST.test(new URL(request.url()).hostname)) {
      requests.push(request.url());
    }
  });
  await page.route("https://www.youtube-nocookie.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Intentional player</title>",
    }),
  );
  return requests;
}

for (const path of ["/", "/comedy", "/projects/light-master"]) {
  test(`the ${path} video facade makes no YouTube request before Play`, async ({ page }) => {
    const requests = await watchYouTubeRequests(page);
    await page.goto(path);

    const play = page.getByRole("button", { name: /^Play:/ }).first();
    await expect(play).toBeVisible();
    expect(requests).toEqual([]);

    await play.click();
    const player = page.locator("iframe").first();
    await expect(player).toHaveAttribute(
      "src",
      /^https:\/\/www\.youtube-nocookie\.com\/embed\//,
    );
    await expect(player).toHaveAttribute("loading", "lazy");
    await expect(player).toHaveAttribute("referrerpolicy", "no-referrer");
    await expect.poll(() => requests.some((url) => url.includes("/embed/"))).toBe(true);
  });
}

test("the response permits only the intentional video frame origin", async ({ request }) => {
  const response = await request.get("/comedy");
  expect(response.status()).toBe(200);
  const policy = response.headers()["content-security-policy"];
  expect(policy).toContain("frame-src https://www.youtube-nocookie.com");
  expect(policy).toContain("img-src 'self' data: blob:");
  expect(policy).not.toContain("ytimg");
  expect(policy).not.toContain("img.youtube.com");
});
