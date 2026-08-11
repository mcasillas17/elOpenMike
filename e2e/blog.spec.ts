import { test, expect } from "@playwright/test";

test("serves an RSS feed with at least one item", async ({ request }) => {
  const response = await request.get("/feed.xml");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("application/rss+xml");

  const body = await response.text();
  expect(body).toContain('<rss version="2.0"');
  expect(body).toContain("<item>");
});

// A post with no tags is a post, not a broken one: Notion's Tags column is
// optional, so a published post can carry none — and a blog whose posts all
// happen to carry none has no tag pages at all. This test used to take the
// first `a[href^="/blog/tag/"]` on the page and read its text, so on that blog
// it failed on a locator that matched nothing, saying nothing about the site.
// The chip is discovered instead, and where there is none there is nothing here
// to prove.
test("a tag chip navigates to its tag page, which lists the post it came from", async ({
  page,
}) => {
  await page.goto("/blog");

  const cards = page.locator("article");
  const total = await cards.count();
  expect(total).toBeGreaterThan(0);

  // The first card that carries a tag, in the order the blog lists them, so
  // which one this is does not depend on when a locator resolved.
  let index = -1;
  for (let i = 0; i < total; i += 1) {
    if ((await cards.nth(i).locator('a[href^="/blog/tag/"]').count()) > 0) {
      index = i;
      break;
    }
  }
  test.skip(index === -1, "no post on this blog carries a tag");

  const card = cards.nth(index);
  const title = (await card.locator("h2 a").innerText()).trim();
  const chip = card.locator('a[href^="/blog/tag/"]').first();
  const label = (await chip.innerText()).trim();

  await chip.click();
  await expect(page).toHaveURL(/\/blog\/tag\//);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(label);
  // The tag page is only worth reaching if the post that sent us is on it.
  await expect(page.getByRole("link", { name: title })).toBeVisible();
});

// Whatever the Tags column holds, the post itself publishes: the page renders,
// and it shows exactly the tags its card did — none included.
test("every post page renders, tagged or not", async ({ page }) => {
  await page.goto("/blog");

  const cards = page.locator("article");
  const total = await cards.count();
  expect(total).toBeGreaterThan(0);

  const posts: Array<{ href: string; chips: number }> = [];
  for (let i = 0; i < total; i += 1) {
    const card = cards.nth(i);
    posts.push({
      href: (await card.locator("h2 a").getAttribute("href")) ?? "",
      chips: await card.locator('a[href^="/blog/tag/"]').count(),
    });
  }

  for (const post of posts) {
    expect(post.href).not.toBe("");
    await page.goto(post.href);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator('a[href^="/blog/tag/"]')).toHaveCount(post.chips);
  }
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
