import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { compileMDX } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import type { ReactElement } from "react";
import { blocksToMarkdown } from "../blocks-to-md";
import { richTextToMarkdown } from "../rich-text";
import {
  inlineToRichText,
  UnsupportedInlineMarkdownError,
} from "../md-to-rich-text";
import type { RichText } from "../types";
import { block, rt } from "./fixtures/blocks";

// Notion records five annotations and Markdown has delimiters for four of them.
// Underline was the fifth: the converter never looked at it, so a run the
// author underlined published as plain prose and the next migration sent plain
// prose back. The annotation was gone from the page and from the database, and
// nothing anywhere said so.
//
// Markdown has no underline, but MDX has `<u>` — the same move the converter
// already makes for `<strong>`, `<em>` and `<del>` where delimiters cannot be
// used. A run carrying underline is written as elements throughout, which need
// no flanking at all, and md-to-rich-text reads that exact tag back.

const ctx = { imagePath: (id: string) => `/images/${id}.png` };

const paragraph = (...runs: Parameters<typeof rt>[]) =>
  blocksToMarkdown(
    [block("paragraph", { rich_text: runs.map((args) => rt(...args)) })],
    ctx,
  ).trimEnd();

async function renderMdx(source: string): Promise<HTMLElement> {
  const { content } = await compileMDX({
    source,
    options: { mdxOptions: { remarkPlugins: [remarkGfm] } },
  });
  return render(content as ReactElement).container;
}

type Plain = {
  text: string;
  bold?: true;
  italic?: true;
  strikethrough?: true;
  underline?: true;
  code?: true;
  href?: string;
};

const runs = (markdown: string): Plain[] =>
  inlineToRichText(markdown).map((item) => {
    if (!("text" in item)) throw new Error("not a text run");
    const { bold, italic, strikethrough, underline, code } =
      item.annotations ?? {};
    return {
      text: item.text.content,
      ...(bold === true ? { bold: true as const } : {}),
      ...(italic === true ? { italic: true as const } : {}),
      ...(strikethrough === true ? { strikethrough: true as const } : {}),
      ...(underline === true ? { underline: true as const } : {}),
      ...(code === true ? { code: true as const } : {}),
      ...(item.text.link ? { href: item.text.link.url } : {}),
    };
  });

const semantic = (rich: RichText[]) =>
  rich.map(({ plain_text, href, annotations }) => ({
    plain_text,
    href,
    annotations,
  }));

// One Notion paragraph pushed out as markdown and read straight back in.
const roundTrip = (rich: RichText[]): RichText[] =>
  inlineToRichText(richTextToMarkdown(rich)).map((item) => {
    if (!("text" in item)) throw new Error("not a text run");
    return rt(item.text.content, {
      ...item.annotations,
      href: item.text.link?.url ?? null,
    });
  });

describe("an underlined run on its way out", () => {
  it("writes the element markdown has no delimiter for", () => {
    expect(paragraph(["underlined", { underline: true }])).toBe(
      "<u>underlined</u>",
    );
  });

  it("writes every annotation as an element once underline is one of them", () => {
    expect(
      paragraph([
        "all",
        { underline: true, bold: true, italic: true, strikethrough: true },
      ]),
    ).toBe("<u><strong><em><del>all</del></em></strong></u>");
    expect(paragraph(["b", { underline: true, bold: true }])).toBe(
      "<u><strong>b</strong></u>",
    );
  });

  it("keeps a code span inside it", () => {
    expect(paragraph(["snippet", { underline: true, code: true }])).toBe(
      "<u>`snippet`</u>",
    );
  });

  it("keeps it inside a link's label", () => {
    expect(
      paragraph(["docs", { underline: true, href: "https://example.com" }]),
    ).toBe("[<u>docs</u>](https://example.com)");
  });

  it("escapes the text inside it like any other literal run", () => {
    expect(paragraph(["a *b* <T>", { underline: true }])).toBe(
      "<u>a \\*b\\* &lt;T></u>",
    );
  });

  it("does not merge an underlined run with the plain run beside it", () => {
    expect(paragraph(["plain "], ["marked", { underline: true }], [" tail"])).toBe(
      "plain <u>marked</u> tail",
    );
  });

  it("leaves a run with no underline exactly as it was", () => {
    expect(paragraph(["bold", { bold: true }])).toBe("**bold**");
  });
});

describe("what the browser gets", () => {
  it("renders the underline the author applied", async () => {
    const container = await renderMdx(
      paragraph(["plain "], ["marked", { underline: true }]),
    );

    expect(container.querySelector("u")?.textContent).toBe("marked");
    expect(container.textContent).toBe("plain marked");
  });

  it("renders the combination the page recorded", async () => {
    const container = await renderMdx(
      paragraph(["x "], [
        "all",
        { underline: true, bold: true, italic: true, strikethrough: true },
      ]),
    );

    expect(container.querySelector("u strong em del")?.textContent).toBe("all");
  });

  it("renders it inside the link it belongs to", async () => {
    const container = await renderMdx(
      paragraph(["docs", { underline: true, href: "https://example.com" }]),
    );

    expect(container.querySelector("a u")?.textContent).toBe("docs");
    expect(container.querySelector("a")?.getAttribute("href")).toBe(
      "https://example.com",
    );
  });
});

describe("the trip back into Notion", () => {
  it("reads the element back as the annotation it stands for", () => {
    expect(runs("<u>underlined</u>")).toEqual([
      { text: "underlined", underline: true },
    ]);
  });

  it("keeps every annotation nested inside it", () => {
    expect(runs("<u><strong><em><del>all</del></em></strong></u>")).toEqual([
      { text: "all", underline: true, bold: true, italic: true, strikethrough: true },
    ]);
    expect(runs("<u>**b**</u>")).toEqual([
      { text: "b", underline: true, bold: true },
    ]);
    expect(runs("<u>`c`</u>")).toEqual([
      { text: "c", underline: true, code: true },
    ]);
  });

  it("refuses every other spelling of it", () => {
    for (const markdown of [
      '<u class="x">a</u>',
      "<u >a</u>",
      "<U>a</U>",
      "<u/>",
      "<u>a",
      "<u>a</em>",
      "<ul>a</ul>",
      "<u onclick='steal()'>a</u>",
      "<underline>a</underline>",
    ]) {
      expect(() => inlineToRichText(markdown)).toThrow(
        UnsupportedInlineMarkdownError,
      );
    }
  });
});

describe("a page pushed out and pulled back", () => {
  it("keeps underline through both directions", () => {
    const original = [
      rt("plain "),
      rt("marked", { underline: true }),
      rt(" and "),
      rt("both", { underline: true, bold: true }),
      rt(" and "),
      rt("all", {
        underline: true,
        bold: true,
        italic: true,
        strikethrough: true,
      }),
      rt(" and "),
      rt("snippet", { underline: true, code: true }),
      rt(" and "),
      rt("docs", { underline: true, href: "https://example.com" }),
    ];

    expect(semantic(roundTrip(original))).toEqual(semantic(original));
  });

  it("keeps two neighbouring underlined runs apart from their neighbours", () => {
    const original = [
      rt("a", { underline: true }),
      rt("b", { bold: true }),
      rt("c", { underline: true, strikethrough: true }),
    ];

    expect(semantic(roundTrip(original))).toEqual(semantic(original));
  });
});
