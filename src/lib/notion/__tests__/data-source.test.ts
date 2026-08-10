import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import type { Client } from "@notionhq/client";
import {
  listDataSources,
  resolveConfiguredDataSourceId,
  resolveDataSourceId,
} from "@/lib/notion/data-source";

// A database is a container; its schema and its rows live in a *data source*,
// and a database can hold more than one. Reaching for `data_sources[0]` picks
// whichever one Notion happened to list first: the sync would then publish from
// a source nobody chose, and the migration — which was handed a data source id
// of its own — could write into a different one entirely. Two halves of the
// same repo pointed at two halves of the same database is how a post gets
// migrated into a source the sync never reads.
//
// So the id is resolved, once, by one function both scripts call: an explicit
// NOTION_DATA_SOURCE_ID is honored but proved to belong to the configured
// database, and without one the database has to expose exactly one source.
// Nothing is guessed, and nothing is read from the wrong place.

type Retrieved = { object: "database"; id: string; data_sources?: unknown };

function fakeClient(responses: Array<Retrieved | Error>) {
  const asked: string[] = [];
  const client = {
    databases: {
      retrieve: async ({ database_id }: { database_id: string }) => {
        asked.push(database_id);
        const next = responses.shift();
        if (!next) throw new Error("retrieved more databases than prepared");
        if (next instanceof Error) throw next;
        return next;
      },
    },
  } as unknown as Client;
  return { client, asked };
}

const database = (
  id: string,
  sources: Array<{ id: string; name: string }>,
): Retrieved => ({ object: "database", id, data_sources: sources });

const source = (id: string, name = `Source ${id}`) => ({ id, name });

describe("listDataSources", () => {
  it("reads every data source the database exposes", async () => {
    const { client, asked } = fakeClient([
      database("db-1", [source("ds-1", "Posts"), source("ds-2", "Archive")]),
    ]);

    await expect(listDataSources(client, "db-1")).resolves.toEqual([
      { id: "ds-1", name: "Posts" },
      { id: "ds-2", name: "Archive" },
    ]);
    expect(asked).toEqual(["db-1"]);
  });

  it("refuses a response that carries no data_sources at all", async () => {
    const { client } = fakeClient([{ object: "database", id: "db-1" }]);

    await expect(listDataSources(client, "db-1")).rejects.toThrow(
      /db-1[\s\S]*data source|data source[\s\S]*db-1/i,
    );
  });
});

describe("resolving without an explicit id", () => {
  it("takes the one data source a normal database has", async () => {
    const { client } = fakeClient([database("db-1", [source("ds-only")])]);

    await expect(resolveDataSourceId(client, "db-1")).resolves.toBe("ds-only");
  });

  it("refuses a database that exposes none", async () => {
    const { client } = fakeClient([database("db-1", [])]);

    await expect(resolveDataSourceId(client, "db-1")).rejects.toThrow(
      /no data sources/i,
    );
  });

  it("refuses to pick between two, and names both", async () => {
    const { client } = fakeClient([
      database("db-1", [source("ds-1", "Posts"), source("ds-2", "Archive")]),
    ]);

    const failure = await resolveDataSourceId(client, "db-1").catch(
      (error: Error) => error.message,
    );

    expect(failure).toMatch(/ds-1/);
    expect(failure).toMatch(/ds-2/);
    expect(failure).toMatch(/Posts/);
    expect(failure).toMatch(/Archive/);
    expect(failure).toMatch(/NOTION_DATA_SOURCE_ID/);
  });

  it("refuses a blank database id rather than querying for one", async () => {
    const { client, asked } = fakeClient([]);

    await expect(resolveDataSourceId(client, "  ")).rejects.toThrow(
      /database id/i,
    );
    expect(asked).toEqual([]);
  });
});

describe("resolving an explicit id", () => {
  it("uses it once it is proved to belong to the database", async () => {
    const { client } = fakeClient([
      database("db-1", [source("ds-1"), source("ds-2")]),
    ]);

    await expect(resolveDataSourceId(client, "db-1", "ds-2")).resolves.toBe(
      "ds-2",
    );
  });

  it("matches it however its dashes are written", async () => {
    const dashed = "248d1e63-1b2a-80f1-9c4d-000b2f2f0001";
    const { client } = fakeClient([database("db-1", [source(dashed)])]);

    await expect(
      resolveDataSourceId(client, "db-1", dashed.replace(/-/g, "")),
    ).resolves.toBe(dashed);
  });

  it("refuses one the database does not expose, and says what it does", async () => {
    const { client } = fakeClient([
      database("db-1", [source("ds-1", "Posts")]),
    ]);

    const failure = await resolveDataSourceId(
      client,
      "db-1",
      "ds-somewhere-else",
    ).catch((error: Error) => error.message);

    expect(failure).toMatch(/ds-somewhere-else/);
    expect(failure).toMatch(/db-1/);
    expect(failure).toMatch(/ds-1/);
  });

  it("refuses it even when the database exposes exactly one source", async () => {
    const { client } = fakeClient([database("db-1", [source("ds-only")])]);

    await expect(
      resolveDataSourceId(client, "db-1", "ds-elsewhere"),
    ).rejects.toThrow(/ds-elsewhere/);
  });

  it("refuses one that belongs to some other database", async () => {
    const { client } = fakeClient([
      database("db-1", [source("ds-1")]),
      database("db-2", [source("ds-2")]),
    ]);

    await expect(resolveDataSourceId(client, "db-1", "ds-2")).rejects.toThrow(
      /ds-2/,
    );
    await expect(resolveDataSourceId(client, "db-2", "ds-2")).resolves.toBe(
      "ds-2",
    );
  });
});

describe("the environment both scripts read", () => {
  it("needs no data source variable for the ordinary one-source database", async () => {
    const { client } = fakeClient([database("db-1", [source("ds-only")])]);

    await expect(
      resolveConfiguredDataSourceId(client, { NOTION_DATABASE_ID: "db-1" }),
    ).resolves.toBe("ds-only");
  });

  it("honors NOTION_DATA_SOURCE_ID when it is set", async () => {
    const { client } = fakeClient([
      database("db-1", [source("ds-1"), source("ds-2")]),
    ]);

    await expect(
      resolveConfiguredDataSourceId(client, {
        NOTION_DATABASE_ID: "db-1",
        NOTION_DATA_SOURCE_ID: "ds-2",
      }),
    ).resolves.toBe("ds-2");
  });

  it("treats a blank NOTION_DATA_SOURCE_ID as unset", async () => {
    const { client } = fakeClient([database("db-1", [source("ds-only")])]);

    await expect(
      resolveConfiguredDataSourceId(client, {
        NOTION_DATABASE_ID: "db-1",
        NOTION_DATA_SOURCE_ID: "   ",
      }),
    ).resolves.toBe("ds-only");
  });

  it("says which variable is missing rather than querying nothing", async () => {
    const { client, asked } = fakeClient([]);

    await expect(resolveConfiguredDataSourceId(client, {})).rejects.toThrow(
      /NOTION_DATABASE_ID/,
    );
    expect(asked).toEqual([]);
  });

  it("still proves an explicit id belongs to the configured database", async () => {
    const { client } = fakeClient([database("db-1", [source("ds-1")])]);

    await expect(
      resolveConfiguredDataSourceId(client, {
        NOTION_DATABASE_ID: "db-1",
        NOTION_DATA_SOURCE_ID: "ds-9",
      }),
    ).rejects.toThrow(/ds-9/);
  });
});

// The resolver only helps if the scripts that talk to Notion actually go
// through it. Both do, and neither reads a data source id of its own.
describe("what the production scripts are wired to", () => {
  const read = (file: string) =>
    fs.readFileSync(path.join(process.cwd(), "scripts", file), "utf8");

  const scripts = ["sync-notion.ts", "mdx-to-notion.ts"];

  it.each(scripts)("%s resolves its data source through the shared resolver", (file) => {
    const source = read(file);

    expect(source).toMatch(/from "\.\.\/src\/lib\/notion\/data-source"/);
    expect(source).toMatch(/resolveConfiguredDataSourceId\(/);
  });

  it.each(scripts)("%s never reaches for a data source itself", (file) => {
    const source = read(file);

    expect(source).not.toMatch(/data_sources\s*\[/);
    expect(source).not.toMatch(/process\.env\.NOTION_DATA_SOURCE_ID/);
    expect(source).not.toMatch(/env\["NOTION_DATA_SOURCE_ID"\]/);
  });

  it("resolves the id once and uses that one everywhere it writes", () => {
    const migration = read("mdx-to-notion.ts");

    // One binding, from the resolver, threaded into the schema read, the
    // query, the plan and the executor.
    expect(
      migration.match(/const dataSourceId = await resolveConfiguredDataSourceId/g),
    ).toHaveLength(1);
    expect(migration).toMatch(/data_sources\/\$\{dataSourceId\}/);
    expect(migration).toMatch(/queryPages\(client, dataSourceId\)/);
    expect(migration).toMatch(/createMigrationExecutor\(\s*client,\s*dataSourceId/);
  });
});
