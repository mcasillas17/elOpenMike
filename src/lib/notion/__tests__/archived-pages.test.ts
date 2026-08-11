import { describe, it, expect } from "vitest";
import type { Client } from "@notionhq/client";
import {
  queryPages,
  queryPublishedPages,
  retrievePage,
  fetchBlockTree,
  type PageObject,
} from "@/lib/notion/client";
import { collectSources, revalidatePage } from "@/lib/notion/collect";
import { isPublished, pageSlug, pageStatus, pageTitle } from "@/lib/notion/fetch-post";
import {
  checkDraftState,
  checkPublishedState,
  planMigration,
  prepareMigration,
  runMigration,
  type LocalPost,
  type MigrationWrite,
  type PageState,
  type RemotePage,
} from "@/lib/notion/migrate";
import { createMigrationExecutor } from "@/lib/notion/migrate-executor";
import type { DataSourceSchema } from "@/lib/notion/properties";
import { validateSourceSlugs } from "@/lib/notion/validate";
import type { MdBlock } from "@/lib/notion/types";
import { block, rt } from "./fixtures/blocks";
import { FakeNotion } from "./fixtures/fake-notion";

// Notion's page object carries three fields about where a page stands, and this
// repo used to read two of them. `in_trash` says the page is in the trash and
// `archived` is its deprecated spelling — the same fact under the name API
// versions before 2026-03-11 used. `is_archived` is a *different* fact, and the
// SDK has spelled it out since: a page can be archived without being trashed.
//
// An archived page is off the site exactly the way a trashed one is: nobody
// reading the blog can reach it, and the author archived it to take it down.
// Reading only two of the three fields meant the third state was invisible, so
// an archived page was still a page this repo would publish, still resume,
// still append to, still promote, and still count as claiming its slug — which
// is the one thing that stops the *other* page under that slug being published
// at all.
//
// So the three fields are read together, everywhere, through one predicate: any
// of them means off-site, and off-site means the page is left exactly where its
// author put it.

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

const richText = (value: string) => ({
  type: "rich_text",
  rich_text: [{ plain_text: value }],
});

type Standing = {
  archived?: boolean;
  in_trash?: boolean;
  is_archived?: boolean;
};

// The page object as the API answers with it, standing fields and all.
function apiPage(
  slug: string,
  { status = "Published", lastEdited = "2026-06-01T12:00:00.000Z", ...standing }:
    Standing & { status?: string; lastEdited?: string } = {},
): Record<string, unknown> {
  return {
    object: "page",
    id: `page-${slug}`,
    last_edited_time: lastEdited,
    archived: standing.archived ?? false,
    in_trash: standing.in_trash ?? false,
    is_archived: standing.is_archived ?? false,
    properties: {
      Name: { type: "title", title: [{ plain_text: `Title ${slug}` }] },
      Slug: richText(slug),
      Excerpt: richText(`Excerpt ${slug}`),
      Tags: { type: "multi_select", multi_select: [{ name: "AI" }] },
      Published: { type: "date", date: { start: "2026-05-20" } },
      Status: { type: "status", status: { name: status } },
    },
  };
}

const asPageObject = (raw: Record<string, unknown>): PageObject =>
  raw as unknown as PageObject;

const clientReturning = (results: Record<string, unknown>[]): Client =>
  ({
    dataSources: {
      query: async () => ({
        results,
        has_more: false,
        next_cursor: null,
        request_status: { type: "complete" },
      }),
    },
    pages: { retrieve: async ({ page_id }: { page_id: string }) =>
      results.find((page) => page.id === page_id) },
  }) as unknown as Client;

// --- the read that decides what the site publishes -------------------------

describe("the page object this repo narrows a query result into", () => {
  it("carries is_archived off a page retrieve", async () => {
    const client = clientReturning([apiPage("a", { is_archived: true })]);
    const page = await retrievePage(client, "page-a");

    expect(page.is_archived).toBe(true);
    expect(page.in_trash).toBe(false);
  });

  it("never hands an archived row to a caller that would publish it", async () => {
    const client = clientReturning([
      apiPage("live"),
      apiPage("archived", { is_archived: true }),
      apiPage("trashed", { in_trash: true }),
      apiPage("legacy", { archived: true }),
    ]);

    const pages = await queryPublishedPages(client, "ds-1", isPublished);

    expect(pages.map((page) => pageSlug(page))).toEqual(["live"]);
  });

  it("drops an archived row before the caller's own filter sees it", async () => {
    const client = clientReturning([
      apiPage("live"),
      apiPage("archived", { is_archived: true }),
    ]);

    const pages = await queryPages(client, "ds-1");

    expect(pages.map((page) => pageSlug(page))).toEqual(["live"]);
  });
});

// --- the revalidation the sync makes once the blocks are in hand -----------

describe("a page archived while its blocks were loading", () => {
  const before = asPageObject(apiPage("a"));

  it("is refused by the revalidation, whichever field says so", () => {
    for (const standing of [
      { in_trash: true },
      { archived: true },
      { is_archived: true },
    ] satisfies Standing[]) {
      const verdict = revalidatePage(before, asPageObject(apiPage("a", standing)));
      expect(verdict.ok).toBe(false);
    }
  });

  it("says which of the two it is, so the message names the page's state", () => {
    const trashed = revalidatePage(before, asPageObject(apiPage("a", { in_trash: true })));
    const archived = revalidatePage(
      before,
      asPageObject(apiPage("a", { is_archived: true })),
    );

    expect(trashed.ok).toBe(false);
    expect(archived.ok).toBe(false);
    if (!trashed.ok) expect(trashed.message).toContain("trash");
    if (!archived.ok) expect(archived.message).toContain("archiv");
  });

  it("still accepts a page nothing has happened to", () => {
    expect(revalidatePage(before, asPageObject(apiPage("a"))).ok).toBe(true);
  });
});

describe("the sync's collection", () => {
  const body: MdBlock[] = [block("paragraph", { rich_text: [rt("Body.")] })];

  it("publishes nothing for a post archived mid-run and keeps the rest", async () => {
    const live = asPageObject(apiPage("live"));
    const going = asPageObject(apiPage("going"));

    const outcome = await collectSources([live, going], {
      fetchBlocks: async () => body,
      retrievePage: async (pageId) =>
        asPageObject(
          pageId === "page-going"
            ? apiPage("going", { is_archived: true })
            : apiPage("live"),
        ),
    });

    expect(outcome.sources.map((source) => source.slug)).toEqual(["live"]);
    expect(outcome.failures.map((failure) => failure.pageId)).toEqual([
      "page-going",
    ]);
    expect(outcome.failures[0].message).toContain("archiv");
  });
});

// --- the migration's plan ---------------------------------------------------

const localPost = (slug: string): LocalPost => ({
  file: `${slug}.mdx`,
  slug,
  title: `Title ${slug}`,
  date: "2026-05-20",
  excerpt: `Excerpt ${slug}`,
  tags: ["AI"],
  content: "Body one.\n",
});

const remote = (slug: string, over: Partial<RemotePage> = {}): RemotePage => ({
  pageId: `page-${slug}`,
  slug,
  title: `Title ${slug}`,
  status: "Published",
  ...over,
});

describe("planning against a database holding an archived page", () => {
  it("does not let an archived page claim a slug a local post wants", () => {
    const plan = planMigration(
      [localPost("one")],
      [remote("one", { is_archived: true })],
    );

    expect(plan.errors).toEqual([]);
    expect(plan.create.map((post) => post.slug)).toEqual(["one"]);
    expect(plan.skip).toEqual([]);
    expect(plan.resume).toEqual([]);
    expect(plan.archived.map((match) => match.pageId)).toEqual(["page-one"]);
  });

  it("never resumes an archived draft", () => {
    const plan = planMigration(
      [localPost("one")],
      [remote("one", { status: "Draft", is_archived: true })],
    );

    expect(plan.errors).toEqual([]);
    expect(plan.resume).toEqual([]);
    expect(plan.create.map((post) => post.slug)).toEqual(["one"]);
  });

  it("does not count an archived page as a duplicate of a live one", () => {
    const plan = planMigration(
      [localPost("one")],
      [remote("one"), remote("one-old", { slug: "one", is_archived: true })],
    );

    expect(plan.errors).toEqual([]);
    expect(plan.skip.map((match) => match.pageId)).toEqual(["page-one"]);
  });

  it("does not report an archived draft as an orphan nothing on disk claims", () => {
    const plan = planMigration(
      [],
      [remote("stray", { status: "Draft", is_archived: true })],
    );

    expect(plan.orphanDrafts).toEqual([]);
    expect(plan.archived.map((match) => match.pageId)).toEqual(["page-stray"]);
  });
});

// --- every write the protocol makes is earned by a read --------------------

const write = {
  slug: "one",
  file: "one.mdx",
  title: "Title one",
  blocks: [],
  metadata: {
    title: "Title one",
    slug: "one",
    date: "2026-05-20",
    excerpt: "Excerpt one",
    tags: ["AI"],
    statusType: "status",
  },
  page: {
    parent: { type: "data_source_id", data_source_id: "ds-1" },
    properties: {},
    children: [],
  },
  appends: [],
} as unknown as MigrationWrite;

const state = (over: Partial<PageState> = {}): PageState => ({
  metadata: {
    title: "Title one",
    slug: "one",
    date: "2026-05-20",
    excerpt: "Excerpt one",
    tags: ["AI"],
    statusType: "status",
  },
  status: "Draft",
  offSite: undefined,
  versionBefore: "2026-05-20T00:00:00.000Z",
  version: "2026-05-20T00:00:00.000Z",
  blocks: [],
  ...over,
});

describe("the state checks every append and every promotion goes through", () => {
  it("refuses to append to an archived page", () => {
    const verdict = checkDraftState(write, state({ offSite: "archive" }), 0);

    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toContain("archiv");
  });

  it("refuses to accept an archived page as published", () => {
    const verdict = checkPublishedState(
      write,
      state({ status: "Published", offSite: "archive" }),
    );

    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toContain("archiv");
  });

  it("still refuses a trashed page and says so as the trash", () => {
    const verdict = checkDraftState(write, state({ offSite: "trash" }), 0);

    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toContain("trash");
  });
});

// --- the production wiring the script runs ----------------------------------

async function remotePages(notion: FakeNotion): Promise<RemotePage[]> {
  return (await queryPages(notion.client, "ds-1")).map((page) => ({
    pageId: page.id,
    slug: pageSlug(page),
    title: pageTitle(page),
    status: pageStatus(page),
    archived: page.archived,
    in_trash: page.in_trash,
    is_archived: page.is_archived,
  }));
}

async function migrate(notion: FakeNotion, posts: LocalPost[]) {
  const prepared = await prepareMigration(
    posts,
    await remotePages(notion),
    { dataSourceId: "ds-1", schema: statusSchema },
    (pageId) => fetchBlockTree(notion.client, pageId),
  );
  if (prepared.errors.length > 0) return { prepared, written: [] };

  const executor = createMigrationExecutor(notion.client, "ds-1", statusSchema);
  const written = await runMigration(prepared.writes, executor, undefined, {
    sleep: async () => {},
  });
  return { prepared, written };
}

describe("the executor the migration script builds", () => {
  it("reads an archived page back as off-site", async () => {
    const notion = new FakeNotion();
    const pageId = notion.seed({
      slug: "one",
      title: "Title one",
      status: "Draft",
    });
    notion.archive(pageId);

    const executor = createMigrationExecutor(notion.client, "ds-1", statusSchema);
    const read = await executor.readPage(pageId);

    expect(read.offSite).toBe("archive");
  });

  it("does not count an archived page among a slug's claimants", async () => {
    const notion = new FakeNotion();
    const pageId = notion.seed({
      slug: "one",
      title: "Title one",
      status: "Published",
    });
    notion.archive(pageId);

    const executor = createMigrationExecutor(notion.client, "ds-1", statusSchema);

    expect(await executor.claimants("one")).toEqual([]);
  });
});

describe("a run whose page is archived underneath it", () => {  it("writes nothing more once the draft it is filling is archived", async () => {
    const notion = new FakeNotion();
    const post: LocalPost = {
      ...localPost("one"),
      content: Array.from({ length: 120 }, (_, i) => `Para ${i}.`).join("\n\n"),
    };

    // Archived before the read that would earn the first append. Once, so the
    // page's version is steady and what stops the run is the archiving rather
    // than an edit landing mid-read.
    let archived = false;
    notion.beforeRead = (kind, pageId) => {
      if (kind === "retrieve" && !archived) {
        archived = true;
        notion.archive(pageId);
      }
    };

    await expect(migrate(notion, [post])).rejects.toThrow(/archiv/i);

    const mutations = notion.mutations.filter((m) => !m.startsWith("create:"));
    expect(mutations).toEqual([]);
    expect(notion.published).toEqual([]);
  });

  it("leaves a page archived inside the promotion's window exactly as it is", async () => {
    const notion = new FakeNotion();

    // Archived once the promotion has landed, and before the read-back that
    // proves it starts — so the page is off-site rather than merely edited.
    let archived = false;
    notion.beforeRead = (kind, pageId) => {
      if (kind === "retrieve" && notion.published.length > 0 && !archived) {
        archived = true;
        notion.archive(pageId);
      }
    };

    await expect(migrate(notion, [localPost("one")])).rejects.toThrow(/archiv/i);

    // No demotion: an archived page is not on the site, so there is nothing to
    // take off it, and a Status written over it is an edit nobody asked for.
    expect(notion.mutations.filter((m) => m.startsWith("status:"))).toEqual([]);
  });
});

// The promotion's failure means nothing on its own: the write may have landed
// and the answer been lost. The page is read back to find out — and a page read
// back as archived is not on the site, so there is nothing to undo and nothing
// to write. See resolveLostPromotion.
describe("a promotion whose answer was lost, over a page since archived", () => {
  const serverError = (status: number) =>
    Object.assign(new Error(`notion returned ${status}`), { status });

  it("reports what it read and writes nothing over it", async () => {
    const notion = new FakeNotion();
    const prepared = await prepareMigration(
      [localPost("one")],
      await remotePages(notion),
      { dataSourceId: "ds-1", schema: statusSchema },
      (pageId) => fetchBlockTree(notion.client, pageId),
    );
    expect(prepared.errors).toEqual([]);

    const executor = createMigrationExecutor(notion.client, "ds-1", statusSchema);
    const error = await runMigration(
      prepared.writes,
      {
        ...executor,
        // The request never landed, and the page is archived while the run is
        // deciding what that meant.
        async publishPage(pageId) {
          notion.archive(pageId);
          throw serverError(503);
        },
      },
      undefined,
      { sleep: async () => {} },
    ).then(
      () => {
        throw new Error("expected the migration to fail");
      },
      (thrown: unknown) => thrown as Error,
    );

    expect(error.message).toMatch(/archiv/i);
    expect(notion.mutations.filter((m) => !m.startsWith("create:"))).toEqual([]);
    expect(notion.published).toEqual([]);
  });
});

// The preflight reads every draft it means to finish before a single write goes
// out. An archived draft is never one of them, so its blocks are never read and
// its slug is free for the post that replaced it.
describe("the preflight that reads a same-slug draft", () => {
  it("never reads the blocks of an archived draft", async () => {
    const notion = new FakeNotion();
    const pageId = notion.seed({
      slug: "one",
      title: "Title one",
      status: "Draft",
    });
    notion.archive(pageId);

    const read: string[] = [];
    const prepared = await prepareMigration(
      [localPost("one")],
      await remotePages(notion),
      { dataSourceId: "ds-1", schema: statusSchema },
      async (id) => {
        read.push(id);
        return fetchBlockTree(notion.client, id);
      },
    );

    expect(prepared.errors).toEqual([]);
    expect(read).toEqual([]);
    expect(prepared.writes.map((w) => w.resume)).toEqual([undefined]);
  });
});

// The sync's own preflight: two live pages under one slug stop the whole run.
// An archived page is not a live one, so it cannot be the second claimant that
// takes the blog off its next deploy.
describe("the sync's slug preflight", () => {
  it("does not see an archived page as a second claimant of a live slug", async () => {
    const client = clientReturning([
      apiPage("one"),
      { ...apiPage("one"), id: "page-one-old", is_archived: true },
    ]);

    const pages = await queryPublishedPages(client, "ds-1", isPublished);

    expect(
      validateSourceSlugs(
        pages.map((page) => ({ pageId: page.id, slug: pageSlug(page) })),
      ),
    ).toEqual([]);
    expect(pages.map((page) => page.id)).toEqual(["page-one"]);
  });
});
