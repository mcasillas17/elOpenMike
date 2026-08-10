import { describe, expect, it } from "vitest";
import { blocksToMarkdown, type BlocksToMarkdownContext } from "../blocks-to-md";
import { block, rt } from "./fixtures/blocks";

function ctx(overrides: Partial<BlocksToMarkdownContext> = {}): BlocksToMarkdownContext {
  return {
    imagePath: (blockId) => `/images/${blockId}.png`,
    ...overrides,
  };
}

describe("blocksToMarkdown", () => {
  it("shifts Notion headings down one level", () => {
    expect(
      blocksToMarkdown(
        [
          block("heading_1", { rich_text: [rt("One")] }),
          block("heading_2", { rich_text: [rt("Two")] }),
          block("heading_3", { rich_text: [rt("Three")] }),
        ],
        ctx(),
      ),
    ).toBe("## One\n\n### Two\n\n#### Three\n");
  });

  it("separates paragraphs, skips empty paragraphs, and renders quote, divider, and emoji callout", () => {
    expect(
      blocksToMarkdown(
        [
          block("paragraph", { rich_text: [rt("First")] }),
          block("paragraph", { rich_text: [] }),
          block("paragraph", { rich_text: [rt("Second")] }),
          block("quote", { rich_text: [rt("Quoted")] }),
          block("divider", {}),
          block("callout", { rich_text: [rt("Tip")], icon: { type: "emoji", emoji: "💡" } }),
        ],
        ctx(),
      ),
    ).toBe("First\n\nSecond\n\n> Quoted\n\n---\n\n> 💡 Tip\n");
  });

  it("renders bullet, numbered, nested, and todo lists", () => {
    expect(
      blocksToMarkdown(
        [
          block("bulleted_list_item", { rich_text: [rt("Parent")] }, [
            block("bulleted_list_item", { rich_text: [rt("Child")] }),
          ]),
          block("numbered_list_item", { rich_text: [rt("One")] }),
          block("numbered_list_item", { rich_text: [rt("Two")] }),
          block("paragraph", { rich_text: [rt("Break")] }),
          block("numbered_list_item", { rich_text: [rt("Reset")] }),
          block("to_do", { rich_text: [rt("Done")], checked: true }),
          block("to_do", { rich_text: [rt("Todo")], checked: false }),
        ],
        ctx(),
      ),
    ).toBe("- Parent\n  - Child\n\n1. One\n2. Two\n\nBreak\n\n1. Reset\n\n- [x] Done\n- [ ] Todo\n");
  });

  it("skips blank numbered items without consuming the next ordinal or splitting the list", () => {
    expect(
      blocksToMarkdown(
        [
          block("numbered_list_item", { rich_text: [rt("One")] }),
          block("numbered_list_item", { rich_text: [] }),
          block("numbered_list_item", { rich_text: [rt("Three")] }),
        ],
        ctx(),
      ),
    ).toBe("1. One\n2. Three\n");
  });

  it("still resets numbered lists across skipped non-list blocks", () => {
    expect(
      blocksToMarkdown(
        [
          block("numbered_list_item", { rich_text: [rt("One")] }),
          block("paragraph", { rich_text: [] }),
          block("numbered_list_item", { rich_text: [rt("Reset")] }),
        ],
        ctx(),
      ),
    ).toBe("1. One\n\n1. Reset\n");
  });

  it("indents non-list child blocks under list items without changing nested list markers", () => {
    expect(
      blocksToMarkdown(
        [
          block("bulleted_list_item", { rich_text: [rt("Parent")] }, [
            block("paragraph", { rich_text: [rt("Details")] }),
            block("quote", { rich_text: [rt("Quoted")] }),
            block("code", { rich_text: [rt("const x = 1;")], language: "javascript" }),
            block("bulleted_list_item", { rich_text: [rt("Nested bullet")] }),
          ]),
        ],
        ctx(),
      ),
    ).toBe("- Parent\n  Details\n  > Quoted\n  ```js\n  const x = 1;\n  ```\n  - Nested bullet\n");
  });

  it("keeps toggle summaries and children aligned when toggles are nested under list items", () => {
    expect(
      blocksToMarkdown(
        [
          block("bulleted_list_item", { rich_text: [rt("Parent")] }, [
            block("toggle", { rich_text: [rt("More")] }, [block("paragraph", { rich_text: [rt("Details")] })]),
          ]),
        ],
        ctx(),
      ),
    ).toBe("- Parent\n  More\n\n  Details\n");
  });

  it("maps code languages and keeps raw code contents", () => {
    expect(
      blocksToMarkdown(
        [
          block("code", { rich_text: [rt("const value: <T>{};")], language: "typescript" }),
          block("code", { rich_text: [rt("mystery")], language: "made up" }),
        ],
        ctx(),
      ),
    ).toBe("```ts\nconst value: <T>{};\n```\n\n```text\nmystery\n```\n");
  });

  it("renders injected images with caption alt text and GFM tables", () => {
    const image = block("image", { caption: [rt("Caption ", { italic: true }), rt("Alt", { bold: true })] });

    expect(
      blocksToMarkdown(
        [
          image,
          block("table", { table_width: 2, has_column_header: true }, [
            block("table_row", { cells: [[rt("Name")], [rt("Value")]] }),
            block("paragraph", { rich_text: [rt("ignored")] }),
            block("table_row", { cells: [[rt("A")], [rt("1")]] }),
            block("table_row", { cells: [[rt("B")]] }),
          ]),
        ],
        ctx({ imagePath: (blockId) => `/assets/${blockId}.webp` }),
      ),
    ).toBe(`![*Caption ***Alt**](/assets/${image.id}.webp)\n\n| Name | Value |\n| --- | --- |\n| A | 1 |\n| B |  |\n`);
  });

  it("escapes pipes and normalizes newlines inside GFM table cells", () => {
    expect(
      blocksToMarkdown(
        [
          block("table", { table_width: 2, has_column_header: true }, [
            block("table_row", { cells: [[rt("Name")], [rt("Value")]] }),
            block("table_row", { cells: [[rt("A | B")], [rt("Line one\nLine two")]] }),
          ]),
        ],
        ctx(),
      ),
    ).toBe(
      "| Name | Value |\n| --- | --- |\n| A \\| B | Line one<br />Line two |\n",
    );
  });

  it("renders quote and callout children inside the quoted content", () => {
    expect(
      blocksToMarkdown(
        [
          block("quote", { rich_text: [rt("Quoted")] }, [block("paragraph", { rich_text: [rt("Child quote")] })]),
          block("callout", { rich_text: [rt("Tip")] }, [block("paragraph", { rich_text: [rt("Child callout")] })]),
        ],
        ctx(),
      ),
    ).toBe("> Quoted\n>\n> Child quote\n\n> Tip\n>\n> Child callout\n");
  });

  it("warns for unsupported blocks and flattens toggle summaries with children", () => {
    const warnings: string[] = [];

    expect(
      blocksToMarkdown(
        [
          block("breadcrumb", {}),
          block("toggle", { rich_text: [rt("More")] }, [block("paragraph", { rich_text: [rt("Child")] })]),
        ],
        ctx({ onWarning: (message) => warnings.push(message) }),
      ),
    ).toBe("More\n\nChild\n");
    expect(warnings).toEqual(["skipped unsupported block: breadcrumb"]);
  });
});
