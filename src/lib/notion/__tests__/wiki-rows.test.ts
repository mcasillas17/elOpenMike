import { describe, expect, it } from "vitest";
import type { Client } from "@notionhq/client";
import {
  queryPages,
  queryPublishedPages,
  retrievePage,
  type PageObject,
} from "@/lib/notion/client";
import { isPublished, pageSlug, pageTitle } from "@/lib/notion/fetch-post";
import { validateSourceSlugs } from "@/lib/notion/validate";
import { createMigrationExecutor } from "@/lib/notion/migrate-executor";
import type { DataSourceSchema } from "@/lib/notion/properties";

// A data source query does not answer with pages alone. The SDK spells the
// results out as `PageObjectResponse | PartialPageObjectResponse |
// DataSourceObjectResponse | PartialDataSourceObjectResponse`, and a wiki —
// a database whose rows are themselves databases — is where the last two
// actually turn up.
//
// The row filter asked "does it have properties and a last_edited_time?", and a
// data source object has both. So a child database was read as a post: its
// *schema* became the post's properties, and a property configuration is not a
// property value. `Slug` came back as `{ type: "rich_text", rich_text: {} }` —
// an empty object where the runs go — and the first thing to touch it died with
// `(runs ?? []).map is not a function`, a TypeError with nothing in it about
// which database, which row, or which field. That took down the sync before a
// file was written and the migration before its preflight finished.
//
// A row is a page or it is not one. The ones that are not are child data
// sources, which the blog does not publish and skips; anything else claiming to
// be a page but unreadable as one stops the run, because a row that quietly
// vanishes is a post whose file on disk nothing claims — and an unclaimed file
// is one the reconciler deletes.

type Row = Record<string, unknown>;

const page = (id: string, slug: string, status = "Published"): Row => ({
  object: "page",
  id,
  last_edited_time: "2026-01-01T00:00:00.000Z",
  properties: {
    Name: { type: "title", title: [{ plain_text: `Title ${slug}` }] },
    Slug: { type: "rich_text", rich_text: [{ plain_text: slug }] },
    Excerpt: { type: "rich_text", rich_text: [{ plain_text: "An excerpt" }] },
    Tags: { type: "multi_select", multi_select: [] },
    Published: { type: "date", date: { start: "2026-05-20" } },
    Status: { type: "status", status: { name: status } },
  },
});

// What a wiki's row looks like when the row is a database of its own: an
// object, an id, a last_edited_time, and a `properties` map of property
// *configurations* — `{ type: "rich_text", rich_text: {} }` and the like.
const childDataSource = (id: string): Row => ({
  object: "data_source",
  id,
  last_edited_time: "2026-01-01T00:00:00.000Z",
  title: [{ plain_text: "Meeting notes" }],
  properties: {
    Name: { id: "title", name: "Name", type: "title", title: {} },
    Slug: { id: "s", name: "Slug", type: "rich_text", rich_text: {} },
    Tags: {
      id: "t",
      name: "Tags",
      type: "multi_select",
      multi_select: { options: [] },
    },
    Status: {
      id: "st",
      name: "Status",
      type: "status",
      status: { options: [{ name: "Published" }] },
    },
  },
});

// The partial form of the same thing: an object and an id.
const partialDataSource = (id: string): Row => ({ object: "data_source", id });

const partialPage = (id: string): Row => ({ object: "page", id });

type QueryResponse = {
  results: Row[];
  has_more: boolean;
  next_cursor: string | null;
  request_status?: { type: "complete" | "incomplete" };
};

const complete = (results: Row[]): QueryResponse => ({
  results,
  has_more: false,
  next_cursor: null,
  request_status: { type: "complete" },
});

// The error a query refused with. Written as a helper so a query that
// *succeeds* fails the test rather than handing back rows nothing looks at.
async function refusal(work: Promise<unknown>): Promise<Error> {
  try {
    await work;
  } catch (error: unknown) {
    return error as Error;
  }
  throw new Error("the query returned rows instead of refusing");
}

function fakeClient(responses: QueryResponse[]) {
  const asked: Array<Record<string, unknown>> = [];
  const client = {
    dataSources: {
      query: async (args: Record<string, unknown>) => {
        asked.push(args);
        const next = responses.shift();
        if (!next) throw new Error("queried more pages than were prepared");
        return next;
      },
    },
  } as unknown as Client;
  return { client, asked };
}

describe("a wiki's rows", () => {
  it("returns the pages and skips the child databases among them", async () => {
    const { client } = fakeClient([
      complete([
        page("p1", "one"),
        childDataSource("ds-child"),
        page("p2", "two"),
        partialDataSource("ds-other"),
      ]),
    ]);

    const pages = await queryPages(client, "ds");

    expect(pages.map((found: PageObject) => found.id)).toEqual(["p1", "p2"]);
  });

  it("asks Notion for pages in the first place", async () => {
    const { client, asked } = fakeClient([
      { ...complete([page("p1", "one")]), has_more: true, next_cursor: "c1" },
      complete([page("p2", "two")]),
    ]);

    await queryPages(client, "ds");

    expect(asked).toHaveLength(2);
    for (const args of asked) expect(args.result_type).toBe("page");
    expect(asked[1].start_cursor).toBe("c1");
  });

  // The whole point of skipping a child database rather than reading it: the
  // fields the sync reads off a post are property *values*, and a data source
  // carries property *configurations* in the same shape of map.
  it("never lets a schema be read as a post's metadata", async () => {
    const { client } = fakeClient([
      complete([childDataSource("ds-child"), page("p1", "one")]),
    ]);

    const pages = await queryPages(client, "ds");

    expect(pages).toHaveLength(1);
    expect(() => pages.map(pageSlug)).not.toThrow();
    expect(pages.map(pageSlug)).toEqual(["one"]);
    expect(pages.map(pageTitle)).toEqual(["Title one"]);
    expect(pages.map(isPublished)).toEqual([true]);
  });

  it("still filters the pages with the predicate it was given", async () => {
    const { client } = fakeClient([
      complete([page("p1", "one"), childDataSource("ds"), page("p2", "two")]),
    ]);

    const pages = await queryPages(
      client,
      "ds",
      (found) => pageSlug(found) === "two",
    );

    expect(pages.map((found: PageObject) => found.id)).toEqual(["p2"]);
  });

  it("skips them on every page of the results, not just the first", async () => {
    const { client } = fakeClient([
      {
        results: [page("p1", "one"), childDataSource("ds-a")],
        has_more: true,
        next_cursor: "c1",
        request_status: { type: "complete" },
      },
      complete([childDataSource("ds-b"), page("p2", "two")]),
    ]);

    const pages = await queryPages(client, "ds");

    expect(pages.map((found: PageObject) => found.id)).toEqual(["p1", "p2"]);
  });
});

describe("a row that says it is a page and is not readable as one", () => {
  // Dropping it silently is what deletes a post: nothing claims its file, and
  // an unclaimed file is one the reconciler removes.
  it("stops the run rather than quietly returning fewer posts", async () => {
    const { client } = fakeClient([
      complete([page("p1", "one"), partialPage("p2")]),
    ]);

    await expect(queryPages(client, "ds")).rejects.toThrow(/p2/);
  });

  it("stops the run when its properties are not a map of properties", async () => {
    const { client } = fakeClient([
      complete([
        {
          object: "page",
          id: "p2",
          last_edited_time: "2026-01-01T00:00:00.000Z",
          properties: [],
        },
      ]),
    ]);

    await expect(queryPages(client, "ds")).rejects.toThrow(/p2/);
  });

  it("stops the run when it carries no last_edited_time to compare against", async () => {
    const { client } = fakeClient([
      complete([{ object: "page", id: "p3", properties: {} }]),
    ]);

    await expect(queryPages(client, "ds")).rejects.toThrow(/p3/);
  });

  it("says nothing about what the row held", async () => {
    const { client } = fakeClient([
      complete([
        {
          object: "page",
          id: "p4",
          properties: {
            Slug: {
              type: "rich_text",
              rich_text: [{ plain_text: "a-secret-draft" }],
            },
          },
        },
      ]),
    ]);

    const error = await refusal(queryPages(client, "ds"));

    expect(error.message).toContain("p4");
    expect(error.message).not.toContain("a-secret-draft");
  });

  it("refuses through the published-pages wrapper as well", async () => {
    const { client } = fakeClient([complete([partialPage("p5")])]);

    await expect(
      queryPublishedPages(client, "ds", isPublished),
    ).rejects.toThrow(/p5/);
  });
});

describe("a page retrieve that did not answer with a page", () => {
  const retrieving = (answer: unknown) =>
    ({ pages: { retrieve: async () => answer } }) as unknown as Client;

  it("refuses a data source object", async () => {
    await expect(
      retrievePage(retrieving(childDataSource("ds-child")), "ds-child"),
    ).rejects.toThrow(/ds-child/);
  });

  it("refuses a partial page", async () => {
    await expect(
      retrievePage(retrieving(partialPage("p1")), "p1"),
    ).rejects.toThrow(/p1/);
  });

  it("accepts the page it was asked for", async () => {
    const found = await retrievePage(retrieving(page("p1", "one")), "p1");
    expect(pageSlug(found)).toBe("one");
  });
});

// The two preflights that read the whole database before anything is written.
// Both used to die on a wiki with a TypeError from inside a property reader.
describe("the preflights a run makes over a wiki", () => {
  const schema: DataSourceSchema = {
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

  it("lets the sync check its slugs without crashing", async () => {
    const { client } = fakeClient([
      complete([
        page("p1", "one"),
        childDataSource("ds-child"),
        page("p2", "two"),
      ]),
    ]);

    const pages = await queryPublishedPages(client, "ds", isPublished);
    const problems = validateSourceSlugs(
      pages.map((found) => ({ pageId: found.id, slug: pageSlug(found) })),
    );

    expect(problems).toEqual([]);
    expect(pages.map(pageSlug)).toEqual(["one", "two"]);
  });

  it("lets the migration ask who claims a slug without crashing", async () => {
    const { client } = fakeClient([
      complete([childDataSource("ds-child"), page("p1", "one")]),
    ]);

    const executor = createMigrationExecutor(client, "ds", schema);

    await expect(executor.claimants("one")).resolves.toEqual([
      { pageId: "p1", status: "Published" },
    ]);
  });

  it("finds no claimant when the only rows are child databases", async () => {
    const { client } = fakeClient([
      complete([childDataSource("ds-a"), partialDataSource("ds-b")]),
    ]);

    const executor = createMigrationExecutor(client, "ds", schema);

    await expect(executor.claimants("one")).resolves.toEqual([]);
  });
});
