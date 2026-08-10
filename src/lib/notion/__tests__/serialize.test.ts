import { describe, it, expect } from "vitest";
import {
  serializePost,
  contentProjection,
  resolveUpdated,
} from "@/lib/notion/serialize";
import type { PostFrontmatter } from "@/lib/notion/types";

const fm: PostFrontmatter = {
  title: "Grounding agents",
  date: "2026-05-20",
  excerpt: "Why retrieval beats prompt-stuffing.",
  tags: ["AI", "Distributed Systems"],
  updated: "2026-06-01",
};

describe("serializePost", () => {
  it("writes frontmatter keys in a fixed order with one trailing newline", () => {
    expect(serializePost(fm, "Body text.\n")).toBe(
      [
        "---",
        'title: "Grounding agents"',
        'date: "2026-05-20"',
        'excerpt: "Why retrieval beats prompt-stuffing."',
        'tags: ["AI", "Distributed Systems"]',
        'updated: "2026-06-01"',
        "---",
        "",
        "Body text.",
        "",
      ].join("\n"),
    );
  });

  it("escapes double quotes and backslashes in string values", () => {
    const out = serializePost({ ...fm, title: 'He said "hi" \\ bye' }, "x\n");
    expect(out).toContain('title: "He said \\"hi\\" \\\\ bye"');
  });

  it("emits an empty array for no tags", () => {
    expect(serializePost({ ...fm, tags: [] }, "x\n")).toContain("tags: []");
  });

  it("normalizes CRLF and collapses trailing blank lines", () => {
    const out = serializePost(fm, "a\r\nb\n\n\n");
    expect(out.endsWith("a\nb\n")).toBe(true);
    expect(out).not.toContain("\r");
  });
});

describe("contentProjection", () => {
  it("ignores the updated line so it can compare on content alone", () => {
    const a = serializePost(fm, "Body.\n");
    const b = serializePost({ ...fm, updated: "2099-01-01" }, "Body.\n");
    expect(a).not.toBe(b);
    expect(contentProjection(a)).toBe(contentProjection(b));
  });

  it("still distinguishes real content changes", () => {
    const a = serializePost(fm, "Body.\n");
    const b = serializePost(fm, "Different body.\n");
    expect(contentProjection(a)).not.toBe(contentProjection(b));
  });

  it("distinguishes frontmatter changes other than updated", () => {
    const a = serializePost(fm, "Body.\n");
    const b = serializePost({ ...fm, title: "Other" }, "Body.\n");
    expect(contentProjection(a)).not.toBe(contentProjection(b));
  });
});

describe("resolveUpdated", () => {
  it("keeps the existing value when content is unchanged", () => {
    expect(resolveUpdated("2026-08-03", "2026-06-01")).toBe("2026-06-01");
  });

  it("uses the new value when there is no existing file", () => {
    expect(resolveUpdated("2026-08-03", undefined)).toBe("2026-08-03");
  });
});
