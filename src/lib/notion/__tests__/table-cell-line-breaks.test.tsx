import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { compileMDX } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import type { ReactElement } from "react";
import { blocksToMarkdown } from "../blocks-to-md";
import { markdownToBlocks } from "../md-to-blocks";
import {
  inlineToRichText,
  UnsupportedInlineMarkdownError,
} from "../md-to-rich-text";
import { block, rt } from "./fixtures/blocks";

// A GFM table row is one line, so a Notion cell holding two lines has nowhere
// to put the break except `<br />` — which is what the sync writes. The
// migration then read that cell back through the inline parser, which refuses
// every `<` it does not recognize, and the whole run stopped on a table the
// sync itself had produced.
//
// `<br />` in a cell is this converter's own output, so it reads back as the
// line ending it stands for. Nothing else does: a bare `<br>`, a tag with an
// attribute, a different spelling, or the same tag anywhere but a cell is raw
// HTML and is still refused.

const ctx = { imagePath: (id: string) => `/images/${id}.png` };

const table = (rows: string[][], annotate: Parameters<typeof rt>[1] = {}) =>
  blocksToMarkdown(
    [
      block("table", { table_width: rows[0].length, has_column_header: true },
        rows.map((row) =>
          block("table_row", {
            cells: row.map((cell) => [rt(cell, annotate)]),
          }),
        ),
      ),
    ],
    ctx,
  );

const cellRuns = (markdown: string) => {
  const [first] = markdownToBlocks(markdown);
  const rows = (first as unknown as { table: { children: unknown[] } }).table
    .children as Array<{ table_row: { cells: Array<Array<{ text: { content: string }; annotations?: Record<string, boolean> }>> } }>;
  return rows.map((row) =>
    row.table_row.cells.map((cell) =>
      cell.map((run) => run.text.content).join(""),
    ),
  );
};

async function renderMdx(source: string): Promise<HTMLElement> {
  const { content } = await compileMDX({
    source,
    options: { mdxOptions: { remarkPlugins: [remarkGfm] } },
  });
  return render(content as ReactElement).container;
}

describe("a table cell holding two lines", () => {
  it("writes the break the sync has always written", () => {
    expect(table([["Metric", "Value"], ["a\nb", "c"]])).toBe(
      "| Metric | Value |\n| --- | --- |\n| a<br />b | c |\n",
    );
  });

  it("reads it back as the line ending it stands for", () => {
    expect(cellRuns(table([["Metric", "Value"], ["a\nb", "c"]]))).toEqual([
      ["Metric", "Value"],
      ["a\nb", "c"],
    ]);
  });

  it("round-trips every line ending Notion hands over", () => {
    for (const cell of ["a\nb", "a\r\nb", "a\rb", "a\nb\nc"]) {
      const markdown = table([["H"], [cell]]);

      // The sync writes one line ending, deterministically, whichever of the
      // three Notion recorded.
      expect(cellRuns(markdown)).toEqual([["H"], [cell.replace(/\r\n|\r/g, "\n")]]);
      expect(blocksToMarkdown(
        markdownToBlocks(markdown).map(asSyncedTable),
        ctx,
      )).toBe(markdown);
    }
  });

  it("keeps the annotations wrapped around the break", () => {
    const markdown = table([["H"], ["a\nb"]], { bold: true });

    expect(markdown).toContain("<br />");
    expect(cellRuns(markdown)).toEqual([["H"], ["a\nb"]]);
  });
});

describe("what the browser gets", () => {
  it("renders the cell as two lines", async () => {
    const container = await renderMdx(
      table([["Metric", "Value"], ["a\nb", "c"]]),
    );

    expect(container.querySelectorAll("tbody td")[0]?.innerHTML).toContain(
      "<br>",
    );
    expect(container.querySelectorAll("tbody td")[0]?.textContent).toBe("ab");
  });
});

describe("everything that is not the tag the sync writes", () => {
  const refuses = (markdown: string) =>
    expect(() => markdownToBlocks(markdown)).toThrow();

  it("refuses a hostile or hand-written tag in a cell", () => {
    for (const cell of [
      "a<br>b",
      "a<br/>b",
      "a<br  />b",
      "a<BR />b",
      'a<br class="x" />b',
      "a<br onclick='x' />b",
      "a<script>alert(1)</script>b",
      "a<img src=x onerror=y />b",
      "a<div>b</div>c",
      "a<br />>b<br",
    ]) {
      refuses(`| H |\n| --- |\n| ${cell} |\n`);
    }
  });

  it("still refuses the tag outside a cell, where nothing writes it", () => {
    expect(() => inlineToRichText("a<br />b")).toThrow(
      UnsupportedInlineMarkdownError,
    );
    refuses("a<br />b\n");
  });

  it("still reads the emphasis elements a cell may legitimately carry", () => {
    expect(cellRuns("| H |\n| --- |\n| <strong>a</strong> |\n")).toEqual([
      ["H"],
      ["a"],
    ]);
  });
});

// One migrated table in the shape the sync reads it back in.
function asSyncedTable(migrated: ReturnType<typeof markdownToBlocks>[number]) {
  const payload = (migrated as unknown as Record<string, Record<string, unknown>>)
    .table;
  const rows = payload.children as Array<{
    table_row: { cells: Array<Array<{ text: { content: string } }>> };
  }>;

  return block(
    "table",
    {
      table_width: payload.table_width,
      has_column_header: payload.has_column_header,
    },
    rows.map((row) =>
      block("table_row", {
        cells: row.table_row.cells.map((cell) =>
          cell.map((run) => rt(run.text.content)),
        ),
      }),
    ),
  );
}
