import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { compileMDX } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import rehypePrettyCode from "rehype-pretty-code";
import type { ReactElement } from "react";
import { blocksToMarkdown } from "../blocks-to-md";
import { richTextToMarkdown } from "../rich-text";
import { longestBacktickRun } from "../code-span";
import { block, rt } from "./fixtures/blocks";

// Notion code blocks and inline code can legitimately contain backticks — a
// post about Markdown is the obvious case. A fixed three-backtick fence is
// closed by the first ``` inside the code, and a single-backtick inline span is
// closed by the first ` inside it, so the rest of the post is reinterpreted as
// prose (or the file fails to compile). These tests compile the generated MDX
// through the same pipeline the post page uses and assert the code survives.

const ctx = { imagePath: (id: string) => `/images/${id}.png` };

async function renderMdx(source: string): Promise<HTMLElement> {
  const { content } = await compileMDX({
    source,
    options: { mdxOptions: { remarkPlugins: [remarkGfm] } },
  });
  return render(content as ReactElement).container;
}

const codeBlock = (code: string, language = "markdown") =>
  blocksToMarkdown([block("code", { rich_text: [rt(code)], language })], ctx);

describe("fenced code blocks with backticks", () => {
  it("opens a longer fence than the longest run inside the code", () => {
    expect(codeBlock("```\nnested\n```")).toBe(
      "````md\n```\nnested\n```\n````\n",
    );
  });

  it("grows the fence past a four-backtick run", () => {
    expect(codeBlock("````\ndeeper\n````")).toBe(
      "`````md\n````\ndeeper\n````\n`````\n",
    );
  });

  it("keeps the ordinary three-backtick fence when the code has none", () => {
    expect(codeBlock("const a = 1;", "typescript")).toBe(
      "```ts\nconst a = 1;\n```\n",
    );
  });

  it("counts the longest run even when backticks are inline", () => {
    expect(codeBlock("a ``` b ````` c")).toBe(
      "``````md\na ``` b ````` c\n``````\n",
    );
  });

  it("compiles to a single code block that still contains the inner fence", async () => {
    const container = await renderMdx(
      `${codeBlock("```\nnested\n```")}\nAfter the block.\n`,
    );
    const blocks = container.querySelectorAll("pre code");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].textContent).toBe("```\nnested\n```\n");
    expect(container.textContent).toContain("After the block.");
  });
});

describe("inline code containing backticks", () => {
  const inline = (text: string) => richTextToMarkdown([rt(text, { code: true })]);

  it("uses a delimiter longer than the longest run inside", () => {
    expect(inline("a`b")).toBe("`` a`b ``");
    expect(inline("a``b")).toBe("``` a``b ```");
  });

  it("pads when the content starts or ends with a backtick", () => {
    expect(inline("`x")).toBe("`` `x ``");
    expect(inline("x`")).toBe("`` x` ``");
  });

  it("pads when the content starts and ends with a space", () => {
    expect(inline(" x ")).toBe("`  x  `");
  });

  it("leaves ordinary inline code untouched", () => {
    expect(inline("searchDocs")).toBe("`searchDocs`");
    expect(inline("Array<{id: string}>")).toBe("`Array<{id: string}>`");
  });

  it("renders the exact original text after compiling", async () => {
    for (const text of ["a`b", "`x", "x`", "a``b", " x ", "searchDocs"]) {
      const container = await renderMdx(
        blocksToMarkdown(
          [block("paragraph", { rich_text: [rt(text, { code: true })] })],
          ctx,
        ),
      );
      const code = container.querySelector("code");
      expect(code?.textContent).toBe(text);
    }
  });

  it("keeps surrounding prose outside the code span", async () => {
    const container = await renderMdx(
      blocksToMarkdown(
        [
          block("paragraph", {
            rich_text: [
              rt("Use "),
              rt("a`b", { code: true }),
              rt(" then stop."),
            ],
          }),
        ],
        ctx,
      ),
    );
    expect(container.querySelector("code")?.textContent).toBe("a`b");
    expect(container.textContent).toBe("Use a`b then stop.");
  });
});

describe("longestBacktickRun", () => {
  it("measures the longest consecutive run", () => {
    expect(longestBacktickRun("")).toBe(0);
    expect(longestBacktickRun("no backticks")).toBe(0);
    expect(longestBacktickRun("a`b")).toBe(1);
    expect(longestBacktickRun("a``b`c")).toBe(2);
    expect(longestBacktickRun("`````")).toBe(5);
  });
});

// The post page also runs rehype-pretty-code over the fence. This is the
// closest thing to production for a code block quoting Markdown.
describe("through the post page's full plugin chain", () => {
  it("highlights a Markdown-quoting block without leaking the inner fence", async () => {
    const { content } = await compileMDX({
      source: `${codeBlock("```\nnested\n```")}\nAfter the block.\n`,
      options: {
        mdxOptions: {
          remarkPlugins: [remarkGfm],
          rehypePlugins: [
            [rehypePrettyCode, { theme: "github-dark", keepBackground: true }],
          ],
        },
      },
    });
    const container = render(content as ReactElement).container;
    expect(container.querySelectorAll("pre code")).toHaveLength(1);
    expect(container.querySelector("pre code")?.textContent).toContain(
      "```",
    );
    expect(container.textContent).toContain("After the block.");
  });
});
