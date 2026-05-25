import { describe, it, expect } from "vitest";
import { getAllPosts, getPostSlugs, getPost } from "@/lib/blog";

describe("blog loader", () => {
  it("lists posts newest-first with full metadata", () => {
    const posts = getAllPosts();
    expect(posts.length).toBeGreaterThanOrEqual(2);
    for (const p of posts) {
      expect(p.slug).toBeTruthy();
      expect(p.title).toBeTruthy();
      expect(p.date).toBeTruthy();
      expect(p.excerpt).toBeTruthy();
      expect(Array.isArray(p.tags)).toBe(true);
      expect(p.readingMinutes).toBeGreaterThan(0);
    }
    for (let i = 1; i < posts.length; i++) {
      expect(posts[i - 1].date >= posts[i].date).toBe(true);
    }
  });

  it("getPostSlugs covers every post", () => {
    expect(getPostSlugs().sort()).toEqual(
      getAllPosts().map((p) => p.slug).sort(),
    );
  });

  it("getPost returns meta + body, undefined for unknown", () => {
    const slug = getAllPosts()[0].slug;
    const post = getPost(slug);
    expect(post?.meta.slug).toBe(slug);
    expect(post?.body).toBeTruthy();
    expect(getPost("nope-not-real")).toBeUndefined();
  });
});
