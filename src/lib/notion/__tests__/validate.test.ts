import { describe, it, expect } from "vitest";
import { validatePosts, type ValidatablePost } from "@/lib/notion/validate";

const ok: ValidatablePost = {
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

  it("rejects an empty title", () => {
    expect(validatePosts([withFm({ title: "  " })])).toEqual([
      "a-good-post: title is empty",
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

  it("rejects duplicate slugs, naming the slug once", () => {
    const errors = validatePosts([ok, { ...ok, body: "Other.\n" }]);
    expect(errors).toEqual(["a-good-post: duplicate slug (2 posts share it)"]);
  });

  it("rejects an empty body", () => {
    expect(validatePosts([{ ...ok, body: "  \n" }])[0]).toContain("body");
  });

  it("accumulates every error rather than stopping at the first", () => {
    const broken: ValidatablePost = {
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
