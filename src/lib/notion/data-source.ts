import type { Client } from "@notionhq/client";
import { withReadRetry } from "./retry";

// A Notion database is a container. Its schema and its rows live in a *data
// source*, and since 2025-09-03 every read and write names one: the sync
// queries `data_sources/:id/query`, and the migration creates pages under a
// `data_source_id` parent.
//
// Taking `data_sources[0]` picks whichever one the API happened to list first.
// A database with a second source — an archive, a duplicate someone made, a
// view Notion split off — would then be published from by position rather than
// by choice, and the choice could change between two runs of the same script.
// Worse, the two halves of this repo used to disagree about where the blog even
// is: the sync derived a source from NOTION_DATABASE_ID while the migration was
// handed NOTION_DATA_SOURCE_ID directly, so a post could be migrated into one
// source and looked for in another, with nothing in either script able to
// notice.
//
// So the id is resolved once, here, by the function both scripts call:
//
//   * with no NOTION_DATA_SOURCE_ID set — the ordinary case, and the one the
//     workflow runs on — the database must expose exactly one data source.
//     Zero and two are both refused by name, because neither has an answer this
//     code is entitled to invent;
//   * with one set, it is honored, but only after the database has been asked
//     whether it is actually one of its sources. An id belonging to some other
//     database is exactly the mistake the variable exists to make possible, and
//     it would silently publish somebody else's rows.
//
// Either way the database is read first, so what the sync publishes from and
// what the migration writes into are the same id, chosen for the same reason.

export type DataSourceRef = { id: string; name: string };

export const DATA_SOURCE_ENV = "NOTION_DATA_SOURCE_ID";
export const DATABASE_ENV = "NOTION_DATABASE_ID";

// Notion writes an id either dashed or bare and accepts both, so two spellings
// of one id must compare equal — otherwise a perfectly good
// NOTION_DATA_SOURCE_ID pasted from a URL reads as "not this database's".
function canonical(id: string): string {
  return id.replace(/-/g, "").toLowerCase();
}

function describe(sources: readonly DataSourceRef[]): string {
  return sources
    .map((source) => `${source.id}${source.name === "" ? "" : ` ("${source.name}")`}`)
    .join(", ");
}

// The data sources a database exposes. `databases.retrieve` answers with either
// a full database object or a partial one, and only the full object carries
// `data_sources` — so it is narrowed rather than cast, and a response without
// it fails here rather than as an undefined id three calls later.
export async function listDataSources(
  client: Client,
  databaseId: string,
): Promise<DataSourceRef[]> {
  const id = databaseId.trim();
  if (id === "") {
    throw new Error(
      `a database id is required to resolve a data source — set ${DATABASE_ENV}`,
    );
  }

  const database = await withReadRetry(() =>
    client.databases.retrieve({ database_id: id }),
  );

  if (!("data_sources" in database) || !Array.isArray(database.data_sources)) {
    throw new Error(
      `database ${id} answered without a data source list — check the ` +
        "integration is connected to it and that it is a database rather than " +
        "a page",
    );
  }

  return database.data_sources.map((source) => ({
    id: String(source.id),
    name: typeof source.name === "string" ? source.name : "",
  }));
}

// The one data source this repo reads and writes, for the database it was given.
export async function resolveDataSourceId(
  client: Client,
  databaseId: string,
  explicitId?: string,
): Promise<string> {
  const database = databaseId.trim();
  const wanted = (explicitId ?? "").trim();
  const sources = await listDataSources(client, database);

  if (wanted !== "") {
    const match = sources.find(
      (source) => canonical(source.id) === canonical(wanted),
    );
    if (!match) {
      throw new Error(
        `data source ${wanted} does not belong to database ${database}, which ` +
          `exposes ${sources.length === 0 ? "none" : describe(sources)} — ` +
          `${DATA_SOURCE_ENV} is pointing somewhere else, so nothing was read`,
      );
    }
    return match.id;
  }

  if (sources.length === 0) {
    throw new Error(
      `database ${database} exposes no data sources — check the integration is ` +
        "connected to it",
    );
  }
  if (sources.length > 1) {
    throw new Error(
      `database ${database} exposes ${sources.length} data sources ` +
        `(${describe(sources)}) — set ${DATA_SOURCE_ENV} to the one the blog ` +
        "publishes from, so the sync and the migration read and write the " +
        "same rows; nothing was read",
    );
  }

  return sources[0].id;
}

export type NotionEnv = Record<string, string | undefined>;

// What both scripts call. The database id is required; the data source id is
// optional and only needed by a database that has more than one — so the normal
// setup adds no secret, and a database that grows a second source fails with a
// message naming the variable that resolves it.
export async function resolveConfiguredDataSourceId(
  client: Client,
  env: NotionEnv = process.env,
): Promise<string> {
  const databaseId = (env[DATABASE_ENV] ?? "").trim();
  if (databaseId === "") {
    throw new Error(`missing required environment variable ${DATABASE_ENV}`);
  }

  return resolveDataSourceId(client, databaseId, env[DATA_SOURCE_ENV]);
}
