import { Client } from "@notionhq/client";
import { withReadRetry } from "./retry";
import { assertFullBlock } from "./block-shape";
import type { DataSourceSchema } from "./properties";
import type { MdBlock } from "./types";

// Pinned explicitly: `archived` became `in_trash` in this version, and database
// queries moved to /v1/data_sources/:id/query in 2025-09-03.
export const NOTION_VERSION = "2026-03-11";

export type PageObject = {
  id: string;
  last_edited_time: string;
  // `archived` is the legacy flag and `in_trash` its replacement; both are read
  // so a trashed page is recognized whichever one the API version returns.
  archived?: boolean;
  in_trash?: boolean;
  properties: Record<string, unknown>;
};

export function createNotionClient(token: string): Client {
  return new Client({ auth: token, notionVersion: NOTION_VERSION });
}

export async function retrieveDataSourceSchema(
  client: Client,
  dataSourceId: string,
): Promise<DataSourceSchema> {
  const result = await withReadRetry(() =>
    client.request<{ properties?: unknown }>({
      path: `data_sources/${dataSourceId}`,
      method: "get",
    }),
  );
  const properties = result.properties;
  if (
    typeof properties !== "object" ||
    properties === null ||
    Array.isArray(properties) ||
    Object.values(properties).some(
      (property) =>
        typeof property !== "object" ||
        property === null ||
        typeof (property as { type?: unknown }).type !== "string",
    )
  ) {
    throw new Error(
      `data source ${dataSourceId} returned no readable property schema`,
    );
  }
  return properties as DataSourceSchema;
}

// A database is a container; its schema and rows live in a data source, and
// *which* data source is not a question this module gets to answer by position.
// See data-source.ts: one resolver, called by the sync and by the migration, so
// both halves of the repo read and write the same rows.

// Query results mix full pages with partial page/data-source objects; only the
// full page objects carry the properties the frontmatter is built from.
function asPageObject(result: { id: string }): PageObject | undefined {
  if (!("properties" in result) || !("last_edited_time" in result)) {
    return undefined;
  }
  const page = result as {
    id: string;
    last_edited_time: string;
    archived?: boolean;
    in_trash?: boolean;
    properties: Record<string, unknown>;
  };
  return {
    id: page.id,
    last_edited_time: page.last_edited_time,
    archived: page.archived,
    in_trash: page.in_trash,
    properties: page.properties,
  };
}

// Reads a single page's current metadata. Used to revalidate the snapshot the
// query returned once the page's blocks have been fetched (see collect.ts), so
// it goes through the same 429 retry as every other call.
export async function retrievePage(
  client: Client,
  pageId: string,
): Promise<PageObject> {
  const result = await withReadRetry(() =>
    client.pages.retrieve({ page_id: pageId }),
  );
  const page = asPageObject(result);
  if (!page) {
    throw new Error(
      `page ${pageId} returned no properties — the integration may have lost access to it`,
    );
  }
  return page;
}

// Notion answers a query with `request_status`, and it can come back
// `incomplete`: the query hit a server-side limit and what arrived is a subset
// of the rows — reported with `has_more` false and no cursor, so nothing about
// the pagination looks wrong. Reading that as the whole database is what turns
// a truncated answer into deleted posts: a page that never arrived claims no
// slug, its file on disk is therefore unclaimed, and an unclaimed file is one
// the reconciler removes.
//
// There is nothing to recover — the API is saying it cannot give us the rest —
// so the run stops here, before a desired set is built and long before a file
// is compared or deleted. The migration reads the database through the same
// call, where a short answer would instead mean creating a second page for a
// post that is already there.
type QueryStatus = {
  type?: "complete" | "incomplete";
  incomplete_reason?: string;
};

function assertQueryComplete(
  status: QueryStatus | undefined,
  dataSourceId: string,
): void {
  if (status?.type !== "incomplete") return;

  const reason = status.incomplete_reason ?? "no reason given";
  throw new Error(
    `data source ${dataSourceId} returned an incomplete query result ` +
      `(${reason}) — Notion truncated the rows rather than paginating them, ` +
      "so nothing was read, planned, written or deleted this run",
  );
}

// Notion paginates with a pair of fields: `has_more` says another page exists
// and `next_cursor` says where it starts. Reading the cursor as
// `next_cursor ?? undefined` makes a broken pairing — more results promised, no
// cursor handed over — indistinguishable from the end of the list, and every
// caller here treats the end of the list as the whole of it: the sync deletes
// the file of a post whose row never arrived, the migration creates a second
// page for it, and the resume preflight reads a truncated block tree as a
// shorter prefix and appends blocks the page already holds.
//
// A cursor that repeats is the same failure the other way round: the loop asks
// for the same page again, either forever or until the duplicates it collects
// are read as content.
//
// Neither is recoverable — the answer is incoherent, not incomplete — so both
// stop the walk before any partial result reaches a caller. `seen` is per list:
// cursors are only meaningful within the list that issued them, so a nested
// block's children get their own set.
type Paginated = { has_more?: boolean; next_cursor?: string | null };

function nextCursor(
  response: Paginated,
  seen: Set<string>,
  what: string,
): string | undefined {
  if (response.has_more !== true) return undefined;

  const cursor = response.next_cursor;
  if (typeof cursor !== "string" || cursor.trim() === "") {
    throw new Error(
      `${what} reported more results (has_more) but handed back no cursor to ` +
        `follow (next_cursor ${JSON.stringify(cursor ?? null)}) — what arrived ` +
        "is a subset of the list presented as the end of it, so nothing was " +
        "read, planned, written or deleted this run",
    );
  }

  if (seen.has(cursor)) {
    throw new Error(
      `${what} handed back the cursor "${cursor}" a second time — the ` +
        "pagination is looping rather than advancing, so nothing was read, " +
        "planned, written or deleted this run",
    );
  }

  seen.add(cursor);
  return cursor;
}

// Walks every page in the data source. Notion's query does not return trashed
// pages, so what comes back is the live contents of the database.
export async function queryPages(
  client: Client,
  dataSourceId: string,
  accept: (page: PageObject) => boolean = () => true,
): Promise<PageObject[]> {
  const pages: PageObject[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;

  do {
    const response = await withReadRetry(() =>
      client.dataSources.query({
        data_source_id: dataSourceId,
        start_cursor: cursor,
        page_size: 100,
      }),
    );

    assertQueryComplete(response.request_status, dataSourceId);

    for (const result of response.results) {
      const page = asPageObject(result);
      if (page && accept(page)) pages.push(page);
    }
    cursor = nextCursor(response, seen, `data source ${dataSourceId}`);
  } while (cursor);

  return pages;
}

// Deliberately queries WITHOUT a server-side status filter, then filters in
// code via isPublished(). A server filter has to name the property's exact type
// (`status:` vs `select:`), so it breaks if the database uses the other one.
// Filtering client-side works with either, and at blog scale the cost is one
// extra page of results. Draft bodies are never fetched — only published pages
// reach fetchBlockTree — so nothing about a draft is ever written to disk.
export async function queryPublishedPages(
  client: Client,
  dataSourceId: string,
  isPublished: (page: PageObject) => boolean,
): Promise<PageObject[]> {
  return queryPages(client, dataSourceId, isPublished);
}

// Depth-first walk resolving every child list. Notion paginates children at 100.
//
// Every result is proved to be a block this run can convert before it becomes
// one: the response's own type says a result may be a *partial* block — an id
// and nothing else — and casting that to a block is how a post published with
// a paragraph missing. See block-shape.ts.
export async function fetchBlockTree(
  client: Client,
  blockId: string,
): Promise<MdBlock[]> {
  const blocks: MdBlock[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;

  do {
    const response = await withReadRetry(() =>
      client.blocks.children.list({
        block_id: blockId,
        start_cursor: cursor,
        page_size: 100,
      }),
    );

    for (const result of response.results) {
      const block = assertFullBlock(result, blockId);
      const children = block.has_children
        ? await fetchBlockTree(client, block.id)
        : [];
      blocks.push({ ...block, children });
    }

    cursor = nextCursor(response, seen, `the children of block ${blockId}`);
  } while (cursor);

  return blocks;
}
