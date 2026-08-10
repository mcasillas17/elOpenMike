import { describe, it, expect, vi } from "vitest";
import type { PostMeta } from "@/lib/blog";

// The shipped content has no revised posts, so the real loader can never show
// `updated` being honoured. These fixtures make the distinction observable:
// the newest *publication* is older than the newest *revision*.
const posts: PostMeta[] = [
  {
    slug: "newest-published",
    title: "Newest published",
    date: "2026-05-20",
    excerpt: "Never revised.",
    tags: ["AI"],
    readingMinutes: 3,
  },
  {
    slug: "revised",
    title: "Revised long after publishing",
    date: "2026-03-01",
    updated: "2026-06-15",
    excerpt: "Rewritten after the fact.",
    tags: ["AI"],
    readingMinutes: 4,
  },
];

vi.mock("@/lib/blog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/blog")>();
  return {
    ...actual,
    getAllPosts: vi.fn(() => posts),
    getAllTags: vi.fn(() => [{ name: "AI", slug: "ai", count: 2 }]),
  };
});

import sitemap from "@/app/sitemap";

const lastModified = (url: string) =>
  sitemap().find((entry) => entry.url === url)?.lastModified;

describe("sitemap with a revised post", () => {
  it("uses the revision date for a revised post's url", () => {
    expect(lastModified("https://elopenmike.com/blog/revised")).toEqual(
      new Date("2026-06-15"),
    );
  });

  it("still uses the publication date for a post that was never revised", () => {
    expect(lastModified("https://elopenmike.com/blog/newest-published")).toEqual(
      new Date("2026-05-20"),
    );
  });

  it("stamps static routes with the newest effective modification date", () => {
    for (const url of [
      "https://elopenmike.com",
      "https://elopenmike.com/blog",
      "https://elopenmike.com/projects",
      "https://elopenmike.com/comedy",
      "https://elopenmike.com/blog/tag/ai",
    ]) {
      expect(lastModified(url)).toEqual(new Date("2026-06-15"));
    }
  });
});
