import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { compileMDX } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import type { ReactElement } from "react";
import { blocksToMarkdown, type BlocksToMarkdownContext } from "../blocks-to-md";
import { block, rt } from "./fixtures/blocks";
import type { MdBlock } from "../types";

// Notion rich text carries the author's own line endings: shift+enter in a
// heading, a pasted paragraph inside a list item, a caption typed over two
// lines. Markdown puts a marker in front of the *first* line of a block — `## `,
// `- `, `> `, `| ` — and in front of nothing else, so every line after the first
// used to be written exactly where a new block starts: column one.
//
// That is the one column MDX reads `import ` and `export ` as ESM in. A heading
// whose second line opens "export const config = 1" is not a heading with two
// lines, it is a heading followed by a module declaration: the line is
// evaluated, disappears from the page, and takes whatever it declared with it.
// A line that is not valid JavaScript is worse — acorn refuses it and the whole
// post stops compiling.
//
// A blank line does the same thing from inside a wrapper that has to stay on
// one line: `![a` + `import x](/y.png)` is not an image at all, and neither is
// `[a` + `export const c = 1](https://x)` a link.
//
// So every one of these compiles the emitted markdown with the real MDX
// compiler and renders it. Nothing here asserts on a string: the question is
// what the site does with the file, and only the compiler answers that.

const ctx: BlocksToMarkdownContext = {
  imagePath: (id: string) => `/images/${id}.png`,
  onWarning: () => {},
};

async function renderMdx(markdown: string): Promise<HTMLElement> {
  const { content } = await compileMDX({
    source: markdown,
    options: { mdxOptions: { remarkPlugins: [remarkGfm] } },
  });
  return render(content as ReactElement).container;
}

const renderBlocks = (blocks: MdBlock[]): Promise<HTMLElement> =>
  renderMdx(blocksToMarkdown(blocks, ctx));

// The two keywords, one that is valid JavaScript and one that is not: the first
// is evaluated and vanishes, the second stops the build. Both are prose here.
const IMPORT = `import maps from "./m"`;
const EXPORT = "export const config = 1";

// The same text three ways: whole, split by Notion at the worst possible
// points, and separated by a blank line rather than a single one — which is
// what ends a paragraph and opens the next block in column one.
const wholeRuns = (keyword: string) => [rt(`Intro\n${keyword} first`)];
const blankLineRuns = (keyword: string) => [rt(`Intro\n\n${keyword} first`)];
const splitRuns = (keyword: string) => [
  rt("Intro\n\n"),
  rt(keyword.slice(0, 3)),
  rt(keyword.slice(3)),
  rt(" first"),
];

const SHAPES = [
  ["a continuation line", wholeRuns],
  ["a line after a blank one", blankLineRuns],
  ["a keyword Notion split across runs", splitRuns],
] as const;

const KEYWORDS = [
  ["import", IMPORT],
  ["export", EXPORT],
] as const;

// Every block that can carry rich text of its own, with the assertion that says
// its wrapper survived the treatment as well as its words.
const CASES: Array<{
  name: string;
  make(runs: ReturnType<typeof wholeRuns>): MdBlock[];
  intact(container: HTMLElement): void;
  // Where the block's own words end up. Everything reads them out of the
  // rendered text; an image reads them out of the alt attribute they are.
  said?(container: HTMLElement): string;
}> = [
  {
    name: "heading_1",
    make: (rich_text) => [block("heading_1", { rich_text })],
    intact: (container) => expect(container.querySelector("h2")).not.toBeNull(),
  },
  {
    name: "heading_2",
    make: (rich_text) => [block("heading_2", { rich_text })],
    intact: (container) => expect(container.querySelector("h3")).not.toBeNull(),
  },
  {
    name: "heading_3",
    make: (rich_text) => [block("heading_3", { rich_text })],
    intact: (container) => expect(container.querySelector("h4")).not.toBeNull(),
  },
  {
    name: "bulleted_list_item",
    make: (rich_text) => [block("bulleted_list_item", { rich_text })],
    intact: (container) => expect(container.querySelectorAll("li")).toHaveLength(1),
  },
  {
    name: "numbered_list_item",
    make: (rich_text) => [block("numbered_list_item", { rich_text })],
    intact: (container) => {
      expect(container.querySelector("ol")).not.toBeNull();
      expect(container.querySelectorAll("li")).toHaveLength(1);
    },
  },
  {
    name: "to_do",
    make: (rich_text) => [block("to_do", { rich_text, checked: true })],
    intact: (container) => {
      expect(container.querySelectorAll("li")).toHaveLength(1);
      expect(container.querySelector("input")).not.toBeNull();
    },
  },
  {
    name: "quote",
    make: (rich_text) => [block("quote", { rich_text })],
    intact: (container) =>
      expect(container.querySelector("blockquote")).not.toBeNull(),
  },
  {
    name: "callout",
    make: (rich_text) => [
      block("callout", { rich_text, icon: { type: "emoji", emoji: "💡" } }),
    ],
    intact: (container) =>
      expect(container.querySelector("blockquote")).not.toBeNull(),
  },
  {
    name: "toggle",
    make: (rich_text) => [block("toggle", { rich_text })],
    intact: (container) => expect(container.querySelector("p")).not.toBeNull(),
  },
  {
    name: "table cell",
    make: (rich_text) => [
      block("table", { table_width: 1, has_column_header: true }, [
        block("table_row", { cells: [rich_text] }),
      ]),
    ],
    intact: (container) => {
      expect(container.querySelector("table")).not.toBeNull();
      // A row is one line, so a cell's line endings stay <br />.
      expect(container.querySelectorAll("br").length).toBeGreaterThan(0);
    },
  },
  {
    name: "image alt",
    make: (caption) => [
      block("image", { type: "file", file: { url: "https://s3/x" }, caption }),
    ],
    intact: (container) => {
      const image = container.querySelector("img");
      expect(image).not.toBeNull();
      expect(image?.getAttribute("src")).toMatch(/^\/images\//);
    },
    said: (container) => container.querySelector("img")?.getAttribute("alt") ?? "",
  },
  {
    name: "bookmark label",
    make: (caption) => [
      block("bookmark", { url: "https://example.com/a", caption }),
    ],
    intact: (container) => {
      const anchor = container.querySelector("a");
      expect(anchor?.getAttribute("href")).toBe("https://example.com/a");
    },
  },
  {
    name: "link_preview label",
    make: (caption) => [
      block("link_preview", { url: "https://example.com/a", caption }),
    ],
    intact: (container) => {
      const anchor = container.querySelector("a");
      expect(anchor?.getAttribute("href")).toBe("https://example.com/a");
    },
  },
  {
    name: "bookmark fallback",
    make: (caption) => [block("bookmark", { url: "javascript:alert(1)", caption })],
    intact: (container) => expect(container.querySelector("a")).toBeNull(),
  },
  {
    name: "link_preview fallback",
    make: (caption) => [
      block("link_preview", { url: "javascript:alert(1)", caption }),
    ],
    intact: (container) => expect(container.querySelector("a")).toBeNull(),
  },
  {
    name: "paragraph",
    make: (rich_text) => [block("paragraph", { rich_text })],
    intact: (container) => expect(container.querySelector("p")).not.toBeNull(),
  },
];

describe("a block whose own text runs onto a second line", () => {
  for (const { name, make, intact, said } of CASES) {
    for (const [keywordName, keyword] of KEYWORDS) {
      for (const [shape, runs] of SHAPES) {
        it(`keeps ${keywordName} on the page in a ${name} carrying ${shape}`, async () => {
          const container = await renderBlocks(make(runs(keyword)));
          const text = (said ?? ((el: HTMLElement) => el.textContent ?? ""))(
            container,
          );

          expect(text).toContain("Intro");
          expect(text).toContain(`${keyword} first`);
          intact(container);
        });
      }
    }
  }
});

// A heading is one line of markdown and cannot be anything else, so its own
// text has to stay on that line — with every word still in it.
describe("a heading carrying a line ending", () => {
  it("keeps all of its words inside the heading element", async () => {
    const container = await renderBlocks([
      block("heading_1", { rich_text: [rt("First line\nSecond line")] }),
    ]);

    const heading = container.querySelector("h2");
    expect(heading?.textContent?.replace(/\s+/g, " ")).toBe(
      "First line Second line",
    );
    expect(container.querySelectorAll("p")).toHaveLength(0);
  });

  it("still defuses a closing sequence that a later line ends on", async () => {
    const container = await renderBlocks([
      block("heading_1", { rich_text: [rt("First\nSecond ###")] }),
    ]);

    expect(container.querySelector("h2")?.textContent).toContain("###");
  });

  it("publishes the blocks nested under it as its siblings", async () => {
    const container = await renderBlocks([
      block("heading_1", { rich_text: [rt("Title\n\nexport const c = 1")] }, [
        block("paragraph", { rich_text: [rt("Nested.")] }),
      ]),
    ]);

    expect(container.querySelector("h2")).not.toBeNull();
    expect(container.textContent).toContain("export const c = 1");
    expect(container.textContent).toContain("Nested.");
  });

  // A heading holding nothing but a line ending is an empty heading, and an
  // empty heading is not written at all.
  it("is dropped when it holds nothing but line endings", async () => {
    const markdown = blocksToMarkdown(
      [block("heading_1", { rich_text: [rt("\n\n")] })],
      ctx,
    );

    expect(markdown).toBe("");
  });

  it("still publishes what is nested under an empty one", async () => {
    const container = await renderBlocks([
      block("heading_1", { rich_text: [rt("\n")] }, [
        block("paragraph", { rich_text: [rt("Nested.")] }),
      ]),
    ]);

    expect(container.querySelector("h2")).toBeNull();
    expect(container.textContent).toContain("Nested.");
  });
});

// A list item's continuation belongs to the item, so it is written at the
// item's own content column — which is both what keeps it in the item and what
// puts it out of MDX's reach.
describe("a list item carrying a line ending", () => {
  it("keeps the second paragraph inside the same item", async () => {
    const container = await renderBlocks([
      block("bulleted_list_item", {
        rich_text: [rt("First line\n\nexport const config = 1")],
      }),
    ]);

    const items = container.querySelectorAll("li");
    expect(items).toHaveLength(1);
    expect(items[0].textContent).toContain("export const config = 1");
  });

  it("keeps a numbered item's continuation at its own wider column", async () => {
    const container = await renderBlocks([
      ...Array.from({ length: 10 }, (_, index) =>
        block("numbered_list_item", {
          rich_text: [rt(`Item ${index + 1}\n\nimport a from "./b"`)],
        }),
      ),
    ]);

    const items = container.querySelectorAll("li");
    expect(items).toHaveLength(10);
    for (const item of items) {
      expect(item.textContent).toContain('import a from "./b"');
    }
  });

  it("keeps a to-do's continuation inside the task", async () => {
    const container = await renderBlocks([
      block("to_do", {
        rich_text: [rt("Task\n\nexport const config = 1")],
        checked: false,
      }),
    ]);

    const items = container.querySelectorAll("li");
    expect(items).toHaveLength(1);
    expect(items[0].textContent).toContain("export const config = 1");
  });

  it("still nests the children written under it", async () => {
    const container = await renderBlocks([
      block("bulleted_list_item", { rich_text: [rt("Outer\n\nSecond half")] }, [
        block("bulleted_list_item", { rich_text: [rt("Inner")] }),
      ]),
    ]);

    const outer = container.querySelector("li");
    expect(outer?.textContent).toContain("Second half");
    expect(outer?.querySelectorAll("li")).toHaveLength(1);
  });
});

// The wrappers that have to stay on one line, whatever the author typed into
// them.
describe("a wrapper a line ending would break in half", () => {
  it("keeps an image's alt text in its alt attribute", async () => {
    const container = await renderBlocks([
      block("image", {
        type: "file",
        file: { url: "https://s3/x" },
        caption: [rt("A diagram\n\nexport const config = 1")],
      }),
    ]);

    const image = container.querySelector("img");
    expect(image).not.toBeNull();
    expect(image?.getAttribute("alt")?.replace(/\s+/g, " ")).toBe(
      "A diagram export const config = 1",
    );
  });

  it("keeps a bookmark's caption inside its anchor", async () => {
    const container = await renderBlocks([
      block("bookmark", {
        url: "https://example.com/a",
        caption: [rt("The docs\n\nimport maps from './m'")],
      }),
    ]);

    const anchor = container.querySelector("a");
    expect(anchor?.getAttribute("href")).toBe("https://example.com/a");
    expect(anchor?.textContent?.replace(/\s+/g, " ")).toBe(
      "The docs import maps from './m'",
    );
  });
});
