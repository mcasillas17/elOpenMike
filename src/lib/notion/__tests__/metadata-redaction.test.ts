import { describe, it, expect } from "vitest";
import { queryPages, fetchBlockTree } from "@/lib/notion/client";
import { pageSlug, pageStatus, pageTitle } from "@/lib/notion/fetch-post";
import {
  checkDraftState,
  checkPublishedState,
  compareMetadata,
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
import type { DataSourceSchema } from "@/lib/notion/properties";
import {
  validateLocalPosts,
  validatePosts,
  validateSourceSlugs,
  tagSlugCollisions,
  type ValidatablePost,
} from "@/lib/notion/validate";
import { FakeNotion } from "./fixtures/fake-notion";

// Every one of these messages is printed into a public GitHub Actions log — the
// sync's validation errors on every run, the migration's on every attempt — and
// every value they used to quote came out of a Notion page or a frontmatter
// block that anyone with edit access can write.
//
// A post's metadata is not safe to repeat. A slug is a url someone pasted
// before it was tidied, a title is whatever was typed into the page, an excerpt
// is a paste out of a document, and a tag is a word from a picker anybody can
// add to. The ones that reach a *refusal* are by definition the odd ones: the
// date that will not parse because it still has a query string on it, the tag
// with a comma in it because it was pasted out of a config file, the title of
// the draft that is not this post. Quoting them published them.
//
// So a message says the field, the file or the page it is on, an index, a
// length or a category — everything needed to go and look — and nothing of what
// the value actually is.

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

const leaky = {
  title: "Draft: ghp_examplePersonalAccessToken",
  slug: "sk-live-000000",
  excerpt: "pasted from https://internal.corp.example/d?sessionid=abcdef",
  date: "2026-13-45T00:00:00+xoxb-slack-token",
  tag: "AKIAEXAMPLEKEY,notion-svc-acct",
  password: "notion-svc-acct:S3cretP4ss@internal.corp.example",
};

function expectNoSecrets(messages: readonly string[]): void {
  const said = messages.join("\n");
  for (const secret of SECRETS) expect(said).not.toContain(secret);
  // Nor the values themselves, whole or in part.
  for (const value of Object.values(leaky)) {
    for (const word of value.split(/[\s,:@]+/).filter((w) => w.length > 5)) {
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

// ---------------------------------------------------------------------------
// The sync's direction: a Notion page on its way to disk.
// ---------------------------------------------------------------------------

const published = (over: Partial<ValidatablePost> = {}): ValidatablePost => ({
  pageId: "page-abc123",
  slug: "a-good-post",
  frontmatter: {
    title: "A good post",
    date: "2026-05-20",
    excerpt: "A short summary.",
    tags: ["AI"],
    updated: "2026-05-20",
  },
  body: "Real content.\n",
  ...over,
});

const withFm = (over: Record<string, unknown>): ValidatablePost =>
  published({
    frontmatter: {
      ...published().frontmatter,
      ...over,
    } as ValidatablePost["frontmatter"],
  });

describe("what the sync says about a page it refuses", () => {
  const cases: Array<[string, ValidatablePost, RegExp]> = [
    ["a date it cannot read", withFm({ date: leaky.date }), /date/],
    ["a title that is not text", withFm({ title: [leaky.title] }), /title/],
    ["an excerpt over the cap", withFm({ excerpt: leaky.excerpt.repeat(9) }), /excerpt/],
    ["a tag with a comma in it", withFm({ tags: [leaky.tag] }), /tag/],
    ["a tag that is not text", withFm({ tags: [{ name: leaky.tag }] }), /tag/],
    [
      "a tag with nothing url-safe in it",
      withFm({ tags: ["…", leaky.password] }),
      /tag/,
    ],
    [
      "a slug the site cannot serve",
      published({ slug: `${leaky.slug}_UNSAFE` }),
      /slug/,
    ],
    ["an empty body", published({ body: "  " }), /body/],
  ];

  it.each(cases)("keeps %s out of the log", (_name, post) => {
    const errors = validatePosts([post]);

    expect(errors.length).toBeGreaterThan(0);
    expectNoSecrets(errors);
  });

  it.each(cases)("still says which field and which page for %s", (_name, post, field) => {
    for (const error of validatePosts([post])) {
      expect(error).toMatch(field);
      expect(error).toContain("page-abc123");
    }
  });

  it("says how long an over-long excerpt is without saying what it says", () => {
    const excerpt = leaky.excerpt.repeat(9);
    const [message] = validatePosts([withFm({ excerpt })]);

    expect(message).toContain(String(excerpt.length));
    expect(message).toContain("200");
    expectNoSecrets([message]);
  });

  it("counts a duplicate tag by its position, not by its name", () => {
    const errors = validatePosts([withFm({ tags: ["AI", "AI"] })]);

    expect(errors[0]).toMatch(/tag #2/);
    expect(errors[0]).not.toContain("AI");
  });

  it("names the pages two slugs collide on, not the slug", () => {
    const errors = validatePosts([
      published({ pageId: "page-one", slug: leaky.slug }),
      published({ pageId: "page-two", slug: leaky.slug }),
    ]);

    expectNoSecrets(errors);
    const collision = errors.find((error) => /2 posts/.test(error)) ?? "";
    expect(collision).toContain("page-one");
    expect(collision).toContain("page-two");
  });

  it("names the pages whose tags collapse onto one url", () => {
    const errors = tagSlugCollisions([
      { id: "page-one", tags: ["C++"] },
      { id: "page-two", tags: ["C#"] },
    ]);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("page-one");
    expect(errors[0]).toContain("page-two");
    expect(errors[0]).not.toContain("C++");
    expect(errors[0]).not.toContain("C#");
  });

  it("names the pages claiming one slug, not the slug", () => {
    const errors = validateSourceSlugs([
      { pageId: "page-one", slug: leaky.slug },
      { pageId: "page-two", slug: leaky.slug },
    ]);

    expect(errors).toHaveLength(1);
    expectNoSecrets(errors);
    expect(errors[0]).toContain("page-one");
    expect(errors[0]).toContain("page-two");
  });
});

// ---------------------------------------------------------------------------
// The migration's direction: a file on its way into Notion.
// ---------------------------------------------------------------------------

const local = (over: Partial<LocalPost> = {}): LocalPost => ({
  file: "a-good-post.mdx",
  slug: "a-good-post",
  title: "A good post",
  date: "2026-05-20",
  excerpt: "A short summary.",
  tags: ["AI"],
  content: "Body.\n",
  ...over,
});

describe("what the migration says about a file it refuses", () => {
  const cases: Array<[string, LocalPost, RegExp]> = [
    ["a date it cannot read", local({ date: leaky.date }), /date/],
    ["an excerpt over the cap", local({ excerpt: leaky.excerpt.repeat(9) }), /excerpt/],
    ["a tag with a comma in it", local({ tags: [leaky.tag] }), /tag/],
    ["a blank title", local({ title: "   " }), /title/],
  ];

  it.each(cases)("keeps %s out of the log", (_name, post) => {
    const errors = validateLocalPosts([post]);

    expect(errors.length).toBeGreaterThan(0);
    expectNoSecrets(errors);
  });

  it.each(cases)("still names the file and the field for %s", (_name, post, field) => {
    for (const error of validateLocalPosts([post])) {
      expect(error).toContain("a-good-post.mdx");
      expect(error).toMatch(field);
    }
  });
});

describe("what the plan says about the database it read", () => {
  const remote = (over: Partial<RemotePage>): RemotePage => ({
    pageId: "page-1",
    slug: leaky.slug,
    title: leaky.title,
    status: "Draft",
    ...over,
  });

  it("says two pages claim one slug without saying which slug", () => {
    const { errors } = planMigration(
      [local({ slug: leaky.slug })],
      [remote({ pageId: "page-1" }), remote({ pageId: "page-2" })],
    );

    expect(errors).toHaveLength(1);
    expectNoSecrets(errors);
    expect(errors[0]).toContain("page-1");
    expect(errors[0]).toContain("page-2");
  });

  it("says two files map to one slug by naming the files", () => {
    const { errors } = planMigration(
      [
        local({ file: "one.mdx", slug: leaky.slug }),
        local({ file: "two.mdx", slug: leaky.slug }),
      ],
      [],
    );

    expectNoSecrets(errors);
    expect(errors[0]).toContain("one.mdx");
    expect(errors[0]).toContain("two.mdx");
  });

  it("says a page is in the wrong status without quoting its slug", () => {
    const { errors } = planMigration(
      [local({ slug: leaky.slug })],
      [remote({ status: "In review" })],
    );

    expect(errors).toHaveLength(1);
    expectNoSecrets(errors);
    expect(errors[0]).toContain("a-good-post.mdx");
    expect(errors[0]).toContain("page-1");
    // A status option is a word somebody typed into a picker, so the message
    // says the category rather than the name. See workspace-name-redaction.
    expect(errors[0]).not.toContain("In review");
    expect(errors[0]).toMatch(/status/i);
  });

  // The title mismatch: the one message that used to print two titles, one of
  // which belongs to a page this run has decided is somebody else's.
  it("says a draft is under another title without printing either title", () => {
    const { errors } = planMigration(
      [local({ slug: leaky.slug, title: `Mine ${leaky.password}` })],
      [remote({ title: leaky.title })],
    );

    expect(errors).toHaveLength(1);
    expectNoSecrets(errors);
    expect(errors[0]).toContain("a-good-post.mdx");
    expect(errors[0]).toContain("page-1");
    expect(errors[0]).toMatch(/title/i);
  });
});

describe("what a live page's divergence says", () => {
  const desired: PageMetadata = {
    title: "A good post",
    slug: "a-good-post",
    date: "2026-05-20",
    excerpt: "A short summary.",
    tags: ["AI"],
    statusType: "status",
  };

  const actual: PageMetadata = {
    title: leaky.title,
    slug: leaky.slug,
    date: leaky.date,
    excerpt: leaky.excerpt,
    tags: [leaky.tag],
    statusType: "status",
  };

  it("names the fields that disagree and nothing they hold", () => {
    const { identity, repairable } = compareMetadata(desired, actual);

    expectNoSecrets(identity);
    expect(identity.join(" ")).toMatch(/title/);
    expect(identity.join(" ")).toMatch(/slug/);
    expect(repairable.sort()).toEqual(["date", "excerpt", "tags"]);
  });

  const write = {
    slug: "a-good-post",
    file: "a-good-post.mdx",
    title: "A good post",
    blocks: [],
    metadata: desired,
    page: { parent: { type: "data_source_id", data_source_id: "ds-1" }, properties: {}, children: [] },
    appends: [],
  } as unknown as MigrationWrite;

  const state = (over: Partial<PageState> = {}): PageState => ({
    metadata: actual,
    status: "Draft",
    offSite: undefined,
    versionBefore: "2026-05-20T00:00:00.000Z",
    version: "2026-05-20T00:00:00.000Z",
    blocks: [],
    ...over,
  });

  it("says nothing of the page's own metadata before an append", () => {
    const verdict = checkDraftState(write, state(), 0);

    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expectNoSecrets([verdict.reason]);
  });

  it("says nothing of it after the promotion either", () => {
    const verdict = checkPublishedState(write, state({ status: "Published" }));

    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expectNoSecrets([verdict.reason]);
  });
});

describe("what a whole run prints when a page turns out to be somebody else's", () => {
  it("names the file and the page and no metadata at all", async () => {
    const notion = new FakeNotion();
    notion.seed({
      slug: "a-good-post",
      title: leaky.title,
      status: "Draft",
      excerpt: leaky.excerpt,
      tags: [leaky.tag],
    });

    const pages: RemotePage[] = (await queryPages(notion.client, "ds-1")).map(
      (page) => ({
        pageId: page.id,
        slug: pageSlug(page),
        title: pageTitle(page),
        status: pageStatus(page),
      }),
    );

    const prepared = await prepareMigration(
      [local()],
      pages,
      { dataSourceId: "ds-1", schema: statusSchema },
      (pageId) => fetchBlockTree(notion.client, pageId),
    );

    expect(prepared.errors.length).toBeGreaterThan(0);
    expectNoSecrets(prepared.errors);
    expect(prepared.errors.join("\n")).toContain("a-good-post.mdx");
    expect(prepared.errors.join("\n")).toContain("seeded-1");
  });

  it("keeps a page's metadata out of the demotion message", async () => {
    const notion = new FakeNotion();

    const pages: RemotePage[] = [];
    const prepared = await prepareMigration(
      [local()],
      pages,
      { dataSourceId: "ds-1", schema: statusSchema },
      (pageId) => fetchBlockTree(notion.client, pageId),
    );
    expect(prepared.errors).toEqual([]);

    // Somebody retitles the page in the window the promotion opened.
    notion.beforeWrite = (kind, pageId) => {
      if (kind !== "update") return;
      notion.beforeWrite = undefined;
      notion.setProperty(pageId, "Name", {
        type: "title",
        title: [{ plain_text: leaky.title }],
      });
    };

    const error = await runMigration(
      prepared.writes,
      createMigrationExecutor(notion.client, "ds-1", statusSchema),
    ).then(
      () => undefined,
      (thrown: unknown) => thrown as Error,
    );

    expect(error).toBeDefined();
    expectNoSecrets([error?.message ?? ""]);
    expect(error?.message).toContain("a-good-post.mdx");
    expect(error?.message).toMatch(/title/i);
  });
});
