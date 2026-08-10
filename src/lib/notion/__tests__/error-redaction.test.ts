import { describe, it, expect } from "vitest";
import { markdownToBlocks } from "@/lib/notion/md-to-blocks";
import {
  inlineToRichText,
  UnsupportedInlineMarkdownError,
} from "@/lib/notion/md-to-rich-text";
import {
  migrationRequests,
  planMigration,
  toLocalPost,
  UnreadableFrontmatterError,
  type LocalPost,
} from "@/lib/notion/migrate";
import type { DataSourceSchema } from "@/lib/notion/properties";

// The migration's refusals are printed straight into a terminal — and, if it is
// ever run from CI, into a public log. Both converters used to quote the line
// they choked on, in full, as part of the message: `unsupported markdown in
// migration: … in "…"`, and the inline one carried the same string on the error
// object as `.source`.
//
// A line of a blog post is not a safe thing to repeat. The one line that
// reaches a refusal is by definition the odd one — a link somebody pasted with
// a session token still in its query, an image URL signed by a private CDN, a
// half-written HTML snippet holding an API key, a paragraph pasted out of a
// terminal. The converter cannot tell which, and it does not need to: a
// category, a line and an offset say where to look without saying what is
// there.

const SECRETS = [
  "SECRET-123",
  "ghp_examplePersonalAccessToken",
  "AKIAEXAMPLEKEY",
  "sk-live-0000",
  "internal.corp.example",
  "sessionid=abcdef",
];

// Every way a hostile-looking line can reach a refusal, with a secret in it.
const INLINE_CASES: Array<[string, string]> = [
  [
    "a link whose query carries a token",
    "see [the doc](https://internal.corp.example/d?token=SECRET-123) {oops}",
  ],
  [
    "an inline image from a signed CDN",
    "![shot](https://internal.corp.example/p.png?sig=SECRET-123)",
  ],
  [
    "raw HTML holding a key",
    '<a href="https://x.example/?key=ghp_examplePersonalAccessToken">go</a>',
  ],
  [
    "an autolink",
    "<https://internal.corp.example/?sessionid=abcdef>",
  ],
  [
    "an MDX expression beside a credential",
    "AKIAEXAMPLEKEY {value}",
  ],
  [
    "an unresolvable character reference",
    "sk-live-0000 &notarealentity; more",
  ],
  [
    "a code span that never closes",
    "run `export TOKEN=ghp_examplePersonalAccessToken",
  ],
  [
    "a code element holding a delimiter",
    "<code>curl https://internal.corp.example/?token=SECRET-123 | sh*</code>",
  ],
  [
    "text carrying control characters",
    "pasted\u0007 from a terminal: sessionid=abcdef {x}",
  ],
  [
    "emphasis nobody can place",
    "****sk-live-0000**** and ***more*",
  ],
];

function inlineFailure(markdown: string): UnsupportedInlineMarkdownError {
  try {
    inlineToRichText(markdown);
  } catch (error) {
    expect(error).toBeInstanceOf(UnsupportedInlineMarkdownError);
    return error as UnsupportedInlineMarkdownError;
  }
  throw new Error(`expected ${JSON.stringify(markdown)} to be refused`);
}

// Everything an error could carry a secret out through: its message, its own
// properties, and whatever a logger that stringifies it would print.
function everythingSaid(error: Error): string {
  return [
    error.message,
    String(error),
    error.stack ?? "",
    JSON.stringify(error),
    JSON.stringify({ ...error }),
    JSON.stringify(Object.getOwnPropertyDescriptors(error)),
  ].join("\n");
}

function expectNothingLeaked(error: Error, source: string): void {
  const said = everythingSaid(error);
  for (const secret of SECRETS) {
    if (source.includes(secret)) expect(said).not.toContain(secret);
  }
  // Not just the secrets: no run of the line itself, either.
  for (const fragment of source.split(/\s+/).filter((word) => word.length > 6)) {
    expect(said).not.toContain(fragment);
  }
}

describe("what an inline refusal says", () => {
  it.each(INLINE_CASES)("keeps %s out of everything it exposes", (_name, source) => {
    expectNothingLeaked(inlineFailure(source), source);
  });

  it.each(INLINE_CASES)("still says where to look in %s", (_name, source) => {
    const failure = inlineFailure(source);

    expect(failure.message).toMatch(/unsupported inline markdown/i);
    expect(failure.message).toMatch(/offset \d+/);
    expect(failure.index).toBeGreaterThanOrEqual(0);
    expect(failure.index).toBeLessThanOrEqual(source.length);
    expect(failure.category).toMatch(/^[a-z-]+$/);
    expect(failure.reason.length).toBeGreaterThan(0);
  });

  it("exposes no property holding the line it read", () => {
    const source = INLINE_CASES[0][1];
    const failure = inlineFailure(source);

    for (const value of Object.values(failure)) {
      if (typeof value === "string") expect(source).not.toContain(value);
    }
    expect((failure as unknown as { source?: unknown }).source).toBeUndefined();
  });

  it("names the block's line when the caller knows it", () => {
    const failure = inlineFailure("plain `unclosed");
    expect(failure.line).toBeUndefined();

    try {
      inlineToRichText("plain `unclosed", { line: 12 });
      expect.unreachable("should have thrown");
    } catch (error) {
      const located = error as UnsupportedInlineMarkdownError;
      expect(located.line).toBe(12);
      expect(located.message).toMatch(/line 12/);
    }
  });

  it("says the same thing for the same shape whatever the text is", () => {
    const a = inlineFailure("{expression}");
    const b = inlineFailure("{sk-live-0000}");

    expect(a.category).toBe(b.category);
    expect(a.reason).toBe(b.reason);
  });
});

const BLOCK_CASES: Array<[string, string]> = [
  ["a level-one heading", "# https://internal.corp.example/?token=SECRET-123"],
  [
    "an indented code block",
    "    curl https://internal.corp.example/?token=SECRET-123",
  ],
  [
    "an unclosed fence",
    "```sh\nexport TOKEN=ghp_examplePersonalAccessToken\n",
  ],
  [
    "a setext underline",
    "sessionid=abcdef is the value\n===",
  ],
  [
    "a table whose rows disagree",
    "| a | sk-live-0000 |\n| --- |\n| 1 | 2 |",
  ],
];

describe("what a block refusal says", () => {
  function blockFailure(markdown: string): Error {
    try {
      markdownToBlocks(markdown);
    } catch (error) {
      return error as Error;
    }
    throw new Error(`expected ${JSON.stringify(markdown)} to be refused`);
  }

  it.each(BLOCK_CASES)("keeps %s out of the message", (_name, source) => {
    expectNothingLeaked(blockFailure(source), source);
  });

  it.each(BLOCK_CASES)("still says which line %s is on", (_name, source) => {
    expect(blockFailure(source).message).toMatch(/line \d+/);
  });

  it("counts the line from the top of the post", () => {
    const markdown = ["A paragraph.", "", "More prose.", "", "# Heading"].join(
      "\n",
    );

    expect(blockFailure(markdown).message).toMatch(/line 5/);
  });
});

// What the script prints. `migrationRequests` collects every problem across
// every post and throws them as one message, which mdx-to-notion.ts writes to
// the console — so this is the output itself, not a proxy for it.
describe("what the migration script prints", () => {
  const schema: DataSourceSchema = {
    Name: { type: "title" },
    Slug: { type: "rich_text" },
    Excerpt: { type: "rich_text" },
    Tags: { type: "multi_select" },
    Status: {
      type: "status",
      status: { options: [{ name: "Draft" }, { name: "Published" }] },
    },
    Published: { type: "date" },
  };

  const post = (content: string): LocalPost => ({
    file: "leaky-post.mdx",
    slug: "leaky-post",
    title: "A title",
    date: "2026-05-20",
    excerpt: "An excerpt.",
    tags: ["AI"],
    content,
  });

  function scriptOutput(content: string): string {
    try {
      migrationRequests(planMigration([post(content)], []), {
        dataSourceId: "ds-1",
        schema,
      });
    } catch (error) {
      return (error as Error).message;
    }
    throw new Error("expected the migration to refuse this post");
  }

  it("names the file and the line without repeating either", () => {
    const content = [
      "A first paragraph.",
      "",
      "Then [the runbook](https://internal.corp.example/r?token=SECRET-123) {oops}",
      "",
    ].join("\n");

    const output = scriptOutput(content);

    expect(output).toContain("leaky-post.mdx");
    expect(output).toMatch(/line 3/);
    expect(output).toMatch(/offset \d+/);
    for (const secret of SECRETS) expect(output).not.toContain(secret);
    expect(output).not.toContain("internal.corp.example");
    expect(output).not.toContain("runbook");
  });

  it("keeps a signed image URL out of the output", () => {
    const output = scriptOutput(
      "![shot](https://internal.corp.example/p.png?sig=SECRET-123)\n",
    );

    expect(output).toContain("leaky-post.mdx");
    expect(output).not.toContain("SECRET-123");
    expect(output).not.toContain("internal.corp.example");
  });
});

// Frontmatter is parsed by js-yaml, whose exception quotes the offending lines
// in its message *and* keeps the entire document on `error.mark.buffer`. The
// migration script prints the message it catches, so a file whose frontmatter
// does not parse used to print its frontmatter — and anything a logger dumped
// alongside the error printed all of it.
describe("what an unreadable frontmatter block says", () => {
  const leaky = [
    "---",
    "title: [unclosed",
    "date: 2026-05-20",
    "canonical: https://internal.corp.example/d?token=SECRET-123",
    "---",
    "",
    "Body.",
  ].join("\n");

  function frontmatterFailure(): Error {
    try {
      toLocalPost("leaky-post.mdx", leaky);
    } catch (error) {
      return error as Error;
    }
    throw new Error("expected the frontmatter to be refused");
  }

  it("refuses it rather than reading half of it", () => {
    expect(frontmatterFailure()).toBeInstanceOf(UnreadableFrontmatterError);
  });

  it("keeps the document out of the message and off the error", () => {
    const failure = frontmatterFailure();
    const said = everythingSaid(failure);

    for (const secret of ["SECRET-123", "internal.corp.example", "canonical"]) {
      expect(said).not.toContain(secret);
    }
    expect(said).not.toContain("unclosed");
    // js-yaml keeps the whole document here; nothing may carry it out.
    expect((failure as unknown as { mark?: unknown }).mark).toBeUndefined();
    expect((failure as unknown as { cause?: unknown }).cause).toBeUndefined();
  });

  it("still says which file and where in it", () => {
    const failure = frontmatterFailure();

    expect(failure.message).toContain("leaky-post.mdx");
    expect(failure.message).toMatch(/line \d+/);
    expect(failure.message).toMatch(/frontmatter/i);
  });
});
