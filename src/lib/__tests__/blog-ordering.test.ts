import { describe, it, expect, vi, beforeEach } from "vitest";

// The repo's two real posts have distinct dates, so nothing on disk can prove
// how ties are ordered. These fixtures live only in the mocked filesystem, and
// readdir hands them back in reverse-alphabetical order — the order a stable
// sort would preserve if the comparator had no tie-breaker.
const files = new Map<string, string>();

vi.mock("node:fs", () => ({
  default: {
    existsSync: () => true,
    readdirSync: () => [...files.keys()],
    readFileSync: (file: string) => {
      const name = file.split("/").pop() ?? "";
      const contents = files.get(name);
      if (contents === undefined) throw new Error(`ENOENT: ${file}`);
      return contents;
    },
  },
}));

import {
  getAllPosts,
  getAdjacentPosts,
  getPostsByTag,
  getPostSlugs,
  getRelatedPosts,
} from "@/lib/blog";
import { buildFeedXml } from "@/app/feed.xml/route";

function post(slug: string, date: string, tags = ["AI"]): void {
  files.set(
    `${slug}.mdx`,
    [
      "---",
      `title: "Title ${slug}"`,
      `date: "${date}"`,
      `excerpt: "Excerpt ${slug}"`,
      `tags: [${tags.map((tag) => `"${tag}"`).join(", ")}]`,
      "---",
      "",
      `Body of ${slug}.`,
      "",
    ].join("\n"),
  );
}

beforeEach(() => {
  files.clear();
});

describe("posts sharing a date", () => {
  it("orders them by slug so the order never depends on readdir", () => {
    post("zeta", "2026-05-20");
    post("mid", "2026-05-20");
    post("alpha", "2026-05-20");

    expect(getPostSlugs()).toEqual(["zeta", "mid", "alpha"]);
    expect(getAllPosts().map((p) => p.slug)).toEqual(["alpha", "mid", "zeta"]);
  });

  it("still sorts by date first, with the tie-break only inside a date", () => {
    post("zulu", "2026-06-01");
    post("bravo", "2026-05-20");
    post("alpha", "2026-05-20");
    post("yankee", "2026-04-02");

    expect(getAllPosts().map((p) => p.slug)).toEqual([
      "zulu",
      "alpha",
      "bravo",
      "yankee",
    ]);
  });

  it("is stable across repeated calls", () => {
    post("zeta", "2026-05-20");
    post("alpha", "2026-05-20");
    expect(getAllPosts().map((p) => p.slug)).toEqual(
      getAllPosts().map((p) => p.slug),
    );
  });

  it("keeps invalid dates last and still ordered by slug", () => {
    post("valid", "2026-05-20");
    post("zbroken", "not-a-date");
    post("abroken", "");

    expect(getAllPosts().map((p) => p.slug)).toEqual([
      "valid",
      "abroken",
      "zbroken",
    ]);
  });

  it("gives adjacency the same order in both directions", () => {
    post("zeta", "2026-05-20");
    post("mid", "2026-05-20");
    post("alpha", "2026-05-20");

    expect(getAdjacentPosts("mid")).toMatchObject({
      prev: { slug: "alpha" },
      next: { slug: "zeta" },
    });
    expect(getAdjacentPosts("alpha").prev).toBeUndefined();
    expect(getAdjacentPosts("zeta").next).toBeUndefined();
  });

  it("orders tag listings the same way", () => {
    post("zeta", "2026-05-20", ["AI"]);
    post("alpha", "2026-05-20", ["AI"]);
    post("other", "2026-05-20", ["Observability"]);

    expect(getPostsByTag("ai").map((p) => p.slug)).toEqual(["alpha", "zeta"]);
  });

  it("orders the RSS feed the same way", () => {
    post("zeta", "2026-05-20");
    post("alpha", "2026-05-20");

    const xml = buildFeedXml(getAllPosts());
    expect(xml.indexOf("Title alpha")).toBeLessThan(xml.indexOf("Title zeta"));
  });
});

describe("related posts", () => {
  it("ranks shared topics before recency and excludes unrelated posts", () => {
    post("current", "2026-06-01", ["AI", "Distributed Systems"]);
    post("two-topics", "2026-01-01", ["AI", "Distributed Systems"]);
    post("newer-one-topic", "2026-05-20", ["AI"]);
    post("older-one-topic", "2026-04-20", ["Distributed Systems"]);
    post("unrelated", "2026-06-02", ["Observability"]);

    expect(getRelatedPosts("current").map((candidate) => candidate.slug)).toEqual([
      "two-topics",
      "newer-one-topic",
      "older-one-topic",
    ]);
  });

  it("honours its limit and returns empty for unknown posts or zero work", () => {
    post("current", "2026-06-01", ["AI"]);
    post("alpha", "2026-05-20", ["AI"]);
    post("beta", "2026-04-20", ["AI"]);

    expect(getRelatedPosts("current", 1).map((candidate) => candidate.slug)).toEqual([
      "alpha",
    ]);
    expect(getRelatedPosts("current", 0)).toEqual([]);
    expect(getRelatedPosts("missing")).toEqual([]);
  });
});
