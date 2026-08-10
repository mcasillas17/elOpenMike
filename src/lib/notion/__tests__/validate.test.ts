import { describe, it, expect } from "vitest";
import {
  validatePosts,
  validateSourceSlugs,
  type ValidatablePost,
} from "@/lib/notion/validate";

const ok: ValidatablePost = {
  pageId: "page-good",
  slug: "a-good-post",
  frontmatter: {
    title: "A good post",
    date: "2026-05-20",
    excerpt: "A short summary.",
    tags: ["AI"],
    updated: "2026-05-20",
  },
  body: "Real content.\n",
};

const withFm = (
  over: Partial<ValidatablePost["frontmatter"]>,
): ValidatablePost => ({
  ...ok,
  frontmatter: { ...ok.frontmatter, ...over },
});

describe("validatePosts", () => {
  it("returns no errors for a valid post", () => {
    expect(validatePosts([ok])).toEqual([]);
  });

  // Named by the page it came off rather than by its slug: a slug is a value
  // somebody typed into a property, and these lines are printed into a public
  // log. See the note in validate.ts.
  it("rejects an empty title, naming the page it is on", () => {
    expect(validatePosts([withFm({ title: "  " })])).toEqual([
      "page page-good: title is empty",
    ]);
  });

  it("rejects a missing or unparseable date", () => {
    expect(validatePosts([withFm({ date: "" })])[0]).toContain("date");
    expect(validatePosts([withFm({ date: "May 20, 2026" })])[0]).toContain(
      "date",
    );
    expect(validatePosts([withFm({ date: "2026-02-31" })])[0]).toContain("date");
  });

  it("rejects an empty excerpt", () => {
    expect(validatePosts([withFm({ excerpt: "" })])[0]).toContain("excerpt");
  });

  it("rejects an excerpt over 200 characters", () => {
    expect(validatePosts([withFm({ excerpt: "x".repeat(201) })])[0]).toContain(
      "excerpt",
    );
  });

  it("rejects an invalid slug", () => {
    expect(validatePosts([{ ...ok, slug: "Not A Slug" }])[0]).toContain("slug");
  });

  it("rejects two pages on one slug, naming the pages and not the slug", () => {
    const errors = validatePosts([
      ok,
      { ...ok, pageId: "page-other", body: "Other.\n" },
    ]);

    expect(errors).toEqual([
      "2 posts share one slug (pages page-good, page-other)",
    ]);
  });

  it("reads the same page twice in one query as one post", () => {
    expect(validatePosts([ok, { ...ok, body: "Other.\n" }])).toEqual([]);
  });

  it("rejects an empty body", () => {
    expect(validatePosts([{ ...ok, body: "  \n" }])[0]).toContain("body");
  });

  it("accumulates every error rather than stopping at the first", () => {
    const broken: ValidatablePost = {
      pageId: "page-broken",
      slug: "BAD SLUG",
      frontmatter: {
        title: "",
        date: "nope",
        excerpt: "",
        tags: [],
        updated: "",
      },
      body: "",
    };
    expect(validatePosts([broken]).length).toBeGreaterThanOrEqual(5);
  });
});

// Notion multi-selects are free-form. tagSlug()/slugify() strip everything
// outside [a-z0-9], so an emoji or CJK tag collapses to "" and every chip for
// it renders href="/blog/tag/" — a 404 on every listing and post page, plus a
// 404 url in the sitemap. Two tags that collapse to the same slug silently
// merge onto one page. Catch both before anything is written.
describe("validatePosts tags", () => {
  it("accepts tags that produce a usable slug", () => {
    expect(validatePosts([withFm({ tags: ["AI", "Distributed Systems"] })])).toEqual(
      [],
    );
  });

  it("rejects a tag that slugifies to nothing", () => {
    for (const tag of ["🔥", "日本語", "—"]) {
      const errors = validatePosts([withFm({ tags: [tag] })]);
      expect(errors.length).toBe(1);
      expect(errors[0]).toContain("tag");
    }
  });

  it("rejects distinct tags that collapse onto the same slug", () => {
    const errors = validatePosts([
      {
        ...ok,
        pageId: "page-a",
        slug: "a",
        frontmatter: { ...ok.frontmatter, tags: ["C++"] },
      },
      {
        ...ok,
        pageId: "page-b",
        slug: "b",
        frontmatter: { ...ok.frontmatter, tags: ["C#"] },
      },
    ]);
    expect(errors.length).toBe(1);
    // The names are what has to change and exactly what may not be printed;
    // the pages carrying them are where they can be read.
    expect(errors[0]).toContain("page-a");
    expect(errors[0]).toContain("page-b");
    expect(errors[0]).not.toMatch(/C\+\+|C#/);
  });

  it("rejects duplicate tags within one post, by position", () => {
    const errors = validatePosts([withFm({ tags: ["AI", "AI"] })]);

    expect(errors.join("\n")).toMatch(/tag #2/);
    expect(errors.join("\n")).not.toContain("AI");
  });

  it("accepts 100 tags and rejects 101", () => {
    const hundred = Array.from({ length: 100 }, (_, index) => `tag-${index}`);

    expect(validatePosts([withFm({ tags: hundred })])).toEqual([]);
    expect(
      validatePosts([withFm({ tags: [...hundred, "tag-100"] })]).join("\n"),
    ).toMatch(/101.*100|100.*101/);
  });

  it("does not flag the same tag reused across posts", () => {
    expect(
      validatePosts([
        { ...ok, slug: "a", frontmatter: { ...ok.frontmatter, tags: ["AI"] } },
        { ...ok, slug: "b", frontmatter: { ...ok.frontmatter, tags: ["AI"] } },
      ]),
    ).toEqual([]);
  });
});

// validatePosts only ever sees the posts that *rendered*, so two distinct
// Notion pages claiming one slug are invisible to it the moment one of them
// fails: the survivor silently overwrites the other page's file, and the file
// on disk carries no page id to tell them apart afterwards. The collision is
// therefore caught on the page metadata, before a single block is fetched.
describe("validateSourceSlugs", () => {
  it("accepts pages with distinct slugs", () => {
    expect(
      validateSourceSlugs([
        { pageId: "page-a", slug: "first" },
        { pageId: "page-b", slug: "second" },
      ]),
    ).toEqual([]);
  });

  it("rejects two distinct pages claiming one slug, naming both", () => {
    const errors = validateSourceSlugs([
      { pageId: "page-a", slug: "dup" },
      { pageId: "page-b", slug: "dup" },
    ]);

    expect(errors).toHaveLength(1);
    expect(errors[0]).not.toContain("dup");
    expect(errors[0]).toContain("page-a");
    expect(errors[0]).toContain("page-b");
  });

  it("reports every colliding slug once, sorted", () => {
    const errors = validateSourceSlugs([
      { pageId: "page-a", slug: "zeta" },
      { pageId: "page-b", slug: "zeta" },
      { pageId: "page-c", slug: "alpha" },
      { pageId: "page-d", slug: "alpha" },
      { pageId: "page-e", slug: "alpha" },
    ]);

    // Sorted by the slug they collide on, which is not itself printed: the
    // pages are, and they are what an author opens.
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain("page-c, page-d, page-e");
    expect(errors[1]).toContain("page-a, page-b");
    expect(errors.join("\n")).not.toMatch(/alpha|zeta/);
  });

  it("tolerates the same page appearing twice in one query", () => {
    expect(
      validateSourceSlugs([
        { pageId: "page-a", slug: "dup" },
        { pageId: "page-a", slug: "dup" },
      ]),
    ).toEqual([]);
  });

  it("has nothing to say about an empty result set", () => {
    expect(validateSourceSlugs([])).toEqual([]);
  });
});
