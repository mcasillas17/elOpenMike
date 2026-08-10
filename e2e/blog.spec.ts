import { test, expect } from "@playwright/test";

test("serves an RSS feed with at least one item", async ({ request }) => {
  const response = await request.get("/feed.xml");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("application/rss+xml");

  const body = await response.text();
  expect(body).toContain('<rss version="2.0"');
  expect(body).toContain("<item>");
});

test("a tag chip navigates to its tag page", async ({ page }) => {
  await page.goto("/blog");
  const chip = page.locator('a[href^="/blog/tag/"]').first();
  const label = (await chip.innerText()).trim();
  await chip.click();
  await expect(page).toHaveURL(/\/blog\/tag\//);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(label);
});

test("heading anchors deep-link into a post", async ({ page }) => {
  await page.goto("/blog");
  await page.locator("article h2 a").first().click();
  await expect(page).toHaveURL(/\/blog\/[^/]+$/);

  const heading = page.locator("h2[id]").first();
  await expect(heading).toBeVisible();

  const id = await heading.getAttribute("id");
  await page.goto(`${page.url().split("#")[0]}#${id}`);
  await expect(page.locator(`h2#${id}`)).toBeInViewport();
});

test("the homepage links to the blog from the writing section", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#writing")).toBeVisible();
  await page.getByRole("link", { name: /read all posts/i }).click();
  await expect(page).toHaveURL(/\/blog$/);
});
