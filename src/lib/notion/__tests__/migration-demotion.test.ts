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

// The demotion is the migration's undo: one write, `Status: Draft`, that takes
// a page back off the site. It is the right write for exactly one situation —
// this run published a page, and the page turns out not to be the post it was
// supposed to publish — and the wrong write for every other, because a Status
// is a property somebody else may have set deliberately since.
//
// It used to be made on a guess. A page that could not be read back after the
// promotion was demoted anyway ("it may be published, so take it off"), and a
// page whose readback said Draft, "In progress" or "in the trash" was demoted
// too, because the only question asked was "is this exactly my post?" — to
// which every one of those answers is "no".
//
// Both are edits nobody asked for. A page somebody demoted while the run was
// promoting it is a page somebody wants as a draft; a page in the trash is not
// on the site at all; and a page nothing here can read is a page nothing here
// knows anything about — writing a Status over it is a guess in a direction
// that cannot be checked.
//
// So the rule is one read: the Status is only written after a read has just
// proved the page is Published and not trashed. Everything else is reported —
// accurately, saying what was read rather than what was assumed — and left
// exactly as it is.

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

const post: LocalPost = {
  file: "one.mdx",
  slug: "one",
  title: "Title one",
  date: "2026-05-20",
  excerpt: "Excerpt one",
  tags: ["AI"],
  content: "Body one.\n\nBody two.\n",
};

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

  return runMigration(
    prepared.writes,
    wrap(createMigrationExecutor(notion.client, "ds-1", statusSchema)),
    undefined,
    { sleep: async () => {} },
  );
}

const failure = (run: Promise<unknown>): Promise<Error> =>
  run.then(
    () => {
      throw new Error("expected the migration to fail");
    },
    (error: unknown) => error as Error,
  );

// Every write this run made to a Status property, in order.
const statusWrites = (notion: FakeNotion) =>
  notion.mutations.filter(
    (mutation) => mutation.startsWith("publish") || mutation.startsWith("status"),
  );

// Somebody moves the page in the instant between the promotion landing and the
// read that proves it.
const movedAfterPromotion =
  (notion: FakeNotion, move: (pageId: string) => void, lost = false): Wrap =>
  (executor) => ({
    ...executor,
    async publishPage(pageId) {
      await executor.publishPage(pageId);
      move(pageId);
      if (lost) throw Object.assign(new Error("Notion returned 502"), { status: 502 });
    },
  });

// The page as the fake database holds it, trash included.
const stored = (notion: FakeNotion, pageId: string) => notion.pages.get(pageId);

describe("a page somebody moved while this run was publishing it", () => {
  it("is left alone when it reads back as a Draft", async () => {
    const notion = new FakeNotion();

    const error = await failure(
      migrate(notion, movedAfterPromotion(notion, (id) => notion.setStatus(id, "Draft"))),
    );

    expect(error.message).toMatch(/one\.mdx/);
    expect(error.message).toMatch(/page-1/);
    expect(error.message).toMatch(/"Draft"/);
    // The promotion, and nothing after it.
    expect(statusWrites(notion)).toEqual(["publish:page-1"]);
    expect(livePages(notion)[0].status).toBe("Draft");
  });

  it("is left alone when somebody has moved it somewhere else entirely", async () => {
    const notion = new FakeNotion();

    const error = await failure(
      migrate(
        notion,
        movedAfterPromotion(notion, (id) => notion.setStatus(id, "In progress")),
      ),
    );

    expect(error.message).toMatch(/one\.mdx/);
    expect(statusWrites(notion)).toEqual(["publish:page-1"]);
    expect(livePages(notion)[0].status).toBe("In progress");
  });

  it("is left alone when it has no status at all any more", async () => {
    const notion = new FakeNotion();

    const error = await failure(
      migrate(notion, movedAfterPromotion(notion, (id) => notion.setStatus(id, ""))),
    );

    expect(error.message).toMatch(/one\.mdx/);
    expect(statusWrites(notion)).toEqual(["publish:page-1"]);
    expect(livePages(notion)[0].status).toBe("");
  });

  it("is left in the trash rather than written to", async () => {
    const notion = new FakeNotion();

    const error = await failure(
      migrate(notion, movedAfterPromotion(notion, (id) => notion.trash(id))),
    );

    expect(error.message).toMatch(/one\.mdx/);
    expect(error.message).toMatch(/trash/i);
    expect(statusWrites(notion)).toEqual(["publish:page-1"]);
    expect(stored(notion, "page-1")?.in_trash).toBe(true);
    expect(livePages(notion)).toEqual([]);
  });

  it("is left alone after a lost promotion answer too", async () => {
    const notion = new FakeNotion();

    const error = await failure(
      migrate(
        notion,
        movedAfterPromotion(notion, (id) => notion.trash(id), true),
      ),
    );

    expect(error.message).toMatch(/one\.mdx/);
    expect(error.message).toMatch(/trash/i);
    expect(statusWrites(notion)).toEqual(["publish:page-1"]);
    expect(stored(notion, "page-1")?.in_trash).toBe(true);
  });
});

describe("a page this run cannot read after publishing it", () => {
  const blind =
    (notion: FakeNotion, lost: boolean): Wrap =>
    (executor) => ({
      ...executor,
      async publishPage(pageId) {
        await executor.publishPage(pageId);
        notion.beforeRead = () => {
          throw new Error("connection reset");
        };
        if (lost) throw Object.assign(new Error("Notion returned 504"), { status: 504 });
      },
    });

  it("never writes a Status it cannot justify", async () => {
    const notion = new FakeNotion();

    const error = await failure(migrate(notion, blind(notion, false)));

    expect(error.message).toMatch(/one\.mdx/);
    expect(error.message).toMatch(/page-1/);
    expect(error.message).toMatch(/could not .*be read/i);
    expect(statusWrites(notion)).toEqual(["publish:page-1"]);
    expect(livePages(notion)[0].status).toBe("Published");
  });

  it("never writes one after a lost promotion answer either", async () => {
    const notion = new FakeNotion();

    const error = await failure(migrate(notion, blind(notion, true)));

    expect(error.message).toMatch(/could not .*be read/i);
    expect(error.message).toMatch(/unknown/i);
    // It says which of the two it is stuck between rather than picking one.
    expect(error.message).not.toMatch(/it is still a "Draft"/);
    expect(statusWrites(notion)).toEqual(["publish:page-1"]);
    expect(livePages(notion)[0].status).toBe("Published");
  });

  it("says what to go and look at", async () => {
    const notion = new FakeNotion();

    const error = await failure(migrate(notion, blind(notion, true)));

    expect(error.message).toMatch(/by hand/i);
    expect(error.message).toMatch(/page-1/);
  });
});

describe("a page that is published, whole, and somebody else's", () => {
  // The one situation the demotion is for: read back, proved Published, and
  // proved not to be this post.
  it("is demoted, because the read justified the write", async () => {
    const notion = new FakeNotion();

    const error = await failure(
      migrate(
        notion,
        movedAfterPromotion(notion, (id) => notion.addBlock(id, "Mine, not yours.")),
      ),
    );

    expect(error.message).toMatch(/demoted back to "Draft"/);
    expect(statusWrites(notion)).toEqual(["publish:page-1", "status:page-1:Draft"]);
    expect(livePages(notion)[0].status).toBe("Draft");
  });

  it("is reported loudly when the demotion itself fails", async () => {
    const notion = new FakeNotion();

    const error = await failure(
      migrate(notion, (executor) => ({
        ...executor,
        async publishPage(pageId) {
          await executor.publishPage(pageId);
          notion.addBlock(pageId, "Mine, not yours.");
        },
        demoteToDraft: async () => {
          throw new Error("connection reset");
        },
      })),
    );

    expect(error.message).toMatch(/still Published/i);
    expect(error.message).toMatch(/by hand/i);
    expect(livePages(notion)[0].status).toBe("Published");
  });
});

describe("a clean run", () => {
  it("writes the promotion and nothing else", async () => {
    const notion = new FakeNotion();

    const written = await migrate(notion);

    expect(written).toHaveLength(1);
    expect(statusWrites(notion)).toEqual(["publish:page-1"]);
    expect(livePages(notion)[0].status).toBe("Published");
  });
});
