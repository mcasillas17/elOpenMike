import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { compileMDX } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import type { ReactElement } from "react";
import { blocksToMarkdown, type BlocksToMarkdownContext } from "../blocks-to-md";
import { block, rt } from "./fixtures/blocks";

// A bookmark and a link preview are the two blocks that can emit text of their
// own into the file without a marker in front of it. Everything else writes
// something first — `## `, `- `, `> `, `| ` — which puts the line out of MDX's
// reach; these two write the caption, or the url itself, in column one, exactly
// where a paragraph goes.
//
// MDX reads a line in column one that opens `import ` or `export ` as an ESM
// statement rather than as prose. A caption reading "import the data first"
// therefore either fails to compile — taking the whole post down with it — or,
// when it happens to be valid JavaScript, is *evaluated* and disappears from
// the page without a trace. Notion splits text at arbitrary points, so the
// keyword arrives as "imp" + "ort the data"; and a blank line inside a caption
// starts a new block, so the trigger is not only the caption's first character.
//
// So these compile the emitted markdown with the real MDX compiler and render
// it. Nothing here asserts on a string: the question is what the site does with
// the file, and only the compiler answers that.

const ctx: BlocksToMarkdownContext = {
  imagePath: (id: string) => `/images/${id}.png`,
  onWarning: () => {},
};

const markdownFor = (
  type: "bookmark" | "link_preview",
  payload: Record<string, unknown>,
): string => blocksToMarkdown([block(type, payload)], ctx);

async function renderMdx(markdown: string): Promise<HTMLElement> {
  const { content } = await compileMDX({
    source: markdown,
    options: { mdxOptions: { remarkPlugins: [remarkGfm] } },
  });
  return render(content as ReactElement).container;
}

// The url schemes markdownDestination refuses, so the block falls back to text.
const REJECTED = "javascript:";

const BLOCK_TYPES = ["bookmark", "link_preview"] as const;

describe("a caption that opens with an ESM keyword", () => {
  it.each(BLOCK_TYPES)("still compiles and renders in a %s", async (type) => {
    const markdown = markdownFor(type, {
      url: "https://example.com/a",
      caption: [rt("import the data first")],
    });

    const container = await renderMdx(markdown);

    expect(container.textContent).toContain("import the data first");
  });

  it.each(BLOCK_TYPES)(
    "still compiles when Notion split the keyword across runs in a %s",
    async (type) => {
      const markdown = markdownFor(type, {
        url: "https://example.com/a",
        caption: [rt("imp"), rt("ort"), rt(" the data first")],
      });

      const container = await renderMdx(markdown);

      expect(container.textContent).toContain("import the data first");
    },
  );

  it.each(BLOCK_TYPES)(
    "still compiles when the caption stands alone in a %s",
    async (type) => {
      const markdown = markdownFor(type, {
        url: `${REJECTED}alert(1)`,
        caption: [rt("import the data first")],
      });

      const container = await renderMdx(markdown);

      expect(container.textContent).toContain("import the data first");
    },
  );

  it.each(BLOCK_TYPES)(
    "still compiles when a standalone %s caption split the keyword across runs",
    async (type) => {
      const markdown = markdownFor(type, {
        url: `${REJECTED}alert(1)`,
        caption: [rt("imp"), rt("ort"), rt(" the data first")],
      });

      const container = await renderMdx(markdown);

      expect(container.textContent).toContain("import the data first");
    },
  );

  it.each(BLOCK_TYPES)(
    "keeps an `export` line on the page rather than evaluating it in a %s",
    async (type) => {
      const markdown = markdownFor(type, {
        url: `${REJECTED}alert(1)`,
        caption: [rt("export const config = 1")],
      });

      const container = await renderMdx(markdown);

      expect(container.textContent).toContain("export const config = 1");
    },
  );

  it.each(BLOCK_TYPES)(
    "defuses a keyword that opens a later line of a %s caption",
    async (type) => {
      const markdown = markdownFor(type, {
        url: `${REJECTED}alert(1)`,
        caption: [rt("A caption.\n\nimport maps from './m'\n\nexport const x = 1")],
      });

      const container = await renderMdx(markdown);

      expect(container.textContent).toContain("import maps from './m'");
      expect(container.textContent).toContain("export const x = 1");
    },
  );
});

describe("the url a refused link block falls back to", () => {
  it.each(BLOCK_TYPES)(
    "compiles when the url itself carries an ESM line in a %s",
    async (type) => {
      const markdown = markdownFor(type, {
        url: `${REJECTED}x\n\nimport a from './b'`,
        caption: [],
      });

      const container = await renderMdx(markdown);

      expect(container.textContent).toContain("import a from './b'");
      expect(container.querySelector("a")).toBeNull();
    },
  );

  it.each(BLOCK_TYPES)(
    "keeps an `export` line the url carries visible in a %s",
    async (type) => {
      const markdown = markdownFor(type, {
        url: `${REJECTED}x\n\nexport const leaked = 1`,
        caption: [],
      });

      const container = await renderMdx(markdown);

      expect(container.textContent).toContain("export const leaked = 1");
    },
  );

  it.each(BLOCK_TYPES)(
    "writes no anchor for a %s whose url is not a place to go",
    async (type) => {
      const container = await renderMdx(
        markdownFor(type, { url: `${REJECTED}alert(1)`, caption: [] }),
      );

      expect(container.querySelector("a")).toBeNull();
      expect(container.textContent).toContain("javascript:alert(1)");
    },
  );
});

describe("a link block the converter is happy with", () => {
  it.each(BLOCK_TYPES)("is still an anchor in a %s", async (type) => {
    const container = await renderMdx(
      markdownFor(type, {
        url: "https://example.com/a?b=c#d",
        caption: [rt("The docs")],
      }),
    );

    const anchor = container.querySelector("a");
    expect(anchor?.getAttribute("href")).toBe("https://example.com/a?b=c#d");
    expect(anchor?.textContent).toBe("The docs");
  });

  it.each(BLOCK_TYPES)(
    "uses the url as its own label when a %s has no caption",
    async (type) => {
      const container = await renderMdx(
        markdownFor(type, { url: "https://example.com/a", caption: [] }),
      );

      const anchor = container.querySelector("a");
      expect(anchor?.getAttribute("href")).toBe("https://example.com/a");
      expect(anchor?.textContent).toBe("https://example.com/a");
    },
  );

  // The caption is the link's text, not a block of its own, so a keyword in it
  // is already out of column one — and must not be rewritten into an entity
  // that would show up in the anchor.
  it.each(BLOCK_TYPES)(
    "leaves a keyword in a linked %s caption exactly as written",
    async (type) => {
      const container = await renderMdx(
        markdownFor(type, {
          url: "https://example.com/a",
          caption: [rt("import the data first")],
        }),
      );

      expect(container.querySelector("a")?.textContent).toBe(
        "import the data first",
      );
    },
  );
});
