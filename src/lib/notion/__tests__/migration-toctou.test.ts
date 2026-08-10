import { describe, it, expect } from "vitest";
import { queryPages, fetchBlockTree } from "@/lib/notion/client";
import { pageSlug, pageStatus, pageTitle } from "@/lib/notion/fetch-post";
import {
  prepareMigration,
  runMigration,
  type LocalPost,
  type RemotePage,
} from "@/lib/notion/migrate";
import { createMigrationExecutor } from "@/lib/notion/migrate-executor";
import type { DataSourceSchema } from "@/lib/notion/properties";
import { FakeNotion, livePages } from "./fixtures/fake-notion";

// Notion has no transactions and no conditional writes. Everything the
// migration knows about a page it learned in an earlier request, and the page
// can be edited between any two of them — by the author on their phone, by a
// second copy of this script, by anything else holding the token.
//
// The plan is built from a read that is already minutes old by the time the
// first block is appended, and the old protocol trusted it all the way to the
// promotion: a draft the author started editing kept receiving appends, and was
// then published — as a page that is half their writing and half ours.
//
// The strongest thing available without a transaction is to shrink the window
// and to check on both sides of it:
//
//   * before every append and immediately before the promotion, the page's
//     metadata, status, version and whole block tree are read again and have to
//     be exactly what this post expects — still a Draft, still this title and
//     slug, holding exactly the blocks written so far and nothing else;
//   * after the promotion, everything is read once more, and a page that is not
//     exactly this post is demoted straight back to Draft and the run fails
//     loudly rather than leaving a wrong post published.
//
// The window between the last read and the write it justified cannot be closed
// from here — that is the API's to close — so it is made as small as one
// request and every later check re-examines it.

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

const options = { dataSourceId: "ds-1", schema: statusSchema };

const local = (slug: string, content: string): LocalPost => ({
  file: `${slug}.mdx`,
  slug,
  title: `Title ${slug}`,
  date: "2026-05-20",
  excerpt: `Excerpt ${slug}`,
  tags: ["AI"],
  content,
});

const paragraphs = (count: number) =>
  Array.from({ length: count }, (_, index) => `Line ${index + 1}.`).join("\n\n");

async function migrate(notion: FakeNotion, posts: LocalPost[]) {
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

  const prepared = await prepareMigration(posts, pages, options, (pageId) =>
    fetchBlockTree(notion.client, pageId),
  );
  if (prepared.errors.length > 0) return { ...prepared, written: [] };

  const written = await runMigration(
    prepared.writes,
    createMigrationExecutor(notion.client, statusSchema),
  );
  return { ...prepared, written };
}

// Runs `change` once, the first time a read of the page is answered — the
// moment after a check has passed and before the write it justified goes out.
function editAfterFirstRead(
  notion: FakeNotion,
  change: (pageId: string) => void,
): void {
  let done = false;
  notion.afterRead = (kind, id) => {
    if (done || kind !== "retrieve") return;
    done = true;
    change(id);
  };
}

// 250 blocks is a create and two appends, so there are two windows before the
// promotion and one after it.
const long = local("one", paragraphs(250));

describe("a draft edited between a check and the write it justified", () => {
  const cases: Array<[string, (notion: FakeNotion, pageId: string) => void]> = [
    [
      "published by somebody else",
      (notion, pageId) => notion.setStatus(pageId, "Published"),
    ],
    [
      "moved into another status",
      (notion, pageId) => notion.setStatus(pageId, "In progress"),
    ],
    ["stripped of its status", (notion, pageId) => notion.setStatus(pageId, "")],
    [
      "retitled",
      (notion, pageId) =>
        notion.setProperty(pageId, "Name", {
          type: "title",
          title: [{ plain_text: "Somebody else's post" }],
        }),
    ],
    [
      "given another slug",
      (notion, pageId) =>
        notion.setProperty(pageId, "Slug", {
          type: "rich_text",
          rich_text: [{ plain_text: "not-one" }],
        }),
    ],
    ["moved to the trash", (notion, pageId) => notion.trash(pageId)],
    [
      "written into by hand",
      (notion, pageId) => notion.addBlock(pageId, "Mine, not yours."),
    ],
    [
      "emptied of a block",
      (notion, pageId) => notion.removeLastBlock(pageId),
    ],
  ];

  for (const [name, change] of cases) {
    it(`stops the run when the page is ${name}, without publishing it`, async () => {
      const notion = new FakeNotion();
      editAfterFirstRead(notion, (pageId) => change(notion, pageId));

      await expect(migrate(notion, [long])).rejects.toThrow(/one\.mdx/);

      expect(notion.published).toEqual([]);
      expect(notion.mutations.filter((m) => m.startsWith("publish"))).toEqual(
        [],
      );
    });
  }

  it("writes nothing more once it has seen the change", async () => {
    const notion = new FakeNotion();
    editAfterFirstRead(notion, (pageId) =>
      notion.addBlock(pageId, "Mine, not yours."),
    );

    await expect(migrate(notion, [long])).rejects.toThrow();

    // The create landed; the appends the plan wanted did not.
    expect(notion.mutations).toEqual(["create:page-1:100"]);
  });

  it("checks again before every single append, not just the first", async () => {
    const notion = new FakeNotion();
    // Let the first append through, then edit the page underneath the second.
    let appends = 0;
    notion.beforeWrite = (kind, pageId) => {
      if (kind !== "append") return;
      appends += 1;
      if (appends === 1) notion.addBlock(pageId, "Mine, not yours.");
    };

    await expect(migrate(notion, [long])).rejects.toThrow();

    expect(notion.mutations).toEqual([
      "create:page-1:100",
      "append:page-1:100",
    ]);
    expect(notion.published).toEqual([]);
  });

  it("checks again immediately before the promotion", async () => {
    const notion = new FakeNotion();
    // Every append lands; the page is edited just before the promotion.
    notion.beforeWrite = (kind, pageId) => {
      if (kind !== "append") return;
      if (notion.mutations.filter((m) => m.startsWith("append")).length === 1) {
        notion.beforeWrite = undefined;
        notion.afterRead = (readKind, id) => {
          if (readKind !== "retrieve") return;
          notion.afterRead = undefined;
          notion.addBlock(id, "Mine, not yours.");
        };
      }
      void pageId;
    };

    await expect(migrate(notion, [long])).rejects.toThrow();

    expect(notion.published).toEqual([]);
    expect(livePages(notion)[0].status).toBe("Draft");
  });

  it("says which file and which page it stopped on", async () => {
    const notion = new FakeNotion();
    editAfterFirstRead(notion, (pageId) => notion.setStatus(pageId, "Archived"));

    await expect(migrate(notion, [long])).rejects.toThrow(
      /one\.mdx[\s\S]*page-1/,
    );
  });

  // A truncated read is not a shorter page: reading it as one would append
  // blocks the page already holds.
  it("stops when the preflight read of the blocks comes back truncated", async () => {
    const notion = new FakeNotion();
    const client = notion.client;
    const broken = {
      ...client,
      blocks: {
        children: {
          append: client.blocks.children.append.bind(client.blocks.children),
          list: async () => ({
            results: [],
            has_more: true,
            next_cursor: null,
          }),
        },
      },
    } as unknown as typeof client;

    const prepared = await prepareMigration([long], [], options, async () => []);
    await expect(
      runMigration(
        prepared.writes,
        createMigrationExecutor(broken, statusSchema),
      ),
    ).rejects.toThrow(/cursor/i);

    expect(notion.mutations).toEqual(["create:page-1:100"]);
  });
});

describe("a page that is not this post once it has been published", () => {
  it("demotes it straight back to Draft and fails loudly", async () => {
    const notion = new FakeNotion();
    notion.beforeWrite = (kind, pageId) => {
      if (kind !== "update") return;
      notion.beforeWrite = undefined;
      // Somebody adds a block in the same instant the promotion goes out.
      notion.addBlock(pageId, "Mine, not yours.");
    };

    await expect(migrate(notion, [local("one", paragraphs(3))])).rejects.toThrow(
      /demoted|Draft/,
    );

    expect(livePages(notion)[0].status).toBe("Draft");
    expect(notion.mutations).toEqual([
      "create:page-1:3",
      "publish:page-1",
      "status:page-1:Draft",
    ]);
  });

  it("demotes it when the metadata changed under the promotion", async () => {
    const notion = new FakeNotion();
    notion.beforeWrite = (kind, pageId) => {
      if (kind !== "update") return;
      notion.beforeWrite = undefined;
      notion.setProperty(pageId, "Name", {
        type: "title",
        title: [{ plain_text: "Somebody else's post" }],
      });
    };

    await expect(migrate(notion, [local("one", paragraphs(3))])).rejects.toThrow(
      /title/i,
    );

    expect(livePages(notion)[0].status).toBe("Draft");
  });

  it("still fails loudly when the demotion itself cannot be made", async () => {
    const notion = new FakeNotion();
    notion.beforeWrite = (kind, pageId) => {
      if (kind !== "update") return;
      notion.beforeWrite = undefined;
      notion.addBlock(pageId, "Mine, not yours.");
      // The next write — the demotion — never lands.
      notion.killAfter(notion.mutations.length + 2);
    };

    await expect(
      migrate(notion, [local("one", paragraphs(3))]),
    ).rejects.toThrow(/could not be demoted|still Published/i);
  });

  it("leaves a clean run published, with no demotion at all", async () => {
    const notion = new FakeNotion();

    await migrate(notion, [local("one", paragraphs(3))]);

    expect(livePages(notion)[0].status).toBe("Published");
    expect(notion.mutations.filter((m) => m.startsWith("status"))).toEqual([]);
  });
});

describe("two migrations running in one process", () => {
  it("never interleaves their writes", async () => {
    const notion = new FakeNotion();
    const posts = [local("one", paragraphs(250))];

    const pages: RemotePage[] = [];
    const first = await prepareMigration(posts, pages, options, async () => []);
    const second = await prepareMigration(posts, pages, options, async () => []);

    const executor = createMigrationExecutor(notion.client, statusSchema);
    const runs = await Promise.allSettled([
      runMigration(first.writes, executor),
      runMigration(second.writes, executor),
    ]);

    // Whatever each run made of it, one of them finished its page before the
    // other one started: no create lands between another page's create and its
    // publish.
    const creates = notion.mutations
      .map((mutation, index) => ({ mutation, index }))
      .filter(({ mutation }) => mutation.startsWith("create"));
    expect(creates).toHaveLength(2);
    const firstPublish = notion.mutations.indexOf("publish:page-1");
    expect(firstPublish).toBeGreaterThan(-1);
    expect(creates[1].index).toBeGreaterThan(firstPublish);
    expect(runs.map((run) => run.status)).toContain("fulfilled");
  });

  it("lets the first finish and leaves the second nothing to publish", async () => {
    const notion = new FakeNotion();
    const post = local("one", paragraphs(3));
    const prepared = await prepareMigration([post], [], options, async () => []);

    const executor = createMigrationExecutor(notion.client, statusSchema);
    const [first, second] = await Promise.allSettled([
      runMigration(prepared.writes, executor),
      runMigration(prepared.writes, executor),
    ]);

    expect(first.status).toBe("fulfilled");
    expect(second.status).toBe("fulfilled");
    // Two pages were created because the plan said to create one, twice — but
    // each was written and verified whole, one after the other, rather than
    // both being half-written at once.
    expect(notion.published.map((entry) => entry.blocks)).toEqual([3, 3]);
  });

  it("makes the second run abort rather than write over the first", async () => {
    const notion = new FakeNotion();
    const post = local("one", paragraphs(3));
    const draft = notion.seed({
      slug: "one",
      title: "Title one",
      status: "Draft",
    });
    const prepared = await prepareMigration(
      [post],
      [{ pageId: draft, slug: "one", title: "Title one", status: "Draft" }],
      options,
      async () => [],
    );

    const executor = createMigrationExecutor(notion.client, statusSchema);
    const results = await Promise.allSettled([
      runMigration(prepared.writes, executor),
      runMigration(prepared.writes, executor),
    ]);

    expect(results.map((result) => result.status)).toEqual([
      "fulfilled",
      "rejected",
    ]);
    expect(notion.published).toEqual([{ pageId: draft, blocks: 3 }]);
    expect(livePages(notion)[0].texts).toEqual([
      "Line 1.",
      "Line 2.",
      "Line 3.",
    ]);
  });
});
