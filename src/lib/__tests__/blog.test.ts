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

import {
  getAllTags,
  getPostsByTag,
  getAdjacentPosts,
  tagSlug,
} from "@/lib/blog";

describe("tagSlug", () => {
  it("lowercases and hyphenates tag names", () => {
    expect(tagSlug("Distributed Systems")).toBe("distributed-systems");
    expect(tagSlug("AI")).toBe("ai");
  });
});

describe("getAllTags", () => {
  it("returns each distinct tag once with a count", () => {
    const tags = getAllTags();
    expect(tags.length).toBeGreaterThan(0);
    const slugs = tags.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const tag of tags) {
      expect(tag.count).toBeGreaterThan(0);
      expect(tag.slug).toBe(tagSlug(tag.name));
    }
  });

  it("sorts tags alphabetically for stable output", () => {
    const slugs = getAllTags().map((t) => t.slug);
    expect(slugs).toEqual([...slugs].sort());
  });
});

describe("getPostsByTag", () => {
  it("returns only posts carrying that tag, newest first", () => {
    const tag = getAllTags()[0];
    const posts = getPostsByTag(tag.slug);
    expect(posts.length).toBe(tag.count);
    for (const post of posts) {
      expect(post.tags.map(tagSlug)).toContain(tag.slug);
    }
    for (let i = 1; i < posts.length; i++) {
      expect(new Date(posts[i - 1].date).getTime()).toBeGreaterThanOrEqual(
        new Date(posts[i].date).getTime(),
      );
    }
  });

  it("returns an empty array for an unknown tag", () => {
    expect(getPostsByTag("no-such-tag")).toEqual([]);
  });
});

describe("getAdjacentPosts", () => {
  it("gives the newest post no prev and the oldest no next", () => {
    const posts = getAllPosts();
    expect(getAdjacentPosts(posts[0].slug).prev).toBeUndefined();
    expect(getAdjacentPosts(posts[posts.length - 1].slug).next).toBeUndefined();
  });

  it("links neighbours consistently in both directions", () => {
    const posts = getAllPosts();
    for (let i = 1; i < posts.length; i++) {
      expect(getAdjacentPosts(posts[i].slug).prev?.slug).toBe(posts[i - 1].slug);
      expect(getAdjacentPosts(posts[i - 1].slug).next?.slug).toBe(posts[i].slug);
    }
  });

  it("returns empty for an unknown slug", () => {
    expect(getAdjacentPosts("nope-not-real")).toEqual({});
  });
});

describe("date sorting", () => {
  it("orders by parsed timestamp, not string comparison", () => {
    const posts = getAllPosts();
    for (let i = 1; i < posts.length; i++) {
      expect(new Date(posts[i - 1].date).getTime()).toBeGreaterThanOrEqual(
        new Date(posts[i].date).getTime(),
      );
    }
  });
});
