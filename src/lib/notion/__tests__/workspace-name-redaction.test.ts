import { describe, it, expect } from "vitest";
import type { Client } from "@notionhq/client";
import {
  checkDraftState,
  checkPublishedState,
  compareMetadata,
  migrationRequests,
  planMigration,
  prepareMigration,
  runMigration,
  type LocalPost,
  type MigrationWrite,
  type PageMetadata,
  type PageState,
  type RemotePage,
} from "@/lib/notion/migrate";
import { createMigrationExecutor } from "@/lib/notion/migrate-executor";
import {
  buildStatusProperty,
  schemaProblems,
  type DataSourceSchema,
} from "@/lib/notion/properties";
import {
  listDataSources,
  resolveDataSourceId,
} from "@/lib/notion/data-source";
import { FakeNotion } from "./fixtures/fake-notion";

// A Notion workspace is full of names somebody typed. A Status option is a word
// in a picker, a data source is a database view somebody titled, a property is
// a column somebody added — and each of those names is as free-form as a page
// title. They reach these messages by exactly the route a title does: something
// unexpected turned up, and the message said what it was.
//
// Every one of these messages is printed into a terminal and, for the sync,
// into a public GitHub Actions log. The values that reach a *refusal* are the
// odd ones by definition: the status somebody made for their own workflow, the
// duplicate data source they cut off an archive, the option pasted out of
// somewhere else. Quoting them publishes them.
//
// What a message may carry is what identifies the thing rather than what it
// says: the property this repo already documents by name, the *category* a
// value falls into, a count, and an id — a Notion id is generated rather than
// typed, so it is the one part of a page anybody can safely print.

const SECRETS = [
  "ghp_examplePersonalAccessToken",
  "AKIAEXAMPLEKEY",
  "sk-live-000000",
  "xoxb-slack-token",
  "sessionid=abcdef",
  "internal.corp.example",
  "notion-svc-acct",
  "S3cretP4ss",
  "hunter2",
];

// The names an editor made up, each carrying something that must not be
// reprinted.
const leaky = {
  status: "Blocked on notion-svc-acct:S3cretP4ss",
  option: "Ready — see internal.corp.example",
  source: "Archive (hunter2)",
  propertyType: "rich_text",
};

function expectNoSecrets(messages: readonly string[]): void {
  const said = messages.join("\n");
  for (const secret of SECRETS) expect(said).not.toContain(secret);
  for (const value of [leaky.status, leaky.option, leaky.source]) {
    for (const word of value.split(/[\s,:@()]+/).filter((w) => w.length > 5)) {
      expect(said).not.toContain(word);
    }
  }
}

const statusSchema: DataSourceSchema = {
  Name: { type: "title" },
  Slug: { type: "rich_text" },
  Excerpt: { type: "rich_text" },
  Tags: { type: "multi_select" },
  Status: {
    type: "status",
    status: { options: [{ name: "Draft" }, { name: "Published" }] },
  },
  Published: { type: "date" },
};

const local = (over: Partial<LocalPost> = {}): LocalPost => ({
  file: "a-good-post.mdx",
  slug: "a-good-post",
  title: "A good post",
  date: "2026-05-20",
  excerpt: "A short summary.",
  tags: ["AI"],
  content: "A body.\n",
  ...over,
});

describe("what the plan says about a page in a status it does not write", () => {
  const page = (status: string): RemotePage => ({
    pageId: "page-1",
    slug: "a-good-post",
    title: "A good post",
    status,
  });

  it("says the category rather than the name somebody chose", () => {
    const { errors } = planMigration([local()], [page(leaky.status)]);

    expect(errors).toHaveLength(1);
    expectNoSecrets(errors);
    expect(errors[0]).toContain("a-good-post.mdx");
    expect(errors[0]).toContain("page-1");
    expect(errors[0]).toMatch(/status/i);
  });

  it("still says plainly when a page carries no status at all", () => {
    const { errors } = planMigration([local()], [page("")]);

    expect(errors[0]).toMatch(/no status at all/);
  });

  // The two values this repo writes are its own constants, not anybody's
  // typing, so they stay spelled out: they are the whole point of the message.
  it("keeps naming its own two statuses", () => {
    const { errors } = planMigration([local()], [page(leaky.status)]);

    expect(errors[0]).toContain('"Draft"');
    expect(errors[0]).toContain('"Published"');
  });
});

describe("what a live page's status says while the run is writing", () => {
  const desired: PageMetadata = {
    title: "A good post",
    slug: "a-good-post",
    date: "2026-05-20",
    excerpt: "A short summary.",
    tags: ["AI"],
    statusType: "status",
  };

  const write = {
    slug: "a-good-post",
    file: "a-good-post.mdx",
    title: "A good post",
    blocks: [],
    metadata: desired,
    page: {
      parent: { type: "data_source_id", data_source_id: "ds-1" },
      properties: {},
      children: [],
    },
    appends: [],
  } as unknown as MigrationWrite;

  const state = (over: Partial<PageState> = {}): PageState => ({
    metadata: desired,
    status: "Draft",
    trashed: false,
    versionBefore: "2026-05-20T00:00:00.000Z",
    version: "2026-05-20T00:00:00.000Z",
    blocks: [],
    ...over,
  });

  it("says nothing of the status somebody moved the draft into", () => {
    const verdict = checkDraftState(write, state({ status: leaky.status }), 0);

    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expectNoSecrets([verdict.reason]);
      expect(verdict.reason).toMatch(/status/i);
      expect(verdict.reason).toContain('"Draft"');
    }
  });

  it("says nothing of it after the promotion either", () => {
    const verdict = checkPublishedState(write, state({ status: leaky.status }));

    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expectNoSecrets([verdict.reason]);
      expect(verdict.reason).toContain('"Published"');
    }
  });

  // The Status property's *shape* is a Notion type, not a name: which of the
  // two shapes a page carries is what decides whether a write is even legal.
  it("names the shape of a Status property without quoting anything typed", () => {
    const { identity } = compareMetadata(desired, {
      ...desired,
      statusType: leaky.propertyType,
    });

    expectNoSecrets(identity);
    expect(identity.join(" ")).toMatch(/Status/);
  });

  it("says a property type it does not recognise as just that", () => {
    const { identity } = compareMetadata(desired, {
      ...desired,
      statusType: "Blocked on notion-svc-acct",
    });

    expectNoSecrets(identity);
  });
});

describe("what a claimant list says about the pages in it", () => {
  it("names the page and the category of its status", async () => {
    const notion = new FakeNotion();
    notion.seed({
      slug: "a-good-post",
      title: "Somebody else's post",
      status: leaky.status,
    });

    const prepared = await prepareMigration(
      [local()],
      [],
      { dataSourceId: "ds-1", schema: statusSchema },
      async () => [],
    );
    expect(prepared.errors).toEqual([]);

    const error = await runMigration(
      prepared.writes,
      createMigrationExecutor(notion.client, "ds-1", statusSchema),
    ).then(
      () => undefined,
      (thrown: unknown) => thrown as Error,
    );

    expect(error).toBeDefined();
    expectNoSecrets([error?.message ?? ""]);
    expect(error?.message).toContain("seeded-1");
  });
});

describe("what a renamed title column is called in a refusal", () => {
  it("is called the title, not whatever somebody renamed it to", () => {
    const renamed: DataSourceSchema = {
      [leaky.status]: { type: "title" },
      Slug: { type: "rich_text" },
      Excerpt: { type: "rich_text" },
      Tags: { type: "multi_select" },
      Status: {
        type: "status",
        status: { options: [{ name: "Draft" }, { name: "Published" }] },
      },
      Published: { type: "date" },
    };

    const message = (() => {
      try {
        migrationRequests(
          {
            // Long enough to need more runs than Notion holds in one array,
            // which is the limit a property is measured against.
            create: [local({ title: "T".repeat(2000 * 101) })],
            resume: [],
            skip: [],
            archived: [],
            orphanDrafts: [],
            errors: [],
          },
          { dataSourceId: "ds-1", schema: renamed },
        );
        return "";
      } catch (error: unknown) {
        return (error as Error).message;
      }
    })();

    expectNoSecrets([message]);
    expect(message).toContain("a-good-post.mdx");
    expect(message).toMatch(/title/);
  });
});

describe("what a Status property's options say", () => {  const withOptions = (options: string[]): DataSourceSchema => ({
    ...statusSchema,
    Status: {
      type: "status",
      status: { options: options.map((name) => ({ name })) },
    },
  });

  it("counts the options rather than listing them", () => {
    const schema = withOptions([leaky.option, "In progress", "Blocked"]);

    const problems = schemaProblems(schema);

    expect(problems.length).toBeGreaterThan(0);
    expectNoSecrets(problems);
    // A count is what says "the property exists and is set up for something
    // else" without saying what.
    expect(problems.join("\n")).toMatch(/3 options/);
    expect(problems.join("\n")).toContain('"Draft"');
  });

  it("keeps them out of the thrown error too", () => {
    const schema = withOptions([leaky.option]);

    const thrown = (() => {
      try {
        buildStatusProperty(schema, "Draft", true);
        return "";
      } catch (error: unknown) {
        return (error as Error).message;
      }
    })();

    expectNoSecrets([thrown]);
    expect(thrown).toMatch(/1 option/);
  });

  it("says a property of the wrong type by its type", () => {
    const problems = schemaProblems({
      ...statusSchema,
      Status: { type: "rich_text" },
    });

    expect(problems.join("\n")).toMatch(/rich_text/);
  });

  it("does not repeat a property type Notion does not document", () => {
    const problems = schemaProblems({
      ...statusSchema,
      Status: { type: leaky.status },
    });

    expectNoSecrets(problems);
    expect(problems.length).toBeGreaterThan(0);
  });

  it("says a written property is the wrong type without quoting anything typed", () => {
    const problems = schemaProblems({
      ...statusSchema,
      Excerpt: { type: leaky.status },
    });

    expectNoSecrets(problems);
    expect(problems.join("\n")).toContain("Excerpt");
  });
});

describe("what an ambiguous database says about its data sources", () => {
  const clientWith = (sources: Array<{ id: string; name: string }>): Client =>
    ({
      databases: {
        retrieve: async () => ({ object: "database", data_sources: sources }),
      },
    }) as unknown as Client;

  it("names the sources by id and counts them", async () => {
    const client = clientWith([
      { id: "ds-1", name: "Blog" },
      { id: "ds-2", name: leaky.source },
    ]);

    const message = await resolveDataSourceId(client, "db-1").then(
      () => "",
      (error: unknown) => (error as Error).message,
    );

    expectNoSecrets([message]);
    expect(message).toContain("ds-1");
    expect(message).toContain("ds-2");
    expect(message).toMatch(/2 data sources/);
    expect(message).toContain("NOTION_DATA_SOURCE_ID");
  });

  it("says which ids a mistyped one could have been", async () => {
    const client = clientWith([{ id: "ds-1", name: leaky.source }]);

    const message = await resolveDataSourceId(client, "db-1", "ds-9").then(
      () => "",
      (error: unknown) => (error as Error).message,
    );

    expectNoSecrets([message]);
    expect(message).toContain("ds-9");
    expect(message).toContain("ds-1");
  });

  it("still reads the sources themselves, names and all", async () => {
    const client = clientWith([{ id: "ds-1", name: leaky.source }]);

    // The name is not secret *data* — it is only unsafe to print. Anything
    // choosing a source by name still gets it.
    await expect(listDataSources(client, "db-1")).resolves.toEqual([
      { id: "ds-1", name: leaky.source },
    ]);
  });
});
