import { describe, expect, it } from "vitest";
import { blocksToMarkdown } from "@/lib/notion/blocks-to-md";
import { describeUrlSafely, redactUrl } from "@/lib/notion/safe-url";
import { redactUrl as reExported } from "@/lib/notion/image-url";
import { block, rt } from "./fixtures/blocks";

// The sync's warnings are printed to a public GitHub Actions log, and a Notion
// link is whatever an author pasted. So a warning that quoted the url in full
// published it: a signed file url with its X-Amz-Signature and
// X-Amz-Security-Token, a preview link carrying an API key in its query, a
// `javascript:` url carrying a session token, an internal hostname nobody meant
// to say out loud. The post itself is not the problem — it is public by
// definition — but the *urls the sync refuses* are exactly the odd ones, and
// the log is read by anyone with the repo url.
//
// The images half of the sync already learned this and prints origin + path
// only. A link the converter refuses needs less than that: what matters is
// which block it was in and what kind of url it was, and neither of those is
// the url. So the warning names the block and the scheme, and stops there.

const warningsFor = (blocks: Parameters<typeof blocksToMarkdown>[0]) => {
  const warnings: string[] = [];
  blocksToMarkdown(blocks, {
    imagePath: (id) => `/images/${id}.png`,
    onWarning: (message) => warnings.push(message),
  });
  return warnings;
};

const paragraphLinking = (href: string) =>
  block("paragraph", { rich_text: [rt("click me", { href })] });

const SECRETS = [
  "X-Amz-Signature",
  "sekrit",
  "hunter2",
  "token=abc123",
  "internal.corp",
  "/very/private/path",
  "#fragment-secret",
];

describe("describeUrlSafely", () => {
  it("says the scheme and nothing else", () => {
    expect(describeUrlSafely("javascript:alert(1)")).toBe('scheme "javascript:"');
    expect(describeUrlSafely("data:text/html;base64,PHNjcmlwdD4=")).toBe(
      'scheme "data:"',
    );
    expect(describeUrlSafely("vbscript:msgbox(1)")).toBe('scheme "vbscript:"');
  });

  it("normalizes the case a scheme was written in", () => {
    expect(describeUrlSafely("JavaScript:alert(1)")).toBe('scheme "javascript:"');
  });

  // Browsers strip ASCII whitespace and control characters before reading a
  // scheme, so "java\nscript:" runs as javascript — and has to be named as it.
  it("reads the scheme a browser would, not the one as typed", () => {
    expect(describeUrlSafely("java\nscript:alert(1)")).toBe(
      'scheme "javascript:"',
    );
    expect(describeUrlSafely(" \t javascript:alert(1)")).toBe(
      'scheme "javascript:"',
    );
  });

  it("says so when there is no scheme at all", () => {
    expect(describeUrlSafely("/blog/a-post")).toMatch(/no scheme/);
    expect(describeUrlSafely("")).toMatch(/no scheme/);
  });

  it("keeps nothing of a url but its scheme", () => {
    const described = describeUrlSafely(
      "javascript:fetch('https://internal.corp/very/private/path?token=abc123#fragment-secret')",
    );

    for (const secret of SECRETS) expect(described).not.toContain(secret);
    expect(described).toBe('scheme "javascript:"');
  });

  it("says nothing about credentials, host, path, query or fragment", () => {
    const described = describeUrlSafely(
      "https://user:hunter2@internal.corp/very/private/path?token=abc123#fragment-secret",
    );

    for (const secret of SECRETS) expect(described).not.toContain(secret);
    expect(described).toBe('scheme "https:"');
  });

  it("refuses to repeat something too long to be a scheme", () => {
    const described = describeUrlSafely(`${"a".repeat(500)}:payload`);

    expect(described).not.toContain("aaaaaaaaaa");
    expect(described.length).toBeLessThan(80);
  });

  // A url with credentials and no scheme — "user:password@host/path" — puts the
  // username exactly where a scheme goes, and it is precisely the shape the
  // converter refuses, so it is precisely the shape that reaches a log. A token
  // that is not a scheme anyone has registered is not repeated at all.
  it.each([
    "notion-svc-acct:S3cretP4ss@internal.corp/very/private/path",
    "AKIAIOSFODNN7EXAMPLE:wJalrXUtn@s3.amazonaws.com/very/private/path",
    "sekrit:hunter2@internal.corp",
  ])("never mistakes the credentials in %s for a scheme", (url) => {
    const described = describeUrlSafely(url);

    for (const piece of [
      "notion-svc-acct",
      "S3cretP4ss",
      "AKIAIOSFODNN7EXAMPLE",
      "wJalrXUtn",
      "sekrit",
      "hunter2",
      "internal.corp",
    ]) {
      expect(described.toLowerCase()).not.toContain(piece.toLowerCase());
    }
    expect(described).toMatch(/unrecognized|unrecognizable|no scheme/);
  });

  it("still names every scheme a link is actually refused for", () => {
    for (const scheme of ["javascript", "data", "vbscript", "file", "blob"]) {
      expect(describeUrlSafely(`${scheme}:whatever`)).toBe(`scheme "${scheme}:"`);
    }
  });

  it("says nothing it does not recognize, however short", () => {
    expect(describeUrlSafely("zz:payload")).toMatch(/unrecognized|unrecognizable/);
    expect(describeUrlSafely("zz:payload")).not.toContain("zz");
  });

  // redactUrl is the images' rule — origin and path, never the signed query —
  // and lives beside this one so there is one place urls are made loggable.
  it("sits beside the redaction the image downloader already uses", () => {
    expect(redactUrl("https://files.example.com/a.png?X-Amz-Signature=sekrit")).toBe(
      "https://files.example.com/a.png",
    );
    expect(reExported).toBe(redactUrl);
  });
});

describe("an inline link the converter refuses", () => {
  const href =
    "javascript:fetch('https://internal.corp/very/private/path?token=abc123#fragment-secret')";

  it("says which block and what kind of url, and no more", () => {
    const [warning, ...rest] = warningsFor([paragraphLinking(href)]);

    expect(rest).toEqual([]);
    expect(warning).toContain("paragraph");
    expect(warning).toContain(paragraphLinking(href).id);
    expect(warning).toContain('scheme "javascript:"');
    for (const secret of SECRETS) expect(warning).not.toContain(secret);
  });

  it("never prints the url, in any block that carries inline text", () => {
    const blocks = [
      paragraphLinking(href),
      block("heading_2", { rich_text: [rt("h", { href })] }),
      block("bulleted_list_item", { rich_text: [rt("li", { href })] }),
      block("quote", { rich_text: [rt("q", { href })] }),
      block("callout", { rich_text: [rt("c", { href })] }),
      block("table", { has_column_header: false }, [
        block("table_row", { cells: [[rt("cell", { href })]] }),
      ]),
      block("image", {
        type: "file",
        file: { url: "https://s3/signed" },
        caption: [rt("alt", { href })],
      }),
    ];

    const warnings = warningsFor(blocks);

    expect(warnings.length).toBeGreaterThanOrEqual(7);
    for (const warning of warnings) {
      for (const secret of SECRETS) expect(warning).not.toContain(secret);
      expect(warning).toContain('scheme "javascript:"');
    }
  });

  it("names the block a nested link is really in", () => {
    const inner = paragraphLinking(href);
    const warnings = warningsFor([
      block("toggle", { rich_text: [rt("More")] }, [inner]),
    ]);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(inner.id);
    expect(warnings[0].split(":")[0]).toBe("paragraph block " + inner.id.split(":")[0]);
  });
});

describe("a link whose credentials sit where a scheme goes", () => {
  const href = "notion-svc-acct:S3cretP4ss@internal.corp/very/private/path";

  it("says nothing about them inline", () => {
    const [warning] = warningsFor([paragraphLinking(href)]);

    expect(warning).not.toContain("S3cretP4ss");
    expect(warning).not.toContain("notion-svc-acct");
    expect(warning).not.toContain("internal.corp");
  });

  it("says nothing about them in a bookmark", () => {
    const [warning] = warningsFor([block("bookmark", { url: href, caption: [] })]);

    expect(warning).not.toContain("S3cretP4ss");
    expect(warning).not.toContain("notion-svc-acct");
  });
});

describe("a bookmark or preview the converter refuses", () => {
  const url = "data:text/html;base64,aHR0cHM6Ly9pbnRlcm5hbC5jb3JwLw==";

  it.each(["bookmark", "link_preview"])(
    "says the block and the scheme for a %s",
    (type) => {
      const [warning, ...rest] = warningsFor([
        block(type, { url, caption: [] }),
      ]);

      expect(rest).toEqual([]);
      expect(warning).toContain(type);
      expect(warning).toContain('scheme "data:"');
      expect(warning).not.toContain("aHR0cHM6");
      expect(warning).not.toContain(url);
    },
  );

  it("still writes the url into the post, which is the author's content", () => {
    const markdown = blocksToMarkdown([block("bookmark", { url, caption: [] })], {
      imagePath: () => "",
    });

    expect(markdown).toContain("data:text/html");
  });
});

describe("a block the converter has no markdown for", () => {
  it("says which block it skipped", () => {
    const skipped = block("breadcrumb", {});

    expect(warningsFor([skipped])).toEqual([
      `breadcrumb block ${skipped.id}: skipped unsupported block`,
    ]);
  });
});

describe("links the converter is happy with", () => {
  it.each([
    "https://example.com/a?b=c#d",
    "http://example.com/",
    "mailto:hi@example.com",
    "tel:+15551234567",
    "/blog/a-post",
  ])("says nothing at all about %s", (href) => {
    expect(warningsFor([paragraphLinking(href)])).toEqual([]);
  });

  it("still writes the destination it always did", () => {
    const markdown = blocksToMarkdown(
      [paragraphLinking("https://example.com/a?b=c#d")],
      { imagePath: () => "" },
    );

    expect(markdown).toContain("[click me](https://example.com/a?b=c#d)");
  });

  it("says nothing about a bookmark it can write", () => {
    expect(
      warningsFor([
        block("bookmark", { url: "https://example.com/a", caption: [] }),
      ]),
    ).toEqual([]);
  });
});
