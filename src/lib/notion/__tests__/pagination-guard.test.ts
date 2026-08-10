import { describe, expect, it } from "vitest";
import type { Client } from "@notionhq/client";
import { fetchBlockTree, queryPages } from "@/lib/notion/client";

// Notion paginates: `has_more` says there is another page and `next_cursor`
// says where it starts. The two loops that walk those pages read the cursor
// with `?? undefined`, which turns a broken pairing — more results promised,
// no cursor handed over — into a clean end of list. What comes back is then a
// *subset* presented as the whole thing, and every caller treats it as
// complete:
//
//   * the sync builds its desired file set from the pages it received, so a
//     page that never arrived claims no slug and its file on disk is deleted;
//   * the migration plans against the rows it received, so a post that never
//     arrived looks unmigrated and is created a second time;
//   * the resume preflight measures a draft against the blocks it received, so
//     a truncated tree looks like a shorter prefix and the missing blocks are
//     appended again.
//
// A cursor that repeats is the same failure wearing the other mask: the loop
// asks for the same page forever, or (worse) accumulates duplicates.
//
// There is nothing to recover from either shape, so both fail closed — before
// a partial set of rows or a partial block tree is handed to anybody.

type Page = Record<string, unknown>;

const page = (id: string): Page => ({
  object: "page",
  id,
  last_edited_time: "2026-01-01T00:00:00.000Z",
  properties: {
    Slug: { type: "rich_text", rich_text: [{ plain_text: id }] },
    Status: { type: "status", status: { name: "Published" } },
  },
});

type QueryResponse = {
  results: Page[];
  has_more: boolean;
  next_cursor: string | null;
  request_status?: { type: "complete" | "incomplete" };
};

function queryClient(responses: QueryResponse[]): Client {
  return {
    dataSources: {
      query: async () => {
        const next = responses.shift();
        if (!next) throw new Error("queried more pages than were prepared");
        return next;
      },
    },
  } as unknown as Client;
}

type ChildrenResponse = {
  results: Array<Record<string, unknown>>;
  has_more: boolean;
  next_cursor: string | null;
};

const paragraph = (id: string, has_children = false) => ({
  object: "block",
  id,
  type: "paragraph",
  has_children,
  paragraph: { rich_text: [{ type: "text", plain_text: id }] },
});

// Answers each block id from its own prepared script, so a nested list can be
// truncated while its parent's list is whole.
function childrenClient(
  scripts: Record<string, ChildrenResponse[]>,
): { client: Client; calls: string[] } {
  const calls: string[] = [];
  const client = {
    blocks: {
      children: {
        list: async ({ block_id }: { block_id: string }) => {
          calls.push(block_id);
          const next = scripts[block_id]?.shift();
          if (!next) throw new Error(`no response prepared for ${block_id}`);
          return next;
        },
      },
    },
  } as unknown as Client;
  return { client, calls };
}

describe("a data source query promising a page it will not point at", () => {
  it("refuses a null cursor on the first page", async () => {
    const client = queryClient([
      { results: [page("a")], has_more: true, next_cursor: null },
    ]);

    await expect(queryPages(client, "ds-1")).rejects.toThrow(
      /has_more|cursor/i,
    );
  });

  it("refuses a null cursor on a later page, after whole ones", async () => {
    const client = queryClient([
      { results: [page("a")], has_more: true, next_cursor: "c1" },
      { results: [page("b")], has_more: true, next_cursor: null },
    ]);

    await expect(queryPages(client, "ds-1")).rejects.toThrow(/cursor/i);
  });

  it("refuses an empty cursor, and a whitespace one", async () => {
    for (const cursor of ["", "   ", "\n\t"]) {
      const client = queryClient([
        { results: [page("a")], has_more: true, next_cursor: cursor },
      ]);
      await expect(queryPages(client, "ds-1")).rejects.toThrow(/cursor/i);
    }
  });

  it("refuses a cursor it has already followed", async () => {
    const client = queryClient([
      { results: [page("a")], has_more: true, next_cursor: "c1" },
      { results: [page("b")], has_more: true, next_cursor: "c1" },
    ]);

    await expect(queryPages(client, "ds-1")).rejects.toThrow(/cursor/i);
  });

  it("names the data source, so the run is actionable", async () => {
    const client = queryClient([
      { results: [], has_more: true, next_cursor: null },
    ]);

    await expect(queryPages(client, "ds-42")).rejects.toThrow(/ds-42/);
  });

  it("still walks a query that pages properly", async () => {
    const client = queryClient([
      { results: [page("a")], has_more: true, next_cursor: "c1" },
      { results: [page("b")], has_more: true, next_cursor: "c2" },
      { results: [page("c")], has_more: false, next_cursor: null },
    ]);

    const pages = await queryPages(client, "ds-1");

    expect(pages.map((found) => found.id)).toEqual(["a", "b", "c"]);
  });
});

describe("a block tree promising children it will not point at", () => {
  it("refuses a null cursor on the first page of a page's blocks", async () => {
    const { client } = childrenClient({
      "page-1": [
        { results: [paragraph("b1")], has_more: true, next_cursor: null },
      ],
    });

    await expect(fetchBlockTree(client, "page-1")).rejects.toThrow(/cursor/i);
  });

  it("refuses a null cursor on a later page of a page's blocks", async () => {
    const { client } = childrenClient({
      "page-1": [
        { results: [paragraph("b1")], has_more: true, next_cursor: "c1" },
        { results: [paragraph("b2")], has_more: true, next_cursor: null },
      ],
    });

    await expect(fetchBlockTree(client, "page-1")).rejects.toThrow(/cursor/i);
  });

  it("refuses a truncated list of a nested block's children", async () => {
    const { client } = childrenClient({
      "page-1": [
        { results: [paragraph("b1", true)], has_more: false, next_cursor: null },
      ],
      b1: [
        { results: [paragraph("b1-1")], has_more: true, next_cursor: "   " },
      ],
    });

    await expect(fetchBlockTree(client, "page-1")).rejects.toThrow(/cursor/i);
  });

  it("refuses a cursor a child list hands back twice", async () => {
    const { client } = childrenClient({
      "page-1": [
        { results: [paragraph("b1")], has_more: true, next_cursor: "c1" },
        { results: [paragraph("b2")], has_more: true, next_cursor: "c1" },
      ],
    });

    await expect(fetchBlockTree(client, "page-1")).rejects.toThrow(/cursor/i);
  });

  it("names the block whose list broke", async () => {
    const { client } = childrenClient({
      "page-1": [
        { results: [paragraph("b1", true)], has_more: false, next_cursor: null },
      ],
      b1: [{ results: [], has_more: true, next_cursor: null }],
    });

    await expect(fetchBlockTree(client, "page-1")).rejects.toThrow(/b1/);
  });

  it("still walks a tree that pages properly, nesting and all", async () => {
    const { client } = childrenClient({
      "page-1": [
        { results: [paragraph("b1", true)], has_more: true, next_cursor: "c1" },
        { results: [paragraph("b2")], has_more: false, next_cursor: null },
      ],
      b1: [
        { results: [paragraph("b1-1")], has_more: true, next_cursor: "n1" },
        { results: [paragraph("b1-2")], has_more: false, next_cursor: null },
      ],
    });

    const tree = await fetchBlockTree(client, "page-1");

    expect(tree.map((block) => block.id)).toEqual(["b1", "b2"]);
    expect(tree[0].children.map((block) => block.id)).toEqual(["b1-1", "b1-2"]);
  });
});
