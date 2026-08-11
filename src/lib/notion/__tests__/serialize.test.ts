import { describe, it, expect } from "vitest";
import matter from "gray-matter";
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

  it("normalizes every line ending and collapses trailing blank lines", () => {
    const out = serializePost(fm, "a\r\nb\rc\n\n\n");
    expect(out.endsWith("a\nb\nc\n")).toBe(true);
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

  // The value carried over is whatever the file on disk says, and a file can be
  // hand-edited. `updated` is published as the sitemap's <lastmod> and the
  // article's dateModified, so one that is not a date is one a crawler is
  // handed — and, because the content matches, it is preserved every run after
  // that too. The sync's own value is a real day, so it is the safe answer.
  it.each(["", "  ", "yesterday", "2026-13-01", "2026-02-31", "2026-8-3"])(
    "refuses to carry over %s and uses Notion's day instead",
    (existing) => {
      expect(resolveUpdated("2026-08-03", existing)).toBe("2026-08-03");
    },
  );
});

// gray-matter splits the frontmatter block on a literal `---` line before YAML
// ever sees it, and YAML folds a newline inside a double-quoted scalar into a
// space. A Notion title pasted with a line break therefore either corrupted the
// value or destroyed the whole file — and Notion property values are free text.
describe("serializePost hostile frontmatter values", () => {
  const roundTrip = (frontmatter: PostFrontmatter, body: string) => {
    const file = serializePost(frontmatter, body);
    const parsed = matter(file);
    return { file, data: parsed.data, content: parsed.content };
  };

  it("round-trips a value containing a newline", () => {
    const title = "Line one\nLine two";
    const { data, content } = roundTrip({ ...fm, title }, "Body.\n");
    expect(data.title).toBe(title);
    expect(content.trim()).toBe("Body.");
  });

  it("round-trips a value that closes the frontmatter block", () => {
    const excerpt = 'boom\n---\ntitle: "pwned"\n---\ninjected body';
    const { data, content } = roundTrip({ ...fm, excerpt }, "Body.\n");
    expect(data.excerpt).toBe(excerpt);
    expect(data.title).toBe(fm.title);
    expect(content.trim()).toBe("Body.");
  });

  it("round-trips a value that mimics another frontmatter key", () => {
    const title = 'x"\nupdated: "1999-01-01';
    const { data } = roundTrip({ ...fm, title }, "Body.\n");
    expect(data.title).toBe(title);
    expect(data.updated).toBe(fm.updated);
  });

  it("round-trips control characters, tabs, and CR", () => {
    const excerpt = "tab\there\rcarriage\u0000null\u001bescape\u007fdel";
    const { file, data } = roundTrip({ ...fm, excerpt }, "Body.\n");
    expect(data.excerpt).toBe(excerpt);
    // No raw control character survives into the file.
    expect(/[\u0000-\u0008\u000b-\u001f\u007f]/.test(file)).toBe(false);
  });

  it("round-trips the unicode line separators that break JS parsers", () => {
    const excerpt = "before\u2028middle\u2029after";
    const { file, data } = roundTrip({ ...fm, excerpt }, "Body.\n");
    expect(data.excerpt).toBe(excerpt);
    expect(file).not.toContain("\u2028");
    expect(file).not.toContain("\u2029");
  });

  it("round-trips hostile tag names", () => {
    const tags = ['tag "quoted"', "tag\nbreak", "tag\\slash", "tag: colon"];
    const { data } = roundTrip({ ...fm, tags }, "Body.\n");
    expect(data.tags).toEqual(tags);
  });

  it("keeps emoji and accents literal rather than escaping them", () => {
    const title = "Café ☕ — naïve";
    const { file, data } = roundTrip({ ...fm, title }, "Body.\n");
    expect(data.title).toBe(title);
    expect(file).toContain(title);
  });

  it("stays byte-identical across runs for a hostile value", () => {
    const hostile = { ...fm, title: "a\nb\u0007c\u2028d" };
    expect(serializePost(hostile, "Body.\n")).toBe(
      serializePost(hostile, "Body.\n"),
    );
  });

  it("leaves the body untouched even when it contains a fence or ---", () => {
    const body = "---\n\n```md\n---\ntitle: not frontmatter\n---\n```\n";
    const { data, content } = roundTrip(fm, body);
    expect(data.title).toBe(fm.title);
    expect(content.trimStart()).toBe(body.replace(/\n+$/, "\n"));
  });
});

// A newline in a title used to split into extra frontmatter lines, so a value
// beginning with `updated: ` would be dropped by the projection and make two
// different posts look identical.
describe("contentProjection with hostile values", () => {
  it("distinguishes posts whose values merely look like an updated line", () => {
    const a = serializePost({ ...fm, title: 'x\nupdated: "2099-01-01"' }, "B.\n");
    const b = serializePost({ ...fm, title: "x" }, "B.\n");
    expect(contentProjection(a)).not.toBe(contentProjection(b));
  });
});

// The projection dropped every line in the file that began `updated: `, body
// included — so a post could rewrite that line and still project identically to
// the version on disk. `updated` is a frontmatter key; only the frontmatter
// block may be read for it, and the body has to survive byte for byte.
describe("contentProjection outside the frontmatter", () => {
  it("sees a body line that only looks like frontmatter", () => {
    const a = serializePost(fm, 'Prose.\nupdated: "new content"\n');
    const b = serializePost(fm, "Prose.\n");
    expect(contentProjection(a)).not.toBe(contentProjection(b));
  });

  it("keeps the body byte for byte", () => {
    const body = 'updated: "new content"\nupdated: "and more"\n';
    expect(contentProjection(serializePost(fm, body))).toContain(body);
  });

  it("still ignores the real updated line", () => {
    const body = 'updated: "new content"\n';
    expect(contentProjection(serializePost(fm, body))).toBe(
      contentProjection(serializePost({ ...fm, updated: "2099-01-01" }, body)),
    );
  });

  it("leaves a file with no frontmatter alone", () => {
    const raw = 'updated: "hand written"\nBody.\n';
    expect(contentProjection(raw)).toBe(raw);
  });

  it("leaves an unterminated frontmatter block alone", () => {
    const raw = '---\ntitle: "x"\nupdated: "2026-01-01"\n';
    expect(contentProjection(raw)).toBe(raw);
  });
});
