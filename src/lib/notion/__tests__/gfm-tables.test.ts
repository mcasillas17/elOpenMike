import { describe, it, expect } from "vitest";
import { markdownToBlocks } from "@/lib/notion/md-to-blocks";
import { blocksToMarkdown } from "@/lib/notion/blocks-to-md";
import type { MdBlock } from "@/lib/notion/types";
import { block, rt } from "./fixtures/blocks";

// No post below carries an image, so nothing ever asks for a path.
const CONTEXT = { imagePath: (id: string) => `/images/${id}.png` };

// GFM's outer pipes are optional. The migration's were not.
//
//     if (content.startsWith("|") && isTableDelimiterRow(lines[index + 1]))
//
// so a table written the way half of GitHub writes them —
//
//     Command | What it does
//     ------- | ------------
//     sync    | pulls Notion
//
// — was read as a paragraph and pushed into Notion as three lines of prose
// with pipes in them. The site renders that file as a table (remark-gfm), so
// the migration silently turned a table into text: the one outcome this module
// exists to refuse, since a page that arrives as prose is a page nobody can
// tell was ever anything else.
//
// What decides a table is the *delimiter row*, which is what the spec says and
// what remark does: the line under the header is nothing but dashes, colons,
// pipes and spaces, and it has exactly as many cells as the header. Everything
// below is checked against remark-gfm's reading of the same markdown, because
// the file on disk is rendered by remark and migrated by this — and the two
// disagreeing is the bug.

type Block = ReturnType<typeof markdownToBlocks>[number];
type TableBlock = Extract<Block, { table: unknown }>;

const only = (markdown: string): Block => {
  const blocks = markdownToBlocks(markdown);
  expect(blocks).toHaveLength(1);
  return blocks[0];
};

const isTable = (block: Block): block is TableBlock => "table" in block;

// The cells of a table block, as plain text, so a test can say what it means.
function cellsOf(block: Block): string[][] {
  if (!isTable(block)) throw new Error(`not a table: ${JSON.stringify(block)}`);
  return block.table.children.map((row) =>
    row.table_row.cells.map((cell) =>
      cell
        .map((run) => ("text" in run ? run.text.content : ""))
        .join(""),
    ),
  );
}

const GRID = [
  ["Command", "What it does"],
  ["sync", "pulls Notion"],
];

describe("a GFM table, however its author drew the edges", () => {
  const drawings: Array<[string, string]> = [
    [
      "no outer pipes",
      "Command | What it does\n------- | ------------\nsync | pulls Notion",
    ],
    [
      "leading pipes only",
      "| Command | What it does\n| ------- | ------------\n| sync | pulls Notion",
    ],
    [
      "trailing pipes only",
      "Command | What it does |\n------- | ------------ |\nsync | pulls Notion |",
    ],
    [
      "both, as the sync writes them",
      "| Command | What it does |\n| ------- | ------------ |\n| sync | pulls Notion |",
    ],
    [
      "edges the rows disagree about",
      "Command | What it does |\n| ------- | ------------\n| sync | pulls Notion |",
    ],
    [
      "no padding at all",
      "Command|What it does\n---|---\nsync|pulls Notion",
    ],
  ];

  it.each(drawings)("is a table with its rows: %s", (_name, markdown) => {
    const block = only(markdown);
    expect(block.type).toBe("table");
    expect(cellsOf(block)).toEqual(GRID);
    if (!isTable(block)) throw new Error("unreachable");
    expect(block.table.table_width).toBe(2);
    expect(block.table.has_column_header).toBe(true);
  });
});

describe("what the delimiter row is allowed to say", () => {
  it("reads the alignment markers GFM accepts", () => {
    // Notion's table has no per-column alignment, so the markers are read and
    // dropped rather than refused: a table that renders left-aligned instead of
    // centred is a table, and a paragraph of pipes is not.
    const block = only("a | b | c\n:-- | :-: | --:\n1 | 2 | 3");
    expect(block.type).toBe("table");
    expect(cellsOf(block)).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("reads a single column when the row carries a pipe", () => {
    expect(cellsOf(only("a\n| ---\nx"))).toEqual([["a"], ["x"]]);
    expect(cellsOf(only("a\n--- |\nx"))).toEqual([["a"], ["x"]]);
  });
});

describe("prose that merely contains pipes", () => {
  it("stays a paragraph when the next line is not a delimiter row", () => {
    expect(only("| a | b | and no delimiter row").type).toBe("paragraph");
    expect(only("a | b\nc | d").type).toBe("paragraph");
    expect(only("a | b | c\n--- | ---\n1 | 2").type).toBe("paragraph");
    expect(only("a |\n--- | ---").type).toBe("paragraph");
    expect(only(" | b\n--- | ---\n1 | 2").type).toBe("paragraph");
  });

  it("stays a paragraph when the line below is a rule rather than a row", () => {
    // A thematic break is a divider, and the prose on either side of it is
    // prose — three blocks, and not one table.
    expect(markdownToBlocks("a | b\n***\n1 | 2").map((block) => block.type)).toEqual(
      ["paragraph", "divider", "paragraph"],
    );
    expect(only("a | b\n: | :\n1 | 2").type).toBe("paragraph");
    expect(only("a | b\n--- \\| ---\n1 | 2").type).toBe("paragraph");
  });

  // `---` under a line of prose is a setext heading, which is a refusal here —
  // and it stays one however many pipes the line above it has.
  it("is still a setext heading rather than a one-column table", () => {
    for (const markdown of ["Heading\n---", "a | b\n---", "|\n---"]) {
      expect(() => markdownToBlocks(markdown)).toThrow(/setext heading/);
    }
  });

  // `- | -` opens a list, which is what remark reads it as.
  it("is a list where the delimiter row would also be a bullet", () => {
    const blocks = markdownToBlocks("| a | b |\n- | -\n1|2");
    expect(blocks.map((block) => block.type)).toEqual([
      "paragraph",
      "bulleted_list_item",
    ]);
  });
});

describe("a table that starts under a paragraph", () => {
  it("interrupts it, as the render does", () => {
    const blocks = markdownToBlocks("prose here\nCommand | What it does\n--- | ---\nsync | pulls Notion");
    expect(blocks.map((block) => block.type)).toEqual(["paragraph", "table"]);
    expect(cellsOf(blocks[1])).toEqual(GRID);
  });
});

describe("a cell's own pipes", () => {
  it("are the escaped ones, and stay in the cell", () => {
    expect(cellsOf(only("a \\| b | c\n--- | ---\n1 | 2"))).toEqual([
      ["a | b", "c"],
      ["1", "2"],
    ]);
  });
});

describe("where the table stops", () => {
  it("ends at a blank line, an indented line, or a block that opens", () => {
    const stoppers: Array<[string, string[]]> = [
      ["a | b\n--- | ---\n1 | 2\n\ntrailing", ["table", "paragraph"]],
      ["a | b\n--- | ---\n1 | 2\n- item", ["table", "bulleted_list_item"]],
      ["a | b\n--- | ---\n1 | 2\n> quoted", ["table", "quote"]],
      ["a | b\n--- | ---\n1 | 2\n## heading", ["table", "heading_1"]],
    ];

    for (const [markdown, types] of stoppers) {
      expect(markdownToBlocks(markdown).map((block) => block.type)).toEqual(
        types,
      );
    }
  });
});

// The two converters are a pair: a post syncs out of Notion as markdown and has
// to migrate back in as the blocks it came from. Whichever way the author drew
// the edges, the table that reaches Notion is one table — and writing it back
// out and reading it again has to land on exactly the same blocks.
describe("a table pushed in, written out, and pushed in again", () => {
  // The migration's request shape, in the shape the sync reads back off a page,
  // so one table can be pushed and pulled inside a single test.
  const asPage = (blocks: Block[]): MdBlock[] =>
    blocks.map((migrated) => {
      if (!isTable(migrated)) throw new Error("not a table");
      return block(
        "table",
        {
          table_width: migrated.table.table_width,
          has_column_header: migrated.table.has_column_header,
        },
        migrated.table.children.map((row) =>
          block("table_row", {
            cells: row.table_row.cells.map((cell) =>
              cell.map((run) => rt("text" in run ? run.text.content : "")),
            ),
          }),
        ),
      );
    });

  const roundTrip = (markdown: string): Block[] =>
    markdownToBlocks(blocksToMarkdown(asPage(markdownToBlocks(markdown)), CONTEXT));

  it.each([
    ["no outer pipes", "a | b\n--- | ---\n1 | 2"],
    ["leading pipes only", "| a | b\n| --- | ---\n| 1 | 2"],
    ["trailing pipes only", "a | b |\n--- | --- |\n1 | 2 |"],
    ["both", "| a | b |\n| --- | --- |\n| 1 | 2 |"],
    ["alignment markers", "a | b\n:-: | --:\n1 | 2"],
    ["an escaped pipe in a cell", "a \\| b | c\n--- | ---\n1 | 2"],
    ["one column", "a\n| --- |\n1"],
  ])("comes back as the same table: %s", (_name, markdown) => {
    const first = markdownToBlocks(markdown);
    expect(first.map((block) => block.type)).toEqual(["table"]);
    expect(roundTrip(markdown)).toEqual(first);
  });
});

// The other half of the pair: prose that merely looks like a table is written
// out with the one line that would build one defused, and now that a table no
// longer needs its outer pipes, that escaping is what keeps a paragraph a
// paragraph on the way back in.
describe("a Notion paragraph that reads like a table", () => {
  it("survives the sync and the migration as a paragraph", () => {
    const page = [
      block("paragraph", {
        rich_text: [rt("Name | Value\n---- | -----\nSlug | a-post")],
      }),
    ];

    const markdown = blocksToMarkdown(page, CONTEXT);
    expect(markdownToBlocks(markdown).map((migrated) => migrated.type)).toEqual([
      "paragraph",
    ]);
  });
});
