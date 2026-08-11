import { describe, it, expect } from "vitest";
import { buildFeedXml } from "@/app/feed.xml/route";
import { getAllPosts, type PostMeta } from "@/lib/blog";

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

// A feed reader parses this with an XML parser, and an XML parser's answer to
// an ill-formed document is to drop the whole feed. Titles, excerpts and tag
// names are free text out of a Notion property, so the feed is parsed here with
// a real parser rather than pattern-matched: escaping five entities was never
// enough, because a character XML 1.0 forbids cannot appear in a document at
// all — not raw, and not as a numeric reference either.
describe("buildFeedXml well-formedness", () => {
  const parse = (xml: string) =>
    new DOMParser().parseFromString(xml, "application/xml");

  const parserError = (xml: string) =>
    parse(xml).querySelector("parsererror")?.textContent ?? undefined;

  const post = (over: Partial<PostMeta> = {}): PostMeta => ({
    slug: "a-post",
    title: "A title",
    date: "2026-05-20",
    excerpt: "An excerpt.",
    tags: ["AI"],
    readingMinutes: 1,
    ...over,
  });

  const hostile = [
    ["a NUL", "\u0000"],
    ["a C0 control", "\u0001\u0008\u000b\u000c\u001f"],
    ["DEL and a C1 control", "\u007f\u0085\u009f"],
    ["a noncharacter", "\ufffe\uffff\ufdd0"],
    ["a lone high surrogate", "\ud800"],
    ["a lone low surrogate", "\udfff"],
  ] as const;

  it.each(hostile)("parses with %s in the title", (_name, junk) => {
    const xml = buildFeedXml([post({ title: `A${junk}B` })]);

    expect(parserError(xml)).toBeUndefined();
    expect(parse(xml).querySelector("item > title")?.textContent).toBe("AB");
  });

  it.each(hostile)("parses with %s in the excerpt", (_name, junk) => {
    const xml = buildFeedXml([post({ excerpt: `A${junk}B` })]);

    expect(parserError(xml)).toBeUndefined();
    expect(parse(xml).querySelector("item > description")?.textContent).toBe(
      "AB",
    );
  });

  it.each(hostile)("parses with %s in a tag", (_name, junk) => {
    const xml = buildFeedXml([post({ tags: [`A${junk}B`, "AI"] })]);

    expect(parserError(xml)).toBeUndefined();
    expect(
      [...parse(xml).querySelectorAll("item > category")].map(
        (node) => node.textContent,
      ),
    ).toEqual(["AB", "AI"]);
  });

  it("keeps the whitespace XML allows and the Unicode it does not object to", () => {
    const xml = buildFeedXml([
      post({
        title: "Tabs\tand\nlines",
        excerpt: "Grüße 日本語 🙂 ∑",
        tags: ["C++ & friends"],
      }),
    ]);

    expect(parserError(xml)).toBeUndefined();
    const doc = parse(xml);
    expect(doc.querySelector("item > title")?.textContent).toBe(
      "Tabs\tand\nlines",
    );
    expect(doc.querySelector("item > description")?.textContent).toBe(
      "Grüße 日本語 🙂 ∑",
    );
    expect(doc.querySelector("item > category")?.textContent).toBe(
      "C++ & friends",
    );
  });

  it("parses with everything hostile at once, across several posts", () => {
    const xml = buildFeedXml([
      post({
        slug: "one",
        title: "\u0000<script>alert(1)</script>",
        excerpt: "He said \"hi\" & left\u0007",
        tags: ["\ud800tag", "a & b"],
      }),
      post({ slug: "two", title: "\ufffe", excerpt: "\u009f", tags: [] }),
    ]);

    expect(parserError(xml)).toBeUndefined();
    const doc = parse(xml);
    expect(doc.querySelectorAll("item")).toHaveLength(2);
    expect(doc.querySelector("item > title")?.textContent).toBe(
      "<script>alert(1)</script>",
    );
    expect(xml).not.toContain("<script>");
  });

  it("escapes a link built from a slug that carries an ampersand", () => {
    const xml = buildFeedXml([post({ slug: "a&b" })]);

    expect(parserError(xml)).toBeUndefined();
    expect(parse(xml).querySelector("item > link")?.textContent).toBe(
      "https://elopenmike.com/blog/a&b",
    );
  });

  it("stays well-formed for the posts actually on disk", () => {
    expect(parserError(buildFeedXml(getAllPosts()))).toBeUndefined();
  });
});
