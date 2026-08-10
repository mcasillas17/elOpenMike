import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { queryPages, fetchBlockTree } from "@/lib/notion/client";
import { pageSlug, pageStatus, pageTitle } from "@/lib/notion/fetch-post";
import {
  prepareMigration,
  planMigration,
  migrationRequests,
  planResumes,
  runMigration,
  toLocalPost,
  type LocalPost,
  type RemotePage,
} from "@/lib/notion/migrate";
import { createMigrationExecutor } from "@/lib/notion/migrate-executor";
import type { DataSourceSchema } from "@/lib/notion/properties";
import { MAX_CHILDREN_PER_REQUEST } from "@/lib/notion/limits";
import { MAX_CONCURRENT_REQUESTS } from "@/lib/notion/pool";
import { FakeNotion, livePages } from "./fixtures/fake-notion";

// A migration that creates a page and then appends the rest of its blocks has a
// window it cannot close with a try/catch: the process can be killed — SIGKILL,
// a dropped VPN, a laptop lid — after the page exists and before the post is
// whole. Nothing runs at that point. No rollback, no message, no trash call.
//
// So the recovery cannot live in a catch block. A page is created as a Draft,
// which the sync never publishes, and is promoted to Published in one request
// only once every block has landed. Published therefore means finished, and a
// re-run resumes the Draft it finds: it reads the blocks already on the page,
// proves they are an exact prefix of the post, appends the rest and promotes.
//
// Every test below kills the run mid-flight, throws the run away, and starts a
// completely fresh one against the same database.

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

// One whole run of the migration script, from reading the database to the last
// write. Every test builds a fresh one — nothing carries over but Notion.
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
    createMigrationExecutor(notion.client, "ds-1", statusSchema),
  );
  return { ...prepared, written };
}

const expected = (count: number) =>
  Array.from({ length: count }, (_, index) => `Line ${index + 1}.`);

describe("a migration killed partway through", () => {
  // 250 blocks is one create and two appends, then the promotion: four writes,
  // and a process can die after any of them.
  const post = local("one", paragraphs(250));

  for (const kill of [1, 2, 3, 4]) {
    it(`resumes to one complete published page when the process dies after write ${kill}`, async () => {
      const notion = new FakeNotion();
      notion.killAfter(kill);

      await expect(migrate(notion, [post])).rejects.toThrow(/killed/);

      // Nothing half-written is ever visible as published.
      const midway = livePages(notion);
      expect(midway).toHaveLength(1);
      if (kill < 4) expect(midway[0].status).toBe("Draft");

      notion.restart();
      const second = await migrate(notion, [post]);
      expect(second.errors).toEqual([]);

      const after = livePages(notion);
      expect(after).toHaveLength(1);
      expect(after[0].status).toBe("Published");
      expect(after[0].texts).toEqual(expected(250));
    });
  }

  it("promotes a page only once every one of its blocks has landed", async () => {
    const notion = new FakeNotion();
    await migrate(notion, [post]);

    expect(notion.published).toEqual([{ pageId: "page-1", blocks: 250 }]);
  });

  it("does nothing at all on a third run", async () => {
    const notion = new FakeNotion();
    notion.killAfter(2);
    await expect(migrate(notion, [post])).rejects.toThrow(/killed/);

    notion.restart();
    await migrate(notion, [post]);
    const settled = notion.mutations.length;

    const third = await migrate(notion, [post]);
    expect(notion.mutations).toHaveLength(settled);
    expect(third.writes).toEqual([]);
    expect(third.skip.map((entry) => entry.slug)).toEqual(["one"]);
  });

  it("appends only the blocks that are missing", async () => {
    const notion = new FakeNotion();
    notion.killAfter(2);
    await expect(migrate(notion, [post])).rejects.toThrow(/killed/);
    notion.restart();

    const before = notion.mutations.length;
    await migrate(notion, [post]);

    // 100 in the create, 100 in the first append: only the last 50 are left.
    expect(notion.mutations.slice(before)).toEqual([
      "append:page-1:50",
      "publish:page-1",
    ]);
  });

  it("reads a long page's blocks a hundred at a time", async () => {
    const notion = new FakeNotion();
    notion.killAfter(3);
    await expect(migrate(notion, [post])).rejects.toThrow(/killed/);

    notion.restart();
    notion.childPageReads = 0;
    await migrate(notion, [post]);

    // 200 blocks are on the page: one read cannot see them all.
    expect(notion.childPageReads).toBeGreaterThan(1);
    expect(livePages(notion)[0].texts).toEqual(expected(250));
  });
});

describe("posts of every length", () => {
  const cases: Array<[string, number]> = [
    ["a post that fits in one request", 1],
    ["a post filling one request exactly", MAX_CHILDREN_PER_REQUEST],
    ["a post one block past the boundary", MAX_CHILDREN_PER_REQUEST + 1],
    ["a post spanning three requests", 250],
  ];

  for (const [name, count] of cases) {
    it(`migrates ${name} as a draft that is promoted once`, async () => {
      const notion = new FakeNotion();
      const post = local("one", paragraphs(count));

      await migrate(notion, [post]);

      const [page] = livePages(notion);
      expect(page.status).toBe("Published");
      expect(page.texts).toEqual(expected(count));
      expect(notion.mutations.filter((m) => m.startsWith("create"))).toHaveLength(
        1,
      );
      expect(notion.mutations.at(-1)).toBe(`publish:${page.id}`);
    });

    it(`resumes ${name} after the process dies right after the page is created`, async () => {
      const notion = new FakeNotion();
      const post = local("one", paragraphs(count));
      notion.killAfter(1);
      await expect(migrate(notion, [post])).rejects.toThrow(/killed/);
      expect(livePages(notion)[0].status).toBe("Draft");

      notion.restart();
      await migrate(notion, [post]);

      expect(livePages(notion)).toHaveLength(1);
      expect(livePages(notion)[0].status).toBe("Published");
      expect(livePages(notion)[0].texts).toEqual(expected(count));
    });
  }

  // Not a length any more: a page with nothing in it is a page the sync would
  // refuse to publish, and one published post it refuses stops the whole blog
  // from syncing. So it is caught while it is still a file. The create-with-no-
  // children path is still exercised below, where the plan is built by hand.
  it("refuses a post with nothing in it, before a page exists", async () => {
    const notion = new FakeNotion();

    const prepared = await migrate(notion, [local("one", "")]);

    expect(prepared.errors.join("\n")).toMatch(/one\.mdx/);
    expect(prepared.errors.join("\n")).toMatch(/body/i);
    expect(notion.mutations).toEqual([]);
    expect(notion.pages.size).toBe(0);
  });

  // The write protocol for a page whose blocks all fit in the create request
  // and leave nothing to append: one create, no appends, one promotion.
  it("creates and promotes a page with no children in two requests", async () => {
    const notion = new FakeNotion();
    const plan = planMigration([local("one", "")], []);
    const writes = migrationRequests(plan, options);

    expect(writes[0].page.children).toEqual([]);
    expect(writes[0].appends).toEqual([]);

    await runMigration(
      writes,
      createMigrationExecutor(notion.client, "ds-1", statusSchema),
    );

    expect(notion.mutations).toEqual(["create:page-1:0", "publish:page-1"]);
    expect(livePages(notion)[0].status).toBe("Published");
  });

  it("creates the page as a Draft, never as Published", async () => {
    const notion = new FakeNotion();
    notion.killAfter(1);
    await expect(migrate(notion, [local("one", paragraphs(3))])).rejects.toThrow();

    const created = [...notion.pages.values()][0];
    expect(created.properties.Status).toEqual({
      type: "status",
      status: { name: "Draft" },
    });
  });

  it("writes Draft in the shape a Select database uses", async () => {
    const selectSchema: DataSourceSchema = {
      ...statusSchema,
      Status: {
        type: "select",
        select: { options: [{ name: "Draft" }, { name: "Published" }] },
      },
    };

    const prepared = await prepareMigration(
      [local("one", "Body.\n")],
      [],
      { dataSourceId: "ds-1", schema: selectSchema },
      async () => [],
    );

    expect(prepared.errors).toEqual([]);
    expect(prepared.writes[0].page.properties.Status).toEqual({
      select: { name: "Draft" },
    });
  });

  // Reported rather than thrown, alongside anything else wrong with the run:
  // a migration that has to be fixed one message at a time is one nobody
  // finishes. Nothing is written either way.
  it("refuses a database whose Status has no Draft option to migrate into", async () => {
    const prepared = await prepareMigration(
      [local("one", "Body.\n")],
      [],
      {
        dataSourceId: "ds-1",
        schema: {
          ...statusSchema,
          Status: { type: "status", status: { options: [{ name: "Published" }] } },
        },
      },
      async () => [],
    );

    expect(prepared.errors.join("\n")).toMatch(/Draft/);
    expect(prepared.writes).toEqual([]);
  });
});

describe("a database a re-run has to read before it writes", () => {
  const post = local("one", paragraphs(3));

  it("skips a page that is already published", async () => {
    const notion = new FakeNotion();
    await migrate(notion, [post]);
    const settled = [...notion.mutations];

    const again = await migrate(notion, [post]);

    expect(notion.mutations).toEqual(settled);
    expect(again.skip.map((entry) => entry.slug)).toEqual(["one"]);
  });

  it("promotes a draft that already holds the whole post", async () => {
    const notion = new FakeNotion();
    notion.killAfter(1);
    await expect(migrate(notion, [post])).rejects.toThrow(/killed/);
    notion.restart();

    const before = notion.mutations.length;
    await migrate(notion, [post]);

    expect(notion.mutations.slice(before)).toEqual(["publish:page-1"]);
  });

  it("refuses a draft holding something the post does not say", async () => {
    const notion = new FakeNotion();
    notion.seed({
      slug: "one",
      title: "Title one",
      status: "Draft",
      blocks: [
        {
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [{ type: "text", text: { content: "Mine, not yours." } }],
          },
        },
      ],
    });

    const result = await migrate(notion, [post]);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/one/);
    expect(result.errors[0]).toMatch(/draft/i);
    expect(notion.mutations).toEqual([]);
  });

  it("refuses a draft that runs past the end of the post", async () => {
    const notion = new FakeNotion();
    notion.killAfter(1);
    await expect(migrate(notion, [local("one", paragraphs(3))])).rejects.toThrow();
    notion.restart();

    // The post lost a paragraph after the run died, so the draft now holds
    // more than the file does.
    const result = await migrate(notion, [local("one", paragraphs(2))]);

    expect(result.errors).toHaveLength(1);
    expect(notion.mutations.filter((m) => !m.startsWith("create"))).toEqual([]);
  });

  it("refuses a draft whose nested children were changed", async () => {
    const notion = new FakeNotion();
    notion.seed({
      slug: "one",
      title: "Title one",
      status: "Draft",
      blocks: [
        {
          object: "block",
          type: "bulleted_list_item",
          bulleted_list_item: {
            rich_text: [{ type: "text", text: { content: "outer" } }],
            children: [
              {
                object: "block",
                type: "bulleted_list_item",
                bulleted_list_item: {
                  rich_text: [{ type: "text", text: { content: "not inner" } }],
                },
              },
            ],
          },
        },
      ],
    });

    const result = await migrate(notion, [
      local("one", "- outer\n  - inner\n\nAfter.\n"),
    ]);

    expect(result.errors).toHaveLength(1);
    expect(notion.mutations).toEqual([]);
  });

  it("resumes a draft whose nested children match the post exactly", async () => {
    const notion = new FakeNotion();
    const post = local("one", "- outer\n  - inner\n\nAfter.\n");
    notion.killAfter(1);
    await expect(migrate(notion, [post])).rejects.toThrow(/killed/);
    notion.restart();

    const result = await migrate(notion, [post]);

    expect(result.errors).toEqual([]);
    expect(livePages(notion)).toHaveLength(1);
    expect(livePages(notion)[0].status).toBe("Published");
  });

  it("refuses a draft claiming the slug under another title", async () => {
    const notion = new FakeNotion();
    notion.seed({ slug: "one", title: "Something else", status: "Draft" });

    const result = await migrate(notion, [post]);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/title/i);
    expect(notion.mutations).toEqual([]);
  });

  it("refuses a page claiming the slug in neither Draft nor Published", async () => {
    const notion = new FakeNotion();
    notion.seed({ slug: "one", title: "Title one", status: "In progress" });

    const result = await migrate(notion, [post]);

    expect(result.errors).toHaveLength(1);
    expect(notion.mutations).toEqual([]);
  });

  it("refuses a slug claimed by both a draft and a published page", async () => {
    const notion = new FakeNotion();
    notion.seed({ slug: "one", title: "Title one", status: "Published" });
    notion.seed({ slug: "one", title: "Title one", status: "Draft" });

    const result = await migrate(notion, [post]);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/one/);
    expect(notion.mutations).toEqual([]);
  });

  it("recreates a post whose only page is in the Notion trash", async () => {
    const notion = new FakeNotion();
    notion.seed({
      slug: "one",
      title: "Title one",
      status: "Draft",
      in_trash: true,
    });

    await migrate(notion, [post]);

    expect(livePages(notion)).toHaveLength(1);
    expect(livePages(notion)[0].status).toBe("Published");
  });

  // The whole run is planned against the database before the first write, so a
  // single unresolvable page stops every post rather than half of them.
  it("writes nothing at all when one post of several diverges", async () => {
    const notion = new FakeNotion();
    notion.seed({
      slug: "two",
      title: "Title two",
      status: "Draft",
      blocks: [
        {
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [{ type: "text", text: { content: "Mine." } }],
          },
        },
      ],
    });

    const result = await migrate(notion, [
      local("one", paragraphs(2)),
      local("two", paragraphs(2)),
      local("three", paragraphs(2)),
    ]);

    expect(result.errors).toHaveLength(1);
    expect(notion.mutations).toEqual([]);
    expect(livePages(notion)).toHaveLength(1);
  });

  it("skips what it finished and resumes what it did not, in one run", async () => {
    const posts = [local("one", paragraphs(120)), local("two", paragraphs(3))];
    const notion = new FakeNotion();

    // One create, one append and the promotion for the first post, then the
    // second post's create: the process dies with one page done and one begun.
    notion.killAfter(4);
    await expect(migrate(notion, posts)).rejects.toThrow(/killed/);
    expect(livePages(notion).map((page) => page.status)).toEqual([
      "Published",
      "Draft",
    ]);

    notion.restart();
    const second = await migrate(notion, posts);

    expect(second.skip.map((entry) => entry.slug)).toEqual(["one"]);
    expect(livePages(notion)).toHaveLength(2);
    expect(livePages(notion).map((page) => page.status)).toEqual([
      "Published",
      "Published",
    ]);
    expect(livePages(notion)[0].texts).toEqual(expected(120));
    expect(livePages(notion)[1].texts).toEqual(expected(3));
  });
});

// Everything above builds its posts out of numbered paragraphs. These are the
// real files, with the headings, fences, lists, tables and inline annotations
// they actually carry — the shapes the comparison has to recognize coming back
// out of Notion, or a killed run could never be resumed.
describe("the posts on disk", () => {  const dir = path.join(process.cwd(), "content", "blog");
  const posts = readdirSync(dir)
    .filter((name) => name.endsWith(".mdx"))
    .sort()
    .map((name) => toLocalPost(name, readFileSync(path.join(dir, name), "utf8")));

  it("finds posts to migrate", () => {
    expect(posts.length).toBeGreaterThan(0);
  });

  it("resumes them to one published page each after the process is killed", async () => {
    const notion = new FakeNotion();
    notion.killAfter(1);
    await expect(migrate(notion, posts)).rejects.toThrow(/killed/);

    notion.restart();
    const second = await migrate(notion, posts);

    expect(second.errors).toEqual([]);
    expect(livePages(notion).map((page) => page.slug).sort()).toEqual(
      posts.map((post) => post.slug).sort(),
    );
    for (const page of livePages(notion)) expect(page.status).toBe("Published");
  });

  it("does nothing on a re-run once they are all published", async () => {
    const notion = new FakeNotion();
    await migrate(notion, posts);
    const settled = [...notion.mutations];

    await migrate(notion, posts);

    expect(notion.mutations).toEqual(settled);
  });
});

// Reading the drafts is the one part of the run that is not a chain: the pages
// are independent, so they go through the same bounded pool the sync uses
// rather than one at a time or all at once — Notion gives an integration about
// three requests a second.
describe("the reads a re-run makes before it writes", () => {
  it("keeps no more of them in flight than the sync does", async () => {
    const posts = Array.from({ length: 12 }, (_, index) =>
      local(`post-${index}`, paragraphs(2)),
    );
    const drafts: RemotePage[] = posts.map((post) => ({
      pageId: `page-${post.slug}`,
      slug: post.slug,
      title: post.title,
      status: "Draft",
    }));

    const writes = migrationRequests(planMigration(posts, drafts), options);
    let inFlight = 0;
    let peak = 0;

    const resumed = await planResumes(writes, async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return [];
    });

    expect(resumed.errors).toEqual([]);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(MAX_CONCURRENT_REQUESTS);
  });

  // An empty draft is a prefix of every post, so the whole post is appended —
  // in whole requests, because Notion takes a hundred children at a time.
  it("appends what is missing in requests Notion will accept", async () => {
    const post = local("one", paragraphs(250));
    const writes = migrationRequests(
      planMigration(
        [post],
        [{ pageId: "page-x", slug: "one", title: post.title, status: "Draft" }],
      ),
      options,
    );

    const resumed = await planResumes(writes, async () => []);

    expect(resumed.writes[0].appends.map((batch) => batch.length)).toEqual([
      100, 100, 50,
    ]);
  });
});

// The one way this recovery can still be lost: the content sync removes the
// .mdx of any post Notion has not published, so a draft a killed run left
// behind can outlive its own source file — and a migration with nothing to read
// has nothing to finish. It cannot be prevented from here (unpublishing a post
// is how the author removes it), so the run names the file to restore instead.
describe("a draft whose source file the sync has since removed", () => {
  it("names it, rather than leaving a page nobody can account for", async () => {
    const posts = [local("one", paragraphs(120)), local("two", paragraphs(3))];
    const notion = new FakeNotion();

    notion.killAfter(4);
    await expect(migrate(notion, posts)).rejects.toThrow(/killed/);
    notion.restart();

    // The sync ran in between and deleted content/blog/two.mdx, because no
    // published Notion page claimed it.
    const result = await migrate(notion, [posts[0]]);

    expect(result.errors).toEqual([]);
    expect(result.orphanDrafts).toEqual([{ slug: "two", pageId: "page-2" }]);
    // The draft is reported, never touched.
    expect(livePages(notion)[1].status).toBe("Draft");
    expect(notion.mutations.filter((m) => m.includes("page-2"))).toEqual([
      "create:page-2:3",
    ]);
  });

  it("finishes it once the file is restored", async () => {
    const posts = [local("one", paragraphs(120)), local("two", paragraphs(3))];
    const notion = new FakeNotion();

    notion.killAfter(4);
    await expect(migrate(notion, posts)).rejects.toThrow(/killed/);
    notion.restart();
    await migrate(notion, [posts[0]]);

    const restored = await migrate(notion, posts);

    expect(restored.orphanDrafts).toEqual([]);
    expect(livePages(notion).map((page) => page.status)).toEqual([
      "Published",
      "Published",
    ]);
    expect(livePages(notion)[1].texts).toEqual(expected(3));
  });
});
