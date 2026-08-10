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
});
