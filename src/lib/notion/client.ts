import { Client } from "@notionhq/client";
import { withReadRetry } from "./retry";
import { assertFullBlock } from "./block-shape";
import { isOffSite } from "./archived";
import type { DataSourceSchema } from "./properties";
import type { MdBlock } from "./types";

// Pinned explicitly: `archived` became `in_trash` in this version, and database
// queries moved to /v1/data_sources/:id/query in 2025-09-03.
export const NOTION_VERSION = "2026-03-11";

// Everything the constructor takes, derived from the SDK rather than restated,
// so a rename in the client fails `pnpm exec tsc` here.
type NotionClientOptions = NonNullable<ConstructorParameters<typeof Client>[0]>;

// The parts of it a caller here may set: the HTTP layer, so a test can count
// what reaches the wire, and the base URL. Auth, API version and the retry
// policy are this module's to decide.
export type NotionClientOverrides = Pick<
  NotionClientOptions,
  "fetch" | "baseUrl"
>;

// The SDK retries on its own. Version 5 ships `retry: { maxRetries: 2 }` and
// treats a 429 *and a 529* as retryable for every HTTP method — POST and PATCH
// included (Client.js, `canRetry`). That is the one policy this repo cannot
// have: a 529 on `pages.create` does not say whether the page was created, so
// repeating it is how one post becomes two Notion pages claiming one slug — the
// state the sync refuses to publish at all, and the wreckage the migration's
// resume protocol exists to avoid making.
//
// It also made the repo's own budgets fiction. withReadRetry says four
// attempts; underneath, each of those was up to three requests, so a bad minute
// of Notion's day cost twelve, with a back-off nothing here chose.
//
// So the SDK is told to send each request exactly once, and every repeat in
// this repo is one of ours: bounded, capped, and split by whether the call
// changes anything (see retry.ts).
export function createNotionClient(
  token: string,
  overrides: NotionClientOverrides = {},
): Client {
  return new Client({
    auth: token,
    notionVersion: NOTION_VERSION,
    retry: false,
    ...overrides,
  });
}

export type PageObject = {
  id: string;
  last_edited_time: string;
  // The three fields a page carries about where it stands. `archived` is the
  // legacy spelling of `in_trash`, and `is_archived` is a state of its own — a
  // page can be archived without being trashed. All three are read so a page
  // that is off the site is recognized whichever one says so, and whichever API
  // version answered. See archived.ts.
  archived?: boolean;
  in_trash?: boolean;
  is_archived?: boolean;
  properties: Record<string, unknown>;
};

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

// A query's results are not all pages. The SDK spells them out as
// `PageObjectResponse | PartialPageObjectResponse | DataSourceObjectResponse |
// PartialDataSourceObjectResponse`, and a wiki — a database whose rows are
// themselves databases — is where the last two turn up.
//
// The old test was "does it have properties and a last_edited_time?", and a
// data source object has both. So a child database was read as a post, and its
// *schema* became that post's metadata: a property configuration lives in the
// same shape of map as a property value, so `Slug` came back as
// `{ type: "rich_text", rich_text: {} }` — an empty object where the runs go —
// and the first reader to touch it died with `(runs ?? []).map is not a
// function`, a TypeError naming neither the database, nor the row, nor the
// field. It took the sync down before a file was written and the migration down
// in its preflight.
//
// So a row has to say it is a page and carry what a page carries, and the
// answer is narrowed rather than cast.
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asPageObject(result: unknown): PageObject | undefined {
  if (!isRecord(result) || result.object !== "page") return undefined;
  if (typeof result.id !== "string" || result.id === "") return undefined;
  if (typeof result.last_edited_time !== "string") return undefined;
  if (!isRecord(result.properties)) return undefined;

  return {
    id: result.id,
    last_edited_time: result.last_edited_time,
    archived:
      typeof result.archived === "boolean" ? result.archived : undefined,
    in_trash:
      typeof result.in_trash === "boolean" ? result.in_trash : undefined,
    is_archived:
      typeof result.is_archived === "boolean" ? result.is_archived : undefined,
    properties: result.properties,
  };
}

// A row that is a database of its own. A wiki lists them beside its pages, the
// blog does not publish them, and skipping one loses nothing: it was never a
// post and never claimed a file on disk.
function isDataSourceRow(result: unknown): boolean {
  return isRecord(result) && result.object === "data_source";
}

// What the id of a row is worth saying in a message. Ids are generated rather
// than typed, so they are safe to print into a terminal or a public Actions
// log; the row's contents never are.
function rowId(result: unknown): string {
  const id = isRecord(result) ? result.id : undefined;
  return typeof id === "string" && id !== "" ? id : "with no id";
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
      `page ${pageId} did not come back as a readable page — the integration ` +
        "may have lost access to it, or the id names something that is not a " +
        "page",
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
// pages, so what comes back is the live contents of the database — except that
// "live" is not the same as "on the site". Notion promises nothing about
// *archived* pages here, and an archived page is one its author has taken down:
// publishing it puts content back on the blog that somebody removed, and
// counting it as a claimant stops the page that replaced it being published at
// all. So every row is checked and an off-site one is dropped before the
// caller's own filter ever sees it. See archived.ts.
//
// `result_type: "page"` asks the API for the pages alone, which is what this
// repo publishes from — a wiki's rows include the child databases underneath
// it, and those are not posts. The answer is still checked row by row: a
// parameter is a request, not a guarantee, and this is the read every deletion
// downstream is decided from.
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
        result_type: "page",
      }),
    );

    assertQueryComplete(response.request_status, dataSourceId);

    for (const result of response.results) {
      // A child database is a row this database holds and not a post; skipping
      // it loses nothing, because it never claimed a file on disk.
      if (isDataSourceRow(result)) continue;

      const page = asPageObject(result);
      // Anything else has to be readable as a page. Dropping one quietly is
      // how a post is deleted: nothing claims its file, and an unclaimed file
      // is one the reconciler removes — so the run stops here instead, before
      // a desired set is built and long before a file is compared.
      if (!page) {
        throw new Error(
          `data source ${dataSourceId} returned a row (${rowId(result)}) that ` +
            "is neither a page this run can read nor a child data source — " +
            "nothing was read, planned, written or deleted this run",
        );
      }
      // Trashed or archived: not on the site, not this run's to write to, and
      // holding no slug. Dropping one loses nothing — it claims no file on
      // disk — which is what makes archiving a page and re-running a way to
      // take a post down or redo it.
      if (isOffSite(page)) continue;
      if (accept(page)) pages.push(page);
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
