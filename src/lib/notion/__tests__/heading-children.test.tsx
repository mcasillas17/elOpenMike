import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { compileMDX } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import type { ReactElement } from "react";
import { blocksToMarkdown } from "../blocks-to-md";
import { markdownToBlocks } from "../md-to-blocks";
import { block, rt } from "./fixtures/blocks";

// A Notion heading can be toggleable, and a toggleable heading holds blocks.
// The sync fetched every one of them — fetchBlockTree walks any block that
// reports has_children — and then rendered the heading's own line and threw the
// children away. A section written as a collapsible heading published as its
// title and nothing else, and nothing said so.
//
// Markdown has no toggle, but it does not need one: a heading followed by
// content is exactly what a toggleable heading is, minus the ability to fold
// it. That is the same trade the `toggle` block already makes, and it is
// representable, so the content is written rather than the post refused.

const ctx = { imagePath: (id: string) => `/images/${id}.png` };

const markdown = (blocks: Parameters<typeof blocksToMarkdown>[0]) =>
  blocksToMarkdown(blocks, ctx);

async function renderMdx(source: string): Promise<HTMLElement> {
  const { content } = await compileMDX({
    source,
    options: { mdxOptions: { remarkPlugins: [remarkGfm] } },
  });
  return render(content as ReactElement).container;
}

describe("a heading that holds blocks", () => {
  it("writes the heading and then its children", () => {
    expect(
      markdown([
        block("heading_1", { rich_text: [rt("Section")], is_toggleable: true }, [
          block("paragraph", { rich_text: [rt("Hidden until you open it.")] }),
        ]),
      ]),
    ).toBe("## Section\n\nHidden until you open it.\n");
  });

  it("does it at every heading level the sync writes", () => {
    expect(
      markdown([
        block("heading_1", { rich_text: [rt("One")] }, [
          block("paragraph", { rich_text: [rt("under one")] }),
        ]),
        block("heading_2", { rich_text: [rt("Two")] }, [
          block("paragraph", { rich_text: [rt("under two")] }),
        ]),
        block("heading_3", { rich_text: [rt("Three")] }, [
          block("paragraph", { rich_text: [rt("under three")] }),
        ]),
      ]),
    ).toBe(
      "## One\n\nunder one\n\n### Two\n\nunder two\n\n#### Three\n\nunder three\n",
    );
  });

  it("keeps a whole nested section, lists and all", () => {
    expect(
      markdown([
        block("heading_2", { rich_text: [rt("Findings")], is_toggleable: true }, [
          block("paragraph", { rich_text: [rt("Two of them.")] }),
          block("bulleted_list_item", { rich_text: [rt("outer")] }, [
            block("bulleted_list_item", { rich_text: [rt("inner")] }),
          ]),
          block("code", {
            rich_text: [rt("const a = 1;")],
            language: "typescript",
          }),
        ]),
      ]),
    ).toBe(
      "### Findings\n\nTwo of them.\n\n- outer\n  - inner\n\n```ts\nconst a = 1;\n```\n",
    );
  });

  it("writes the children even when the heading itself is empty", () => {
    expect(
      markdown([
        block("heading_1", { rich_text: [] }, [
          block("paragraph", { rich_text: [rt("orphaned but kept")] }),
        ]),
      ]),
    ).toBe("orphaned but kept\n");
  });

  it("leaves a childless heading exactly as it was", () => {
    expect(markdown([block("heading_1", { rich_text: [rt("Alone")] })])).toBe(
      "## Alone\n",
    );
  });

  it("indents a heading's children with it inside a list item", () => {
    expect(
      markdown([
        block("bulleted_list_item", { rich_text: [rt("item")] }, [
          block("heading_3", { rich_text: [rt("Sub")] }, [
            block("paragraph", { rich_text: [rt("body")] }),
          ]),
        ]),
      ]),
    ).toBe("- item\n  #### Sub\n\n  body\n");
  });
});

describe("what the browser gets", () => {
  it("renders the heading and its children as siblings", async () => {
    const container = await renderMdx(
      markdown([
        block("heading_1", { rich_text: [rt("Section")], is_toggleable: true }, [
          block("paragraph", { rich_text: [rt("Hidden until you open it.")] }),
          block("bulleted_list_item", { rich_text: [rt("a point")] }),
        ]),
      ]),
    );

    expect(container.querySelector("h2")?.textContent).toBe("Section");
    expect(container.querySelector("p")?.textContent).toBe(
      "Hidden until you open it.",
    );
    expect(container.querySelector("li")?.textContent).toBe("a point");
  });
});

describe("the trip back into Notion", () => {
  it("migrates the section as the sibling blocks it was written as", () => {
    const source = markdown([
      block("heading_2", { rich_text: [rt("Findings")], is_toggleable: true }, [
        block("paragraph", { rich_text: [rt("Two of them.")] }),
      ]),
    ]);

    expect(markdownToBlocks(source)).toEqual([
      {
        object: "block",
        type: "heading_2",
        heading_2: {
          rich_text: [{ type: "text", text: { content: "Findings" } }],
        },
      },
      {
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [{ type: "text", text: { content: "Two of them." } }],
        },
      },
    ]);
  });
});
