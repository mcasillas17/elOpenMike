import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { compileMDX } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import type { ReactElement } from "react";
import { blocksToMarkdown } from "../blocks-to-md";
import {
  inlineToRichText,
  UnsupportedInlineMarkdownError,
} from "../md-to-rich-text";
import { block, rt } from "./fixtures/blocks";

// CommonMark converts every line ending inside a code span into a space before
// it renders, so a backtick span is not somewhere a line break can be kept. The
// sync wrote one anyway: a Notion run annotated `code` and carrying two lines
// went out as `` `a\nb` `` and rendered "a b". Nothing failed, nothing warned,
// and the newline was gone from the page and from the next migration.
//
// So a code run that carries a line ending is written as the `<code>` element
// instead. MDX parses its children as markdown, which is exactly what makes it
// usable: the text is escaped the way any other literal text is, the line
// endings are written as the character references they already render as, and
// nothing is lost in either direction. md-to-rich-text reads that one shape
// back and refuses every other `<code>` it is handed.

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

const code = (markdown: string) =>
  inlineToRichText(markdown).map((item) => {
    if (!("text" in item)) throw new Error("not a text run");
    return {
      text: item.text.content,
      code: item.annotations?.code === true,
      bold: item.annotations?.bold === true,
    };
  });

describe("a code run that carries a line break", () => {
  it("writes the element, not a span markdown would flatten", () => {
    expect(paragraph(["a\nb", { code: true }])).toBe("<code>a&#10;b</code>");
  });

  it("keeps CRLF and a lone carriage return apart", () => {
    expect(paragraph(["a\r\nb", { code: true }])).toBe(
      "<code>a&#13;&#10;b</code>",
    );
    expect(paragraph(["a\rb", { code: true }])).toBe("<code>a&#13;b</code>");
  });

  it("escapes the markdown inside it, because MDX reads the children", () => {
    expect(paragraph(["a *b* `c`\n<T>{x}", { code: true }])).toBe(
      "<code>a \\*b\\* \\`c\\`&#10;&lt;T>&#123;x&#125;</code>",
    );
  });

  it("leaves a single-line code run as the span it always was", () => {
    expect(paragraph(["useState", { code: true }])).toBe("`useState`");
    expect(paragraph(["a`b", { code: true }])).toBe("`` a`b ``");
  });
});

describe("what the browser gets", () => {
  it("renders both lines, in one code element", async () => {
    const container = await renderMdx(
      paragraph(["run "], ["a\nb", { code: true }], [" now"]),
    );

    expect(container.querySelector("code")?.textContent).toBe("a\nb");
    expect(container.textContent).toBe("run a\nb now");
  });

  it("renders the exact line endings the page recorded", async () => {
    const crlf = await renderMdx(paragraph(["x "], ["a\r\nb", { code: true }]));
    const cr = await renderMdx(paragraph(["x "], ["a\rb", { code: true }]));

    expect(crlf.querySelector("code")?.textContent).toBe("a\r\nb");
    expect(cr.querySelector("code")?.textContent).toBe("a\rb");
  });

  it("renders the code text literally, markdown characters and all", async () => {
    const container = await renderMdx(
      paragraph(["x "], ["a *b* `c` <T>\nend", { code: true }]),
    );

    expect(container.querySelector("code")?.textContent).toBe(
      "a *b* `c` <T>\nend",
    );
    expect(container.querySelector("code")?.querySelector("em")).toBeNull();
  });

  it("keeps the annotations wrapped around it", async () => {
    const markdown = paragraph(["x "], ["a\nb", { code: true, bold: true }]);
    const container = await renderMdx(markdown);

    expect(container.querySelector("strong code")?.textContent).toBe("a\nb");
  });
});

describe("the trip back into Notion", () => {
  it("reads the element back as the code run it stands for", () => {
    expect(code(paragraph(["a\nb", { code: true }]))).toEqual([
      { text: "a\nb", code: true, bold: false },
    ]);
  });

  it("round-trips CRLF, a lone CR and escaped markdown exactly", () => {
    for (const text of ["a\r\nb", "a\rb", "a *b* `c` <T>{x}\nend", "\n"]) {
      expect(code(paragraph([text, { code: true }]))).toEqual([
        { text, code: true, bold: false },
      ]);
    }
  });

  it("round-trips the annotations around it", () => {
    expect(code(paragraph(["a\nb", { code: true, bold: true }]))).toEqual([
      { text: "a\nb", code: true, bold: true },
    ]);
  });

  it("refuses every other code element", () => {
    for (const markdown of [
      '<code class="x">a</code>',
      "<code >a</code>",
      "<CODE>a</CODE>",
      "<code>a",
      "<code>a</em>",
      "<code>a<strong>b</strong></code>",
      "<code>a`b`c</code>",
      "<code>a*b*c</code>",
      "<code>a[b](c)</code>",
      "<code>a<script>b</script></code>",
      "<code>a{x}</code>",
      "<code>a\\d</code>",
    ]) {
      expect(() => inlineToRichText(markdown)).toThrow(
        UnsupportedInlineMarkdownError,
      );
    }
  });

  // A hand-written post can spread a backtick span over two lines, and the
  // renderer makes that one space. Storing the newline instead would put text
  // into Notion that the page never showed, and the next sync would then write
  // a `<code>` element nobody asked for.
  it("reads a span split across lines the way the renderer does", () => {
    expect(code("`a\nb`")).toEqual([{ text: "a b", code: true, bold: false }]);
    expect(code("`a\r\nb`")).toEqual([{ text: "a b", code: true, bold: false }]);
    expect(code("`a\rb`")).toEqual([{ text: "a b", code: true, bold: false }]);
  });
});
