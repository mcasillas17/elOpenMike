import { test, expect } from "@playwright/test";
import { projects } from "../src/data/projects";
import { getAllPosts, getAllTags } from "../src/lib/blog";
import { absoluteUrl, routes } from "../src/lib/site";

const pages = [
  { path: routes.home, title: "Miguel Casillas — Software Engineer", image: "/opengraph-image" },
  { path: routes.projects, title: "Projects", image: "/projects/opengraph-image" },
  { path: routes.blog, title: "Blog", image: "/blog/opengraph-image" },
  { path: routes.comedy, title: "Comedy", image: "/comedy/opengraph-image" },
  ...projects.map((project) => ({
    path: routes.projectDetail(project.slug),
    title: project.title,
    image: `${routes.projectDetail(project.slug)}/opengraph-image`,
  })),
  ...getAllPosts().map((post) => ({
    path: routes.blogPost(post.slug),
    title: post.title,
    image: `${routes.blogPost(post.slug)}/opengraph-image`,
  })),
  ...getAllTags().map((tag) => ({
    path: routes.blogTag(tag.slug),
    title: `${tag.name} — Blog`,
    image: `${routes.blogTag(tag.slug)}/opengraph-image`,
  })),
];

test.use({ javaScriptEnabled: false, userAgent: "WhatsApp/2.24.1" });

for (const entry of pages) {
  test(`shares ${entry.path} without JavaScript`, async ({ page, request }) => {
    const response = await page.goto(entry.path);
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle(
      entry.path === routes.home ? entry.title : `${entry.title} — Miguel Casillas`,
    );
    const meta = (key: string) =>
      page.locator(`head meta[property="${key}"], head meta[name="${key}"]`);
    await expect(meta("og:title")).toHaveAttribute("content", entry.title);
    await expect(meta("twitter:title")).toHaveAttribute("content", entry.title);
    await expect(meta("og:url")).toHaveAttribute("content", absoluteUrl(entry.path));
    await expect(meta("og:site_name")).toHaveAttribute("content", "elOpenMike");
    await expect(meta("og:description")).toHaveAttribute("content", /.+/);
    await expect(meta("twitter:card")).toHaveAttribute("content", "summary_large_image");
    await expect(page.locator('head link[rel="canonical"]'))
      .toHaveAttribute("href", absoluteUrl(entry.path));

    const imageUrl = await meta("og:image").getAttribute("content");
    expect(imageUrl).toBeTruthy();
    const image = new URL(imageUrl!);
    expect(image.origin).toBe(absoluteUrl(routes.home));
    expect(image.pathname).toBe(entry.image);
    await expect(meta("twitter:image")).toHaveAttribute("content", image.href);
    await expect(meta("og:image:alt")).toHaveAttribute("content", /.+/);

    // Request the exact advertised path/query from the standalone build, not production.
    const imageResponse = await request.get(image.pathname + image.search);
    expect(imageResponse.status()).toBe(200);
    expect(imageResponse.headers()["content-type"]).toContain("image/png");
    const bytes = await imageResponse.body();
    expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(bytes.readUInt32BE(16)).toBe(1200);
    expect(bytes.readUInt32BE(20)).toBe(630);
    expect(bytes.length).toBeLessThan(300 * 1024);
  });
}

test("does not generate previews for missing content", async ({ request }) => {
  for (const prefix of [routes.projects, routes.blog, "/blog/tag"]) {
    expect((await request.get(`${prefix}/not-a-published-slug/opengraph-image`)).status()).toBe(404);
  }
});

test("does not canonicalize a 404 to the homepage", async ({ page }) => {
  expect((await page.goto("/not-a-published-page"))?.status()).toBe(404);
  await expect(page.locator('head link[rel="canonical"]')).toHaveCount(0);
  await expect(page.locator('head meta[property="og:url"]')).toHaveCount(0);
});
