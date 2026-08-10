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

test("a heading anchor deep-links into the section it labels", async ({
  page,
}) => {
  await page.goto("/blog");
  await page.locator("article h2 a").first().click();
  await expect(page).toHaveURL(/\/blog\/[^/]+$/);
  const postUrl = page.url();

  // The anchor rehype-autolink-headings appends: a child of the slugged
  // heading itself, not the card link that got us here.
  const heading = page.locator("h2[id]").first();
  const anchor = heading.locator("> a.heading-anchor");
  await expect(anchor).toHaveCount(1);

  const id = await heading.getAttribute("id");
  expect(id).toBeTruthy();
  await expect(anchor).toHaveAttribute("href", `#${id}`);
  await expect(anchor).toHaveAccessibleName("Link to this section");

  // Hidden until the heading is hovered or the link is focused, but always
  // reachable — a keyboard user tabs to it and it becomes visible.
  await anchor.focus();
  await expect(anchor).toBeFocused();

  await anchor.click();

  // The hash comes from following the anchor, not from building a URL here.
  await expect(page).toHaveURL(`${postUrl}#${id}`);
  await expect(heading).toBeInViewport();
});

test("the homepage links to the blog from the writing section", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#writing")).toBeVisible();
  await page.getByRole("link", { name: /read all posts/i }).click();
  await expect(page).toHaveURL(/\/blog$/);
});
