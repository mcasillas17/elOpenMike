import { describe, it, expect } from "vitest";
import { queryPages, fetchBlockTree } from "@/lib/notion/client";
import { pageSlug, pageStatus, pageTitle } from "@/lib/notion/fetch-post";
import {
  prepareMigration,
  runMigration,
  type LocalPost,
  type MigrationExecutor,
  type RemotePage,
} from "@/lib/notion/migrate";
import { createMigrationExecutor } from "@/lib/notion/migrate-executor";
import type { DataSourceSchema } from "@/lib/notion/properties";
import { FakeNotion, livePages } from "./fixtures/fake-notion";

// Two live Notion pages claiming one slug is the state the sync refuses to
// publish from at all: validateSourceSlugs stops the whole run, so one
// duplicate takes the entire blog off its next deploy. Nothing in Notion
// prevents it — there is no unique index on a property — so the migration is
// what has to.
//
// It used to ask once, before the page was created (or, for a resumed draft,
// before the first append), and then trust that answer all the way to the
// promotion. Everything between those two moments is a window: the author
// duplicating a page on their phone, a second copy of this script started by
// hand, an automation writing a row. A page that appeared in it was published
// straight into a collision, and the run reported success.
//
// So the question is asked again on both edges of the write that matters:
//
//   * immediately before the promotion, when the page is still a Draft the site
//     cannot see, and another claimant means nothing is published at all;
//   * immediately after it, when the page is live — and a claimant that
//     appeared inside the promotion's own window takes this page straight back
//     off the site, because the run's page is the one it is entitled to demote.
//
// The database cannot be asked at all is a third answer, and it is not a
// licence to write: an unanswered query proves nothing, so the run says what it
// could not establish rather than demoting a page it has just proved is this
// post.

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

const local = (slug: string, content: string): LocalPost => ({
  file: `${slug}.mdx`,
  slug,
  title: `Title ${slug}`,
  date: "2026-05-20",
  excerpt: `Excerpt ${slug}`,
  tags: ["AI"],
  content,
});

const post = local("one", "Body one.\n\nBody two.\n");

type Wrap = (executor: MigrationExecutor) => MigrationExecutor;

async function migrate(notion: FakeNotion, wrap: Wrap = (e) => e) {
  const pages: RemotePage[] = (await queryPages(notion.client, "ds-1")).map(
    (page) => ({
      pageId: page.id,
      slug: pageSlug(page),
      title: pageTitle(page),
      status: pageStatus(page),
      archived: page.archived,
      in_trash: page.in_trash,
    }),
  );

  const prepared = await prepareMigration(
    [post],
    pages,
    { dataSourceId: "ds-1", schema: statusSchema },
    (pageId) => fetchBlockTree(notion.client, pageId),
  );
  expect(prepared.errors).toEqual([]);

  const executor = createMigrationExecutor(notion.client, "ds-1", statusSchema);
  return runMigration(prepared.writes, wrap(executor), undefined, {
    sleep: async () => {},
  });
}

const failure = (run: Promise<unknown>): Promise<Error> =>
  run.then(
    () => {
      throw new Error("expected the migration to fail");
    },
    (error: unknown) => error as Error,
  );

// The one invariant every case here shares: however the run ended, no slug is
// left with two live pages published under it.
function expectNoDuplicatePublished(notion: FakeNotion): void {
  const published = livePages(notion).filter(
    (page) => page.status === "Published",
  );
  const slugs = published.map((page) => page.slug);
  expect(new Set(slugs).size).toBe(slugs.length);
}

// Somebody else's page under this post's slug, created while the run is looking
// somewhere else.
const duplicate = (notion: FakeNotion, status: string) => () => {
  notion.seed({ slug: "one", title: "Somebody else's post", status });
};

// The claimant query, refused. `at` is which call fails: the first is the one
// before the create, the second the one before the promotion, the third the one
// after it.
const refuseClaimants =
  (at: number): Wrap =>
  (executor) => {
    let asked = 0;
    return {
      ...executor,
      async claimants(slug) {
        asked += 1;
        if (asked === at) throw new Error("connection reset");
        return executor.claimants(slug);
      },
    };
  };

describe("a second page claiming the slug before the promotion", () => {
  for (const status of ["Draft", "Published"]) {
    it(`stops the run when a ${status} page appears after the precheck`, async () => {
      const notion = new FakeNotion();
      // The precheck has already answered by the time the create goes out.
      notion.beforeWrite = (kind) => {
        if (kind !== "create") return;
        notion.beforeWrite = undefined;
        duplicate(notion, status)();
      };

      const error = await failure(migrate(notion));

      expect(error.message).toMatch(/one\.mdx/);
      expect(error.message).toMatch(/page-2/);
      expect(error.message).toMatch(/seeded-1/);
      expect(error.message).toMatch(/slug/);
      // Nothing was published, so nothing has to be taken off the site.
      expect(notion.published).toEqual([]);
      expect(
        notion.mutations.filter((m) => !m.startsWith("create")),
      ).toEqual([]);
      expect(
        livePages(notion).find((page) => page.id === "page-2")?.status,
      ).toBe("Draft");
      expectNoDuplicatePublished(notion);
    });
  }

  it("leaves a resumed draft unpublished too", async () => {
    const notion = new FakeNotion();
    const draft = notion.seed({ slug: "one", title: "Title one", status: "Draft" });
    notion.beforeWrite = (kind) => {
      if (kind !== "append") return;
      notion.beforeWrite = undefined;
      duplicate(notion, "Draft")();
    };

    const error = await failure(migrate(notion));

    expect(error.message).toMatch(/one\.mdx/);
    expect(error.message).toMatch(/slug/);
    expect(notion.published).toEqual([]);
    expect(
      livePages(notion).find((page) => page.id === draft)?.status,
    ).toBe("Draft");
    expectNoDuplicatePublished(notion);
  });

  it("says nothing about the duplicate but where to find it", async () => {
    const notion = new FakeNotion();
    notion.beforeWrite = (kind) => {
      if (kind !== "create") return;
      notion.beforeWrite = undefined;
      notion.seed({
        slug: "one",
        title: "Somebody else's post",
        status: "Draft",
        excerpt: "pasted from https://internal.corp.example/d?sessionid=abcdef",
      });
    };

    const error = await failure(migrate(notion));

    expect(error.message).not.toContain("Somebody else's post");
    expect(error.message).not.toContain("internal.corp.example");
    expect(error.message).toContain("seeded-1");
  });
});

describe("a second page that appears inside the promotion's own window", () => {
  it("takes this run's page straight back off the site", async () => {
    const notion = new FakeNotion();
    notion.beforeWrite = (kind) => {
      if (kind !== "update") return;
      notion.beforeWrite = undefined;
      duplicate(notion, "Draft")();
    };

    const error = await failure(migrate(notion));

    expect(error.message).toMatch(/one\.mdx/);
    expect(error.message).toMatch(/slug/);
    expect(error.message).toMatch(/demoted back to "Draft"/);
    expect(
      livePages(notion).find((page) => page.id === "page-1")?.status,
    ).toBe("Draft");
    expect(notion.mutations).toEqual([
      "create:page-1:2",
      "publish:page-1",
      "status:page-1:Draft",
    ]);
    expectNoDuplicatePublished(notion);
  });

  it("takes it off even when the other page is the published one", async () => {
    const notion = new FakeNotion();
    notion.beforeWrite = (kind) => {
      if (kind !== "update") return;
      notion.beforeWrite = undefined;
      duplicate(notion, "Published")();
    };

    const error = await failure(migrate(notion));

    // The duplicate is named by its page id, which is where it can be opened.
    expect(error.message).toMatch(/seeded-\d/);
    expect(
      livePages(notion).find((page) => page.id === "page-1")?.status,
    ).toBe("Draft");
    expectNoDuplicatePublished(notion);
  });

  it("takes it off when the duplicate lands after the promotion answered", async () => {
    const notion = new FakeNotion();

    const error = await failure(
      migrate(notion, (executor) => ({
        ...executor,
        async publishPage(pageId) {
          await executor.publishPage(pageId);
          duplicate(notion, "Draft")();
        },
      })),
    );

    expect(error.message).toMatch(/slug/);
    expect(
      livePages(notion).find((page) => page.id === "page-1")?.status,
    ).toBe("Draft");
    expectNoDuplicatePublished(notion);
  });

  it("checks for one after a promotion whose answer was lost too", async () => {
    const notion = new FakeNotion();

    const error = await failure(
      migrate(notion, (executor) => ({
        ...executor,
        async publishPage(pageId) {
          await executor.publishPage(pageId);
          duplicate(notion, "Draft")();
          throw Object.assign(new Error("Notion returned 502"), { status: 502 });
        },
      })),
    );

    expect(error.message).toMatch(/slug/);
    expect(
      livePages(notion).find((page) => page.id === "page-1")?.status,
    ).toBe("Draft");
    expectNoDuplicatePublished(notion);
  });
});

describe("a database that cannot be asked who claims the slug", () => {
  it("publishes nothing when the question fails before the promotion", async () => {
    const notion = new FakeNotion();

    const error = await failure(migrate(notion, refuseClaimants(2)));

    expect(error.message).toMatch(/one\.mdx/);
    expect(error.message).toMatch(/connection reset/);
    expect(notion.published).toEqual([]);
    expect(
      livePages(notion).find((page) => page.id === "page-1")?.status,
    ).toBe("Draft");
  });

  it("leaves a proved page published and says what it could not check", async () => {
    const notion = new FakeNotion();

    const error = await failure(migrate(notion, refuseClaimants(3)));

    expect(error.message).toMatch(/one\.mdx/);
    expect(error.message).toMatch(/page-1/);
    expect(error.message).toMatch(/connection reset/);
    expect(error.message).toMatch(/slug/);
    // A query that never answered is not evidence of a duplicate, and demoting
    // a page proved to be this post on the strength of one would take a good
    // post off the site.
    expect(
      livePages(notion).find((page) => page.id === "page-1")?.status,
    ).toBe("Published");
    expect(notion.mutations.filter((m) => m.startsWith("status"))).toEqual([]);
  });
});

describe("a run nobody interfered with", () => {
  it("still publishes, with no demotion and no extra writes", async () => {
    const notion = new FakeNotion();

    const written = await migrate(notion);

    expect(written).toHaveLength(1);
    expect(livePages(notion)[0].status).toBe("Published");
    expect(notion.mutations).toEqual(["create:page-1:2", "publish:page-1"]);
    expectNoDuplicatePublished(notion);
  });

  it("is not fooled by its own page answering the question", async () => {
    const notion = new FakeNotion();
    // A page under a different slug is not a claimant, however published.
    notion.seed({ slug: "two", title: "Title two", status: "Published" });

    const written = await migrate(notion);

    expect(written).toHaveLength(1);
    expectNoDuplicatePublished(notion);
  });
});
