import { describe, expect, it } from "vitest";
import type { Client } from "@notionhq/client";
import { queryPages, queryPublishedPages } from "@/lib/notion/client";
import type { PageObject } from "@/lib/notion/client";

// Notion answers a data-source query with `request_status`, and it can come
// back `incomplete` — the query hit a server-side limit and what arrived is a
// subset of the rows, with `has_more` false and no cursor to follow. The sync
// read that as the whole database: every page it did not receive claims no
// slug, so its file on disk is unclaimed, and an unclaimed file is one the
// reconciler deletes. A truncated query would quietly unpublish posts nobody
// touched.
//
// There is nothing to recover here — the API is telling us it cannot give us
// the rest — so the run stops before the desired set is planned and before a
// single file is compared, let alone deleted.

type QueryResponse = {
  results: Array<Record<string, unknown>>;
  has_more: boolean;
  next_cursor: string | null;
  request_status?: { type: "complete" | "incomplete"; incomplete_reason?: string };
};

const page = (id: string, slug: string) => ({
  object: "page",
  id,
  last_edited_time: "2026-01-01T00:00:00.000Z",
  properties: {
    Slug: { type: "rich_text", rich_text: [{ plain_text: slug }] },
    Status: { type: "status", status: { name: "Published" } },
  },
});

// A client that hands back the prepared responses in order, recording the
// cursor each call asked for.
function fakeClient(responses: QueryResponse[]) {
  const cursors: Array<string | undefined> = [];
  const client = {
    dataSources: {
      query: async ({ start_cursor }: { start_cursor?: string }) => {
        cursors.push(start_cursor);
        const next = responses.shift();
        if (!next) throw new Error("queried more pages than were prepared");
        return next;
      },
    },
  } as unknown as Client;
  return { client, cursors };
}

const complete = (
  results: Array<Record<string, unknown>>,
  rest: Partial<QueryResponse> = {},
): QueryResponse => ({
  results,
  has_more: false,
  next_cursor: null,
  request_status: { type: "complete" },
  ...rest,
});

describe("a query Notion could not finish", () => {
  it("refuses the first page of results", async () => {
    const { client } = fakeClient([
      {
        results: [page("a", "one")],
        has_more: false,
        next_cursor: null,
        request_status: {
          type: "incomplete",
          incomplete_reason: "query_result_limit_reached",
        },
      },
    ]);

    await expect(queryPages(client, "ds")).rejects.toThrow(
      /incomplete|truncat/i,
    );
  });

  it("says which data source and why, so the run is actionable", async () => {
    const { client } = fakeClient([
      {
        results: [],
        has_more: false,
        next_cursor: null,
        request_status: {
          type: "incomplete",
          incomplete_reason: "query_result_limit_reached",
        },
      },
    ]);

    await expect(queryPages(client, "ds-42")).rejects.toThrow(
      /ds-42[\s\S]*query_result_limit_reached|query_result_limit_reached[\s\S]*ds-42/,
    );
  });

  it("refuses a later page too, after earlier ones came back whole", async () => {
    const { client } = fakeClient([
      {
        results: [page("a", "one")],
        has_more: true,
        next_cursor: "cursor-1",
        request_status: { type: "complete" },
      },
      {
        results: [page("b", "two")],
        has_more: false,
        next_cursor: null,
        request_status: { type: "incomplete" },
      },
    ]);

    await expect(queryPages(client, "ds")).rejects.toThrow(/incomplete/i);
  });

  // The dangerous shape exactly: truncated, but reported as the end of the
  // list, so nothing about the pagination itself looks wrong.
  it("refuses even when has_more says there is nothing left", async () => {
    const { client } = fakeClient([
      {
        results: [page("a", "one")],
        has_more: false,
        next_cursor: null,
        request_status: { type: "incomplete" },
      },
    ]);

    await expect(queryPages(client, "ds")).rejects.toThrow(/incomplete/i);
  });

  it("refuses through the published-pages wrapper as well", async () => {
    const { client } = fakeClient([
      {
        results: [page("a", "one")],
        has_more: false,
        next_cursor: null,
        request_status: { type: "incomplete" },
      },
    ]);

    await expect(
      queryPublishedPages(client, "ds", () => true),
    ).rejects.toThrow(/incomplete/i);
  });
});

describe("a query Notion did finish", () => {
  it("returns every page across every cursor", async () => {
    const { client, cursors } = fakeClient([
      {
        results: [page("a", "one")],
        has_more: true,
        next_cursor: "cursor-1",
        request_status: { type: "complete" },
      },
      complete([page("b", "two"), page("c", "three")]),
    ]);

    const pages = await queryPages(client, "ds");

    expect(pages.map((found: PageObject) => found.id)).toEqual(["a", "b", "c"]);
    expect(cursors).toEqual([undefined, "cursor-1"]);
  });

  it("accepts a response that reports no status at all", async () => {
    const { client } = fakeClient([
      { results: [page("a", "one")], has_more: false, next_cursor: null },
    ]);

    await expect(queryPages(client, "ds")).resolves.toHaveLength(1);
  });

  it("still filters with the predicate it was given", async () => {
    const { client } = fakeClient([
      complete([page("a", "one"), page("b", "two")]),
    ]);

    const pages = await queryPages(client, "ds", (found) => found.id === "b");

    expect(pages.map((found: PageObject) => found.id)).toEqual(["b"]);
  });
});
