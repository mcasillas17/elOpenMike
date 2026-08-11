import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { compileMDX } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import type { ReactElement } from "react";
import { blocksToMarkdown } from "../blocks-to-md";
import { markdownToBlocks } from "../md-to-blocks";
import { richTextToMarkdown } from "../rich-text";
import { inlineToRichText } from "../md-to-rich-text";
import type { MdBlock, RichText } from "../types";
import { block, rt } from "./fixtures/blocks";

// Underline has no Markdown delimiter, so rich-text.ts writes the run as
// `<u>` — and an element is the one wrapper that cannot survive a blank line.
// `<u>a` on one side of one and `b</u>` on the other is not an element with two
// paragraphs in it; MDX refuses to compile the file at all ("Expected a closing
// tag for `<u>` before the end of `paragraph`"), which takes down the whole
// post, not the run that carried the break. The delimiters have the same shape
// of problem and fail more quietly: `**a` … `b**` publishes four literal
// asterisks and no bold anywhere.
//
// A line ending written as the character reference it already renders as is the
// way through, and it is the one this repo already takes for a heading, an
// image's alt text and a code run that carries a break (see escape.ts and
// code-span.ts). micromark decides the block structure from the raw bytes,
// before any reference is resolved, so the wrapper stays on one line; the
// reader still gets the line ending, because that is what the reference *is*;
// and md-to-rich-text reads it back as the character it stands for, so the run
// reaches Notion exactly as it left.
//
// Only flow context needs it. A heading, an alt text and a link block's label
// already write every line ending as a reference, and a table cell writes
// `<br />` — none of them lets a raw one through, so none of them can split a
// wrapper. Those are left exactly as they were, which is what keeps a two-line
// cell rendering as two lines.

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

describe("an underlined run carrying a line ending", () => {
  it("writes the break as the reference it renders as", () => {
    expect(paragraph(["a\nb", { underline: true }])).toBe("<u>a&#10;b</u>");
  });

  it("keeps a blank line inside the element rather than splitting it", () => {
    expect(paragraph(["a\n\nb", { underline: true }])).toBe(
      "<u>a&#10;&#10;b</u>",
    );
  });

  it("keeps CRLF and a lone carriage return apart", () => {
    expect(paragraph(["a\r\nb", { underline: true }])).toBe(
      "<u>a&#13;&#10;b</u>",
    );
    expect(paragraph(["a\rb", { underline: true }])).toBe("<u>a&#13;b</u>");
    expect(paragraph(["a\r\n\r\nb", { underline: true }])).toBe(
      "<u>a&#13;&#10;&#13;&#10;b</u>",
    );
  });

  it("keeps every annotation nested inside it", () => {
    expect(paragraph(["a\n\nb", { underline: true, bold: true }])).toBe(
      "<u><strong>a&#10;&#10;b</strong></u>",
    );
    expect(
      paragraph([
        "a\n\nb",
        { underline: true, bold: true, italic: true, strikethrough: true },
      ]),
    ).toBe("<u><strong><em><del>a&#10;&#10;b</del></em></strong></u>");
  });

  it("keeps a code run's own element inside it", () => {
    expect(paragraph(["a\n\nb", { underline: true, code: true }])).toBe(
      "<u><code>a&#10;&#10;b</code></u>",
    );
  });

  it("keeps it inside the link it belongs to", () => {
    expect(
      paragraph(["a\n\nb", { underline: true, href: "https://example.com" }]),
    ).toBe("[<u>a&#10;&#10;b</u>](https://example.com)");
  });

  it("joins the runs Notion split the break across", () => {
    expect(
      paragraph(["a\n", { underline: true }], ["\nb", { underline: true }]),
    ).toBe("<u>a&#10;&#10;b</u>");
  });

  it("leaves the line endings of an unwrapped run exactly where they were", () => {
    expect(paragraph(["a\n\nb"])).toBe("a\n\nb");
    expect(paragraph(["a\nb"])).toBe("a\nb");
  });
});

// The delimiters have the same problem and lose it silently: a blank line ends
// the paragraph, both halves of the pair become literal text, and the page
// publishes asterisks where the author had emphasis.
describe("a delimited run carrying a line ending", () => {
  it("writes the break as a reference so the pair stays on one line", () => {
    expect(paragraph(["a\n\nb", { bold: true }])).toBe("**a&#10;&#10;b**");
    expect(paragraph(["a\n\nb", { italic: true }])).toBe("*a&#10;&#10;b*");
    expect(paragraph(["a\n\nb", { strikethrough: true }])).toBe(
      "~~a&#10;&#10;b~~",
    );
  });

  it("keeps a link's label between its brackets", () => {
    expect(paragraph(["a\n\nb", { href: "https://example.com" }])).toBe(
      "[a&#10;&#10;b](https://example.com)",
    );
  });

  it("keeps the whitespace a link's own brackets enclose", () => {
    expect(paragraph(["\na\n", { href: "https://example.com" }])).toBe(
      "[&#10;a&#10;](https://example.com)",
    );
  });

  it("leaves whitespace outside the delimiters where it always was", () => {
    expect(paragraph(["x"], [" a ", { bold: true }], ["y"])).toBe(
      "x **a** y",
    );
  });
});

// Nothing here asserts on a string: the question is what the site does with the
// file, and only the compiler answers that.
type Case = { name: string; blocks: (runs: RichText[]) => MdBlock[] };

const FLOW_CASES: Case[] = [
  { name: "a paragraph", blocks: (rich) => [block("paragraph", { rich_text: rich })] },
  {
    name: "a bulleted list item",
    blocks: (rich) => [block("bulleted_list_item", { rich_text: rich })],
  },
  {
    name: "a numbered list item",
    blocks: (rich) => [block("numbered_list_item", { rich_text: rich })],
  },
  {
    name: "a task item",
    blocks: (rich) => [block("to_do", { rich_text: rich, checked: false })],
  },
  { name: "a quote", blocks: (rich) => [block("quote", { rich_text: rich })] },
  {
    name: "a callout",
    blocks: (rich) => [
      block("callout", { rich_text: rich, icon: { type: "emoji", emoji: "💡" } }),
    ],
  },
  { name: "a toggle", blocks: (rich) => [block("toggle", { rich_text: rich })] },
  {
    name: "a heading",
    blocks: (rich) => [block("heading_1", { rich_text: rich })],
  },
  {
    name: "a nested list item",
    blocks: (rich) => [
      block("bulleted_list_item", { rich_text: [rt("outer")] }, [
        block("bulleted_list_item", { rich_text: rich }),
      ]),
    ],
  },
];

describe("what the browser gets", () => {
  for (const { name, blocks } of FLOW_CASES) {
    it(`compiles ${name} whose underlined run spans a blank line`, async () => {
      const markdown = blocksToMarkdown(
        blocks([rt("intro "), rt("a\n\nb", { underline: true })]),
        ctx,
      );
      const container = await renderMdx(markdown);

      expect(container.querySelectorAll("u")).toHaveLength(1);
      expect(container.querySelector("u")?.textContent).toBe("a\n\nb");
      expect(container.textContent).toContain("intro ");
    });

    it(`compiles ${name} whose bold run spans a blank line`, async () => {
      const markdown = blocksToMarkdown(
        blocks([rt("a\n\nb", { bold: true })]),
        ctx,
      );
      const container = await renderMdx(markdown);

      expect(container.querySelectorAll("strong")).toHaveLength(1);
      expect(container.querySelector("strong")?.textContent).toBe("a\n\nb");
      expect(container.textContent).not.toContain("**");
    });
  }

  it("renders a single break inside the element that carries it", async () => {
    const container = await renderMdx(
      paragraph(["x "], ["a\nb", { underline: true }]),
    );

    expect(container.querySelector("u")?.textContent).toBe("a\nb");
    expect(container.textContent).toBe("x a\nb");
  });

  it("renders the exact line endings the page recorded", async () => {
    const crlf = await renderMdx(paragraph(["a\r\nb", { underline: true }]));
    const cr = await renderMdx(paragraph(["a\rb", { underline: true }]));

    expect(crlf.querySelector("u")?.textContent).toBe("a\r\nb");
    expect(cr.querySelector("u")?.textContent).toBe("a\rb");
  });

  it("renders the combination the page recorded", async () => {
    const container = await renderMdx(
      paragraph([
        "a\n\nb",
        { underline: true, bold: true, italic: true, strikethrough: true },
      ]),
    );

    expect(container.querySelector("u strong em del")?.textContent).toBe(
      "a\n\nb",
    );
  });

  it("renders a multiline underline inside its link", async () => {
    const container = await renderMdx(
      paragraph(["a\n\nb", { underline: true, href: "https://example.com" }]),
    );

    expect(container.querySelector("a u")?.textContent).toBe("a\n\nb");
    expect(container.querySelector("a")?.getAttribute("href")).toBe(
      "https://example.com",
    );
  });

  it("renders a multiline code run inside its underline", async () => {
    const container = await renderMdx(
      paragraph(["a\n\nb", { underline: true, code: true }]),
    );

    expect(container.querySelector("u code")?.textContent).toBe("a\n\nb");
  });
});

describe("the trip back into Notion", () => {
  const cases: RichText[][] = [
    [rt("a\nb", { underline: true })],
    [rt("a\n\nb", { underline: true })],
    [rt("a\r\nb", { underline: true })],
    [rt("a\rb", { underline: true })],
    [rt("a\n\nb", { underline: true, bold: true })],
    [rt("a\n\nb", { underline: true, code: true })],
    [rt("a\n\nb", { underline: true, href: "https://example.com" })],
    [rt("a\n\nb", { bold: true })],
    [rt("a\n\nb", { italic: true, strikethrough: true })],
    [rt("a\n\nb", { href: "https://example.com" })],
    [rt("plain "), rt("a\n\nb", { underline: true }), rt(" tail")],
  ];

  for (const original of cases) {
    it(`round-trips ${JSON.stringify(original.map((run) => run.plain_text))}`, () => {
      expect(semantic(roundTrip(original))).toEqual(semantic(original));
    });
  }

  it("round-trips the runs Notion split the break across, as one run", () => {
    const original = [
      rt("a\n", { underline: true }),
      rt("\nb", { underline: true }),
    ];

    expect(semantic(roundTrip(original))).toEqual(
      semantic([rt("a\n\nb", { underline: true })]),
    );
  });

  it("reads a whole post back as the blocks it was written from", () => {
    const markdown = blocksToMarkdown(
      [
        block("paragraph", {
          rich_text: [rt("intro "), rt("a\n\nb", { underline: true })],
        }),
      ],
      ctx,
    );
    const [first] = markdownToBlocks(markdown) as unknown as Array<{
      paragraph: { rich_text: Array<{ text: { content: string } }> };
    }>;

    expect(
      first.paragraph.rich_text.map((run) => run.text.content).join(""),
    ).toBe("intro a\n\nb");
  });
});

// The contexts that flatten their own line endings keep doing exactly that: a
// cell renders two lines as two lines, and encoding them as references there
// would quietly turn the break into a space.
describe("the contexts that never let a raw line ending through", () => {
  it("still writes a table cell's break as the tag a row can hold", () => {
    const markdown = blocksToMarkdown(
      [
        block("table", { table_width: 1, has_column_header: true }, [
          block("table_row", { cells: [[rt("H")]] }),
          block("table_row", {
            cells: [[rt("a\nb", { underline: true })]],
          }),
        ]),
      ],
      ctx,
    );

    expect(markdown).toContain("<u>a<br />b</u>");
  });

  it("still writes a heading's break as a reference", () => {
    expect(
      blocksToMarkdown(
        [block("heading_1", { rich_text: [rt("a\nb", { underline: true })] })],
        ctx,
      ).trimEnd(),
    ).toBe("## <u>a&#10;b</u>");
  });

  it("still writes an image caption's break as a reference", () => {
    expect(
      blocksToMarkdown(
        [
          block("image", {
            type: "file",
            file: { url: "https://s3/signed" },
            caption: [rt("a\nb", { underline: true })],
          }),
        ],
        ctx,
      ).trimEnd(),
    ).toContain("![<u>a&#10;b</u>]");
  });
});
