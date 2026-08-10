import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { compileMDX } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import type { ReactElement } from "react";
import { escapeMarkdown } from "../escape";
import { richTextToMarkdown } from "../rich-text";
import { blocksToMarkdown } from "../blocks-to-md";
import { block, rt } from "./fixtures/blocks";

// Notion rich text is literal: an author typing "# not a heading" into a
// paragraph, or pasting "[see](/docs)" as prose, means those characters. Only
// the annotations Notion records (bold, italic, code, links…) are formatting.
// The converter emitted the text verbatim, so anything that happened to look
// like Markdown was reinterpreted on the way out — headings appeared from
// nowhere, "---" became a rule, and prose silently turned into links.

const ctx = { imagePath: (id: string) => `/images/${id}.png` };

async function renderMdx(source: string): Promise<HTMLElement> {
  const { content } = await compileMDX({
    source,
    options: { mdxOptions: { remarkPlugins: [remarkGfm] } },
  });
  return render(content as ReactElement).container;
}

const paragraph = (...runs: Parameters<typeof rt>[]) =>
  blocksToMarkdown(
    [block("paragraph", { rich_text: runs.map((args) => rt(...args)) })],
    ctx,
  );

const text = (value: string) => paragraph([value]).trimEnd();
const paragraphText = (...runs: Parameters<typeof rt>[]) =>
  paragraph(...runs).trimEnd();

describe("escapeMarkdown", () => {
  it("keeps the MDX and JSX delimiters escaped as entities", () => {
    expect(escapeMarkdown("Array<{id: string}>")).toBe(
      "Array&lt;&#123;id: string&#125;>",
    );
  });

  it("leaves ordinary prose unchanged", () => {
    expect(escapeMarkdown("ordinary prose, with punctuation!")).toBe(
      "ordinary prose, with punctuation!",
    );
  });

  it("escapes an entity-shaped ampersand but not a literal one", () => {
    expect(escapeMarkdown("&amp; and &#39;")).toBe("&amp;amp; and &amp;#39;");
    expect(escapeMarkdown("Research & Development")).toBe(
      "Research & Development",
    );
  });

  it("only escapes block markers at the start of a line", () => {
    expect(escapeMarkdown("# heading")).toBe("\\# heading");
    expect(escapeMarkdown("a # b")).toBe("a # b");
    expect(escapeMarkdown("# heading", false)).toBe("# heading");
    expect(escapeMarkdown("one\n# two")).toBe("one\n\\# two");
  });

  it("leaves an intraword underscore alone but escapes an emphasis-capable one", () => {
    expect(escapeMarkdown("last_edited_time")).toBe("last_edited_time");
    expect(escapeMarkdown("_emphasis_")).toBe("\\_emphasis\\_");
  });
});

describe("literal text that looks like a block marker", () => {
  it("escapes ATX headings, thematic breaks, and quotes", () => {
    expect(text("# Not a heading")).toBe("\\# Not a heading");
    expect(text("###### Still not a heading")).toBe(
      "\\###### Still not a heading",
    );
    expect(text("---")).toBe("\\---");
    expect(text("***")).toBe("\\*\\*\\*");
    expect(text("> Not a quote")).toBe("\\> Not a quote");
  });

  it("escapes list markers, including multi-digit ordinals", () => {
    expect(text("- Not a bullet")).toBe("\\- Not a bullet");
    expect(text("+ Not a bullet")).toBe("\\+ Not a bullet");
    expect(text("1. Not a list")).toBe("1\\. Not a list");
    expect(text("10) Not a list")).toBe("10\\) Not a list");
    expect(text("2026. A year, then a sentence.")).toBe(
      "2026\\. A year, then a sentence.",
    );
  });

  it("leaves a hash or hyphen that cannot start a block alone", () => {
    expect(text("#hashtag opens nothing")).toBe("#hashtag opens nothing");
    expect(text("Rated 9.5 out of 10.")).toBe("Rated 9.5 out of 10.");
    expect(text("Ada — 1815-1852 — wrote it")).toBe("Ada — 1815-1852 — wrote it");
  });

  it("escapes a setext underline hiding on the second line of a run", () => {
    expect(text("Heading\n===")).toBe("Heading\n\\===");
    expect(text("Heading\n---")).toBe("Heading\n\\---");
  });

  // A GFM table needs a delimiter row, so defusing that one line is enough —
  // and it is the only literal-text case that would restructure the prose
  // around it into cells rather than merely restyling it.
  it("escapes a line shaped like a table delimiter row", () => {
    expect(text("Name | Value\n---- | -----\nSlug | a-post")).toBe(
      "Name | Value\n\\---- | -----\nSlug | a-post",
    );
    expect(text("| --- | --- |")).toBe("\\| --- | --- |");
    expect(text("Name | Value\n:--: | ---:")).toBe(
      "Name | Value\n\\:--: | ---:",
    );
  });

  it("leaves a pipe that cannot build a table alone", () => {
    expect(text("stdout | grep -c error")).toBe("stdout | grep -c error");
    expect(text("a | b\nc | d")).toBe("a | b\nc | d");
  });
});

// MDX reads a line that begins `import ` or `export ` as an ESM statement, not
// as prose. The paragraph is handed to acorn: either it fails to parse and the
// whole post fails to compile, or — worse — it parses, and the paragraph is
// evaluated as a module declaration and vanishes from the page.
describe("literal text that looks like MDX ESM", () => {
  it("defuses the keyword only where MDX would read one", () => {
    expect(text("import the data first")).toBe(
      "&#105;mport the data first",
    );
    expect(text("export const config = 1")).toBe(
      "&#101;xport const config = 1",
    );
  });

  it("leaves prose that merely starts with those letters alone", () => {
    for (const value of [
      "important context here",
      "exporting the data is easy",
      "imports are hoisted",
      // The keyword only opens ESM when a space follows it.
      "import",
      "export\tlater",
      "import.meta is an expression",
    ]) {
      expect(text(value)).toBe(value);
    }
  });

  it("leaves the keyword alone where it cannot open a block", () => {
    // A continuation line, a heading and a table cell are all past the one
    // position MDX looks at.
    expect(text("prose\nimport the data")).toBe("prose\nimport the data");
    expect(
      blocksToMarkdown(
        [block("heading_1", { rich_text: [rt("import the data")] })],
        ctx,
      ),
    ).toBe("## import the data\n");
  });

  it("leaves indented text alone, which MDX already reads as prose", () => {
    expect(text("  import the data")).toBe("  import the data");
    expect(text("\timport the data")).toBe("\timport the data");
  });

  it("defuses a keyword split across runs", () => {
    expect(paragraphText(["imp"], ["ort the data"])).toBe("&#105;mport the data");
    // The space that arms the keyword can come from a run of its own.
    expect(paragraphText(["export"], [" "], ["everything", { bold: true }])).toBe(
      "&#101;xport **everything**",
    );
  });

  // A blank line inside a paragraph ends it, so what follows opens a block of
  // its own — in column one, where MDX is looking.
  it("defuses a keyword after a blank line in the same paragraph", () => {
    expect(text("before\n\nexport const config = 1")).toBe(
      "before\n\n&#101;xport const config = 1",
    );
    expect(text("\nimport the data")).toBe("\n&#105;mport the data");
    expect(text("one\n\ntwo\n\nimport three")).toBe(
      "one\n\ntwo\n\n&#105;mport three",
    );
  });

  it("leaves an annotated run alone, which opens with its own delimiter", () => {
    expect(paragraphText(["import x", { code: true }])).toBe("`import x`");
    expect(paragraphText(["import x", { bold: true }])).toBe("**import x**");
  });
});

describe("literal text that looks like inline syntax", () => {
  it("escapes emphasis, strikethrough, code, links, and backslashes", () => {
    expect(text("*not emphasis*")).toBe("\\*not emphasis\\*");
    expect(text("_not italic_")).toBe("\\_not italic\\_");
    expect(text("~~not struck~~")).toBe("\\~\\~not struck\\~\\~");
    expect(text("`not code`")).toBe("\\`not code\\`");
    expect(text("[text](https://example.com)")).toBe(
      "\\[text\\](https://example.com)",
    );
    expect(text("C:\\Users\\me")).toBe("C:\\\\Users\\\\me");
  });
});

describe("annotations still produce the formatting Notion recorded", () => {
  it("wraps without escaping the wrappers it generates", () => {
    expect(richTextToMarkdown([rt("bold", { bold: true })])).toBe("**bold**");
    expect(richTextToMarkdown([rt("italic", { italic: true })])).toBe(
      "*italic*",
    );
    expect(richTextToMarkdown([rt("struck", { strikethrough: true })])).toBe(
      "~~struck~~",
    );
    expect(
      richTextToMarkdown([rt("docs", { href: "https://example.com" })]),
    ).toBe("[docs](https://example.com)");
    expect(richTextToMarkdown([rt("useState", { code: true })])).toBe(
      "`useState`",
    );
  });

  it("escapes inside a wrapper without touching the wrapper", () => {
    expect(richTextToMarkdown([rt("a*b", { bold: true })])).toBe("**a\\*b**");
    expect(
      richTextToMarkdown([rt("[x]", { href: "https://example.com" })]),
    ).toBe("[\\[x\\]](https://example.com)");
  });

  it("keeps inline code raw", () => {
    expect(richTextToMarkdown([rt("a_b *c* [d]", { code: true })])).toBe(
      "`a_b *c* [d]`",
    );
  });
});

describe("markers the block converter emits itself", () => {
  it("still writes real headings, dividers, and lists", () => {
    expect(
      blocksToMarkdown(
        [
          block("heading_1", { rich_text: [rt("One")] }),
          block("divider", {}),
          block("bulleted_list_item", { rich_text: [rt("Bullet")] }),
          block("numbered_list_item", { rich_text: [rt("Ordinal")] }),
        ],
        ctx,
      ),
    ).toBe("## One\n\n---\n\n- Bullet\n\n1. Ordinal\n");
  });

  it("does not escape a hash inside a heading, whose content is inline", () => {
    expect(
      blocksToMarkdown(
        [block("heading_2", { rich_text: [rt("# 1 with a - dash")] })],
        ctx,
      ),
    ).toBe("### # 1 with a - dash\n");
  });

  it("escapes a literal marker in a list item so it stays one item", () => {
    expect(
      blocksToMarkdown(
        [
          block("bulleted_list_item", { rich_text: [rt("- literal dash")] }),
          block("numbered_list_item", { rich_text: [rt("1. literal ordinal")] }),
        ],
        ctx,
      ),
    ).toBe("- \\- literal dash\n\n1. 1\\. literal ordinal\n");
  });

  it("escapes a bracket in an image caption without breaking the image", () => {
    const image = block("image", { caption: [rt("A [diagram]")] });
    expect(blocksToMarkdown([image], ctx)).toBe(
      `![A \\[diagram\\]](/images/${image.id}.png)\n`,
    );
  });
});

describe("compiled through the post page's MDX pipeline", () => {
  it("renders a literal hash as prose, not a heading", async () => {
    const container = await renderMdx(paragraph(["# Not a heading"]));
    expect(container.querySelector("h1, h2, h3")).toBeNull();
    expect(container.textContent).toBe("# Not a heading");
  });

  it("renders literal rules and quotes as prose", async () => {
    const container = await renderMdx(
      paragraph(["---"]) + "\n" + paragraph(["> Not a quote"]),
    );
    expect(container.querySelector("hr")).toBeNull();
    expect(container.querySelector("blockquote")).toBeNull();
    expect(container.textContent).toBe("---\n> Not a quote");
  });

  // The link *syntax* is defused: the brackets stay visible and the anchor, if
  // there is one, is GFM linkifying the bare url exactly as it would anywhere
  // else in prose — its label is the url, never the bracketed label.
  it("renders a literal link as text, not as a link labelled \"text\"", async () => {
    const container = await renderMdx(
      paragraph(["[text](https://example.com)"]),
    );
    expect(container.textContent).toBe("[text](https://example.com)");
    expect(container.querySelector("a")?.textContent).toBe(
      "https://example.com",
    );
  });

  it("renders a literal link with a relative url as plain text", async () => {
    const container = await renderMdx(paragraph(["[docs](/blog/x)"]));
    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toBe("[docs](/blog/x)");
  });

  it("renders literal emphasis characters verbatim", async () => {
    for (const value of [
      "*not emphasis*",
      "_not italic_",
      "~~not struck~~",
      "`not code`",
      "C:\\Users\\me",
      "1. Not a list",
    ]) {
      const container = await renderMdx(paragraph([value]));
      expect(container.querySelector("em, strong, del, code")).toBeNull();
      expect(container.textContent).toBe(value);
    }
  });

  it("still renders every annotation Notion recorded", async () => {
    const container = await renderMdx(
      paragraph(
        ["Bold", { bold: true }],
        [" "],
        ["Italic", { italic: true }],
        [" "],
        ["Struck", { strikethrough: true }],
        [" "],
        ["code_span", { code: true }],
        [" "],
        ["docs", { href: "https://example.com" }],
      ),
    );

    expect(container.querySelector("strong")?.textContent).toBe("Bold");
    expect(container.querySelector("em")?.textContent).toBe("Italic");
    expect(container.querySelector("del")?.textContent).toBe("Struck");
    expect(container.querySelector("code")?.textContent).toBe("code_span");
    const anchor = container.querySelector("a");
    expect(anchor?.getAttribute("href")).toBe("https://example.com");
    expect(anchor?.textContent).toBe("docs");
  });

  it("does not let literal pipes restructure prose into a table", async () => {
    const container = await renderMdx(
      paragraph(["Name | Value\n---- | -----\nSlug | a-post"]),
    );
    expect(container.querySelector("table")).toBeNull();
    expect(container.textContent).toContain("---- | -----");
  });

  it("does not build a table out of a list item's paragraph children", async () => {
    const container = await renderMdx(
      blocksToMarkdown(
        [
          block("bulleted_list_item", { rich_text: [rt("Header row syntax:")] }, [
            block("paragraph", { rich_text: [rt("Name | Value")] }),
            block("paragraph", { rich_text: [rt("---- | -----")] }),
          ]),
        ],
        ctx,
      ),
    );
    expect(container.querySelector("table")).toBeNull();
    expect(container.querySelectorAll("li")).toHaveLength(1);
  });

  it("still renders a real Notion table as a table", async () => {
    const container = await renderMdx(
      blocksToMarkdown(
        [
          block("table", { table_width: 2, has_column_header: true }, [
            block("table_row", { cells: [[rt("Name")], [rt("Value")]] }),
            block("table_row", { cells: [[rt("p99")], [rt("120 | ms")]] }),
          ]),
        ],
        ctx,
      ),
    );
    expect(container.querySelectorAll("table")).toHaveLength(1);
    expect(container.querySelectorAll("th")).toHaveLength(2);
    expect(container.querySelectorAll("td")[1].textContent).toBe("120 | ms");
  });

  it("keeps a literal marker inside a list item in that item", async () => {
    const container = await renderMdx(
      blocksToMarkdown(
        [block("bulleted_list_item", { rich_text: [rt("- literal dash")] })],
        ctx,
      ),
    );
    expect(container.querySelectorAll("li")).toHaveLength(1);
    expect(container.querySelector("li")?.textContent).toBe("- literal dash");
  });

  it("renders a paragraph that opens with import or export as prose", async () => {
    for (const value of [
      "import the data first",
      "export the results weekly",
      "import './styles.css' is a line of code",
      "export const config = 1",
    ]) {
      const container = await renderMdx(paragraph([value]));
      expect(container.querySelector("p")?.textContent).toBe(value);
    }
  });

  it("renders prose that only starts with those letters untouched", async () => {
    for (const value of [
      "important context here",
      "exporting the data is easy",
      "import",
      "import.meta is an expression",
    ]) {
      const source = paragraph([value]);
      expect(source).toBe(`${value}\n`);
      const container = await renderMdx(source);
      expect(container.querySelector("p")?.textContent).toBe(value);
    }
  });

  it("renders an indented keyword as the prose MDX already reads", async () => {
    for (const value of ["  import the data", "\timport the data"]) {
      const container = await renderMdx(paragraph([value]));
      expect(container.querySelector("p")?.textContent).toBe(
        "import the data",
      );
    }
  });

  it("renders a keyword split across runs as prose", async () => {
    const container = await renderMdx(paragraph(["imp"], ["ort the data"]));
    expect(container.querySelector("p")?.textContent).toBe("import the data");
  });

  it("renders a keyword after a blank line in the same paragraph", async () => {
    const container = await renderMdx(
      paragraph(["before\n\nexport const config = 1"]),
    );
    expect([...container.querySelectorAll("p")].map((p) => p.textContent)).toEqual(
      ["before", "export const config = 1"],
    );
  });

  it("keeps the keyword out of the way inside a list item and a quote", async () => {
    const container = await renderMdx(
      blocksToMarkdown(
        [
          block("bulleted_list_item", { rich_text: [rt("import the data")] }),
          block("quote", { rich_text: [rt("export the results")] }),
        ],
        ctx,
      ),
    );
    expect(container.querySelector("li")?.textContent).toBe("import the data");
    expect(container.querySelector("blockquote p")?.textContent).toBe(
      "export the results",
    );
  });

  it("leaves generated code untouched, where a keyword is just code", async () => {
    const source = blocksToMarkdown(
      [
        block("code", {
          rich_text: [rt('import React from "react";')],
          language: "typescript",
        }),
        block("paragraph", {
          rich_text: [rt("import x", { code: true })],
        }),
      ],
      ctx,
    );
    expect(source).toContain('import React from "react";');
    const container = await renderMdx(source);
    const [fenced, span] = [...container.querySelectorAll("code")];
    expect(fenced.textContent).toContain('import React from "react";');
    expect(span.textContent).toBe("import x");
  });
});
