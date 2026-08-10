import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import matter from "gray-matter";
import { markdownToBlocks } from "@/lib/notion/md-to-blocks";
import {
  inlineToRichText,
  type RichTextInput,
} from "@/lib/notion/md-to-rich-text";
import { richTextToMarkdown } from "@/lib/notion/rich-text";
import { blocksToMarkdown } from "@/lib/notion/blocks-to-md";
import type { MdBlock, RichText } from "@/lib/notion/types";
import { block, rt } from "./fixtures/blocks";

// The migration writes Markdown into Notion; the sync writes Notion back out as
// Markdown. The two converters are inverses, so anything the site can render
// has to survive the trip: a `code` span that goes up as literal backticks
// comes back down escaped, and the post grows the punctuation the author never
// typed.

type MigrationBlock = ReturnType<typeof markdownToBlocks>[number];

// The runs the migration sends, in the shape the sync reads back out of Notion,
// so one post can be pushed and pulled inside a single test.
function asRichText(rich: RichTextInput): RichText[] {
  return rich.map((item) => {
    if (!("text" in item)) {
      throw new Error(`not a text run: ${JSON.stringify(item)}`);
    }
    return rt(item.text.content, {
      ...item.annotations,
      href: item.text.link?.url ?? null,
    });
  });
}

// A migration block carries its runs under a key named after its own type.
function bodyOf(migrated: MigrationBlock): {
  type: string;
  rich: RichTextInput;
} {
  for (const [type, payload] of Object.entries(migrated)) {
    if (
      typeof payload === "object" &&
      payload !== null &&
      "rich_text" in payload
    ) {
      return { type, rich: payload.rich_text };
    }
  }
  throw new Error(`no rich text in ${JSON.stringify(migrated)}`);
}

const inlineRoundTrip = (rich: RichText[]): RichText[] =>
  asRichText(inlineToRichText(richTextToMarkdown(rich)));

const semantic = (rich: RichText[]) =>
  rich.map(({ plain_text, href, annotations }) => ({
    plain_text,
    href,
    annotations,
  }));

describe("a Notion paragraph pushed back into Notion", () => {
  it("keeps every annotation the page recorded", () => {
    const original = [
      rt("Keep the surface small — see "),
      rt("searchDocs", { code: true }),
      rt(", read the "),
      rt("docs", { href: "https://example.com" }),
      rt(", and "),
      rt("never", { bold: true }),
      rt(" "),
      rt("ever", { italic: true }),
      rt(" "),
      rt("guess", { strikethrough: true }),
      rt("."),
    ];

    expect(semantic(inlineRoundTrip(original))).toEqual(semantic(original));
  });

  it("keeps combined annotations and a formatted link label", () => {
    const original = [
      rt("both", { bold: true, italic: true }),
      rt(" "),
      rt("struck code", { strikethrough: true, code: true }),
      rt(" "),
      rt("bold link", { bold: true, href: "https://example.com/a(b)c" }),
    ];

    expect(semantic(inlineRoundTrip(original))).toEqual(semantic(original));
  });

  it("keeps literal text that only looks like formatting", () => {
    const original = [
      rt("*not emphasis* and `not code` and [not a link](/x)"),
    ];

    expect(semantic(inlineRoundTrip(original))).toEqual(semantic(original));
  });

  it("keeps the characters the escaper writes as entities", () => {
    const original = [rt("Array<{id: string}> & more, and 3 &lt; 4")];

    expect(semantic(inlineRoundTrip(original))).toEqual(semantic(original));
  });

  it("keeps literal delimiters that sit inside formatting", () => {
    const original = [
      rt("a *literal* star", { bold: true }),
      rt(" and "),
      rt("~~tildes~~", { italic: true }),
      rt(" and "),
      rt("[brackets]", { strikethrough: true, href: "https://example.com" }),
      rt(" and snake_case"),
    ];

    expect(semantic(inlineRoundTrip(original))).toEqual(semantic(original));
  });

  it("keeps annotations that sit beside an astral character", () => {
    const original = [
      rt("Wow!", { bold: true }),
      rt("\u{1F600}tail "),
      rt("\u{1D11E}word\u{10100}", { strikethrough: true }),
      rt(" end"),
    ];

    expect(semantic(inlineRoundTrip(original))).toEqual(semantic(original));
  });

  // Where two generated delimiter runs would sit flush against each other they
  // fuse into one longer run that pairs with nothing, so the converter writes
  // the annotation as the element it stands for instead. The trip back has to
  // read those elements, or a synced post cannot be migrated at all.
  it("keeps adjacent style runs the converter had to write as elements", () => {
    const original = [
      rt("Wow!", { bold: true }),
      rt("b", { italic: true }),
      rt(" and "),
      rt("a", { bold: true }),
      rt("b", { bold: true, strikethrough: true }),
      rt(" and "),
      rt("x", { italic: true }),
      rt("y", { italic: true, strikethrough: true }),
    ];

    expect(richTextToMarkdown(original)).toContain("<strong>");
    expect(semantic(inlineRoundTrip(original))).toEqual(semantic(original));
  });

  // The two halves of the escaper meet here: a paragraph opening with a word
  // MDX reads as ESM is written as a character reference, and reading it back
  // has to give the word again rather than the reference.
  it("keeps a paragraph the ESM defusing rewrote", () => {
    const original = [rt("import the data first")];
    const markdown = blocksToMarkdown(
      [block("paragraph", { rich_text: original })],
      { imagePath: (id) => `/images/${id}.png` },
    ).trim();

    expect(markdown).toBe("&#105;mport the data first");
    expect(semantic(asRichText(inlineToRichText(markdown)))).toEqual(
      semantic(original),
    );
  });
});

describe("the committed posts", () => {
  const dir = path.join(process.cwd(), "content", "blog");
  const names = readdirSync(dir).filter((name) => name.endsWith(".mdx"));
  const body = (name: string) =>
    matter(readFileSync(path.join(dir, name), "utf8")).content;

  it("finds posts to migrate", () => {
    expect(names.length).toBeGreaterThan(0);
  });

  it("migrates the inline code they already carry", () => {
    const codeRuns = names
      .flatMap((name) => markdownToBlocks(body(name)))
      .filter((block) => block.type === "paragraph")
      .map(bodyOf)
      .flatMap(({ rich }) => asRichText(rich))
      .filter((run) => run.annotations.code);

    expect(codeRuns.map((run) => run.plain_text)).toContain("retrieve");
  });

  // The whole point of the pair: what the migration pushes up is what the next
  // sync pulls back down, headings, fences, bullets and inline runs included.
  for (const name of names) {
    it(`re-renders ${name} as the markdown it was migrated from`, () => {
      const source = body(name);
      const rendered = blocksToMarkdown(
        markdownToBlocks(source).map(asSyncedBlock),
        { imagePath: (id) => `/images/${id}.png` },
      );

      expect(rendered.trim()).toBe(source.trim());
    });
  }
});

// One migrated block in the shape the sync reads it back in.
function asSyncedBlock(migrated: MigrationBlock): MdBlock {
  const { type, rich } = bodyOf(migrated);
  const rich_text = asRichText(rich);
  return "code" in migrated
    ? block("code", { rich_text, language: migrated.code.language })
    : block(type, { rich_text });
}
