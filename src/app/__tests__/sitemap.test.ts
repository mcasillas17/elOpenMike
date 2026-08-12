import { describe, it, expect } from "vitest";
import sitemap from "@/app/sitemap";
import { getAllPosts, getAllTags } from "@/lib/blog";

describe("sitemap", () => {
  it("includes the core static routes, projects, and posts", () => {
    const urls = sitemap().map((e) => e.url);
    expect(urls).toContain("https://elopenmike.com");
    expect(urls).toContain("https://elopenmike.com/blog");
    expect(
      urls.some((u) => u.startsWith("https://elopenmike.com/projects/")),
    ).toBe(true);
    expect(
      urls.some((u) => u.startsWith("https://elopenmike.com/blog/")),
    ).toBe(true);
  });

  // <lastmod> is the post's revision date where it has one, falling back to its
  // publication date. Asserting `date` alone passed only while no post carried
  // an `updated` — which stopped being true the first time a post synced from
  // Notion. See sitemap-revised.test.ts for the fixture-driven cases.
  it("uses each post's effective modification date for its blog url", () => {
    const entries = sitemap();
    for (const post of getAllPosts()) {
      const entry = entries.find(
        (e) => e.url === `https://elopenmike.com/blog/${post.slug}`,
      );
      expect(entry).toBeDefined();
      expect(entry?.lastModified).toEqual(new Date(post.updated || post.date));
    }
  });

  it("includes a url for every tag page", () => {
    const urls = sitemap().map((e) => e.url);
    for (const tag of getAllTags()) {
      expect(urls).toContain(`https://elopenmike.com/blog/tag/${tag.slug}`);
    }
  });

  it("uses a stable site-updated stamp for static and project entries (not Date.now)", () => {
    const before = new Date();
    const entries = sitemap();
    const after = new Date();
    const staticEntry = entries.find(
      (e) => e.url === "https://elopenmike.com",
    );
    expect(staticEntry?.lastModified).toBeInstanceOf(Date);
    // The stamp should NOT fall inside the call window (i.e., not Date.now()).
    // If it does, callers would see the date change on every build.
    const stamp = staticEntry?.lastModified as Date;
    const inWindow =
      stamp.getTime() >= before.getTime() &&
      stamp.getTime() <= after.getTime();
    expect(inWindow).toBe(false);
  });
});
