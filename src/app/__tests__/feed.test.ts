import { describe, it, expect } from "vitest";
import { buildFeedXml } from "@/app/feed.xml/route";
import { getAllPosts } from "@/lib/blog";

describe("buildFeedXml", () => {
  const xml = () => buildFeedXml(getAllPosts());

  it("declares an RSS 2.0 channel with the atom self link", () => {
    const out = xml();
    expect(out.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(out).toContain('<rss version="2.0"');
    expect(out).toContain('xmlns:atom="http://www.w3.org/2005/Atom"');
    expect(out).toContain(
      '<atom:link href="https://elopenmike.com/feed.xml" rel="self" type="application/rss+xml"/>',
    );
  });

  it("emits one item per post with an absolute link and guid", () => {
    const posts = getAllPosts();
    const out = xml();
    expect(out.split("<item>").length - 1).toBe(posts.length);
    for (const post of posts) {
      const url = `https://elopenmike.com/blog/${post.slug}`;
      expect(out).toContain(`<link>${url}</link>`);
      expect(out).toContain(`<guid isPermaLink="true">${url}</guid>`);
    }
  });

  it("formats pubDate as RFC 822", () => {
    const out = xml();
    const match = out.match(/<pubDate>([^<]+)<\/pubDate>/);
    expect(match).not.toBeNull();
    expect(match![1]).toMatch(/^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} /);
  });

  it("escapes XML-significant characters in titles and descriptions", () => {
    const out = buildFeedXml([
      {
        slug: "x",
        title: "A & B <tag>",
        date: "2026-05-20",
        excerpt: 'He said "hi"',
        tags: [],
        readingMinutes: 1,
      },
    ]);
    expect(out).toContain("<title>A &amp; B &lt;tag&gt;</title>");
    expect(out).toContain("<description>He said &quot;hi&quot;</description>");
    expect(out).not.toContain("<tag>");
  });

  it("handles an empty post list without emitting items", () => {
    const out = buildFeedXml([]);
    expect(out).toContain("<channel>");
    expect(out).not.toContain("<item>");
  });
});

import { metadata as homeMetadata } from "@/app/page";
import { metadata as blogMetadata } from "@/app/blog/page";
import { alternatesFor, routes } from "@/lib/site";

// Next merges metadata per top-level key: a page exporting
// `alternates: { canonical }` replaces the layout's `alternates` outright, so
// declaring the feed only in the layout loses autodiscovery on every real page.
describe("feed autodiscovery", () => {
  const feedUrls = (alternates: {
    types?: { [type: string]: unknown };
  }): unknown =>
    (
      alternates.types?.["application/rss+xml"] as
        | { url: string }[]
        | undefined
    )?.map((entry) => entry.url);

  it("keeps the feed on pages that also declare a canonical", () => {
    for (const metadata of [homeMetadata, blogMetadata]) {
      expect(metadata.alternates?.canonical).toBeTruthy();
      expect(feedUrls(metadata.alternates ?? {})).toEqual([routes.feed]);
    }
  });

  it("alternatesFor pairs a canonical with the feed", () => {
    expect(alternatesFor("/x")).toEqual({
      canonical: "/x",
      types: {
        "application/rss+xml": [
          { url: routes.feed, title: "Miguel Casillas — Blog" },
        ],
      },
    });
  });
});
