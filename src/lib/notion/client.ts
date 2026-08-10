import { Client } from "@notionhq/client";
import { withRetry } from "./retry";
import type { MdBlock } from "./types";

// Pinned explicitly: `archived` became `in_trash` in this version, and database
// queries moved to /v1/data_sources/:id/query in 2025-09-03.
export const NOTION_VERSION = "2026-03-11";

export type PageObject = {
  id: string;
  last_edited_time: string;
  properties: Record<string, unknown>;
};

export function createNotionClient(token: string): Client {
  return new Client({ auth: token, notionVersion: NOTION_VERSION });
}

// A database is a container; its schema and rows live in a data source.
export async function resolveDataSourceId(
  client: Client,
  databaseId: string,
): Promise<string> {
  // @notionhq/client v5 types this as DatabaseObjectResponse | PartialDatabaseObjectResponse;
  // only the full object carries `data_sources`, so narrow rather than cast.
  const database = await withRetry(() =>
    client.databases.retrieve({ database_id: databaseId }),
  );

  const id =
    "data_sources" in database ? database.data_sources[0]?.id : undefined;
  if (!id) {
    throw new Error(
      `database ${databaseId} exposes no data sources — check the integration is connected to it`,
    );
  }
  return id;
}

// Query results mix full pages with partial page/data-source objects; only the
// full page objects carry the properties the frontmatter is built from.
function asPageObject(result: { id: string }): PageObject | undefined {
  if (!("properties" in result) || !("last_edited_time" in result)) {
    return undefined;
  }
  const page = result as {
    id: string;
    last_edited_time: string;
    properties: Record<string, unknown>;
  };
  return {
    id: page.id,
    last_edited_time: page.last_edited_time,
    properties: page.properties,
  };
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
  const pages: PageObject[] = [];
  let cursor: string | undefined;

  do {
    const response = await withRetry(() =>
      client.dataSources.query({
        data_source_id: dataSourceId,
        start_cursor: cursor,
        page_size: 100,
      }),
    );

    for (const result of response.results) {
      const page = asPageObject(result);
      if (page && isPublished(page)) pages.push(page);
    }
    cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
  } while (cursor);

  return pages;
}

// Depth-first walk resolving every child list. Notion paginates children at 100.
export async function fetchBlockTree(
  client: Client,
  blockId: string,
): Promise<MdBlock[]> {
  const blocks: MdBlock[] = [];
  let cursor: string | undefined;

  do {
    const response = await withRetry(() =>
      client.blocks.children.list({
        block_id: blockId,
        start_cursor: cursor,
        page_size: 100,
      }),
    );

    for (const result of response.results as unknown as MdBlock[]) {
      const children = result.has_children
        ? await fetchBlockTree(client, result.id)
        : [];
      blocks.push({ ...result, children });
    }

    cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
  } while (cursor);

  return blocks;
}
