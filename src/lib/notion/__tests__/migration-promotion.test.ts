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

// The promotion is the one write in the migration whose failure means nothing
// on its own.
//
// `pages.update({ Status: Published })` is what puts a post on the site. When
// it answers 502, or the connection drops before it answers at all, the request
// may well have landed: Notion has no idempotency key and no conditional write,
// so the only thing that can distinguish "it never happened" from "the answer
// got lost" is looking at the page afterwards.
//
// The run used to skip that look. Any throw out of the write phase was reported
// as `the page could not be finished … it is still a "Draft", so nothing on the
// site changed` — a claim about the state of the database made without reading
// it. When the write had in fact landed, that message was simply false: a post
// was live on the blog while the run said nothing was, and the operator was
// told to re-run rather than to go and check.
//
// So a promotion that fails is followed by a read — retried, because the read
// is the whole point and giving up on the first 503 puts the run back where it
// started — and the page decides what the run says:
//
//   * Published: the write landed and only its answer was lost. The page gets
//     exactly the proof a clean promotion gets, and is demoted on any mismatch.
//   * Draft: proved, so the failure can be reported as the plain failure it is.
//   * anything else: reported as what it actually reads.
//   * unreadable: reported as unknown. The page is demoted where that is safe,
//     because a page that may be published without proof must not stay on the
//     site, and the message says which of the two happened.

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

// A 5xx: the one answer that says nothing at all about whether the write landed.
function serverError(status: number): Error {
  return Object.assign(new Error(`Notion returned ${status}`), { status });
}

// Nothing waits in these tests; the recheck's backoff is the run's, not the
// test's.
const nowhere = { sleep: async () => {} };

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
  return runMigration(prepared.writes, wrap(executor), undefined, nowhere);
}

const failure = (run: Promise<unknown>): Promise<Error> =>
  run.then(
    () => {
      throw new Error("expected the migration to fail");
    },
    (error: unknown) => error as Error,
  );

// The write lands and the answer is lost on the way back.
const answerLost = (during?: () => void): Wrap => (executor) => ({
  ...executor,
  async publishPage(pageId) {
    await executor.publishPage(pageId);
    during?.();
    throw serverError(502);
  },
});

// The request never reached Notion at all.
const neverSent: Wrap = (executor) => ({
  ...executor,
  publishPage: async () => {
    throw serverError(503);
  },
});

const statusWrites = (notion: FakeNotion) =>
  notion.mutations.filter((m) => m.startsWith("publish") || m.startsWith("status"));

describe("a promotion whose answer was lost", () => {
  it("reads the page back and finds the write did land", async () => {
    const notion = new FakeNotion();

    const written = await migrate(notion, answerLost());

    expect(written).toHaveLength(1);
    expect(written[0].slug).toBe("one");
    expect(livePages(notion)[0].status).toBe("Published");
    // The page was proved published; it must not be demoted or published twice.
    expect(statusWrites(notion)).toEqual(["publish:page-1"]);
  });

  it("says the answer was lost rather than staying silent about it", async () => {
    const notion = new FakeNotion();

    const [written] = await migrate(notion, answerLost());

    expect(written.recovered).toBe(true);
  });

  it("proves the page it read back is this post, and demotes it if not", async () => {
    const notion = new FakeNotion();

    // Somebody writes into the page in the very window the lost answer opened.
    const error = await failure(
      migrate(
        notion,
        answerLost(() => notion.addBlock("page-1", "Mine, not yours.")),
      ),
    );

    expect(error.message).toMatch(/one\.mdx/);
    expect(error.message).toMatch(/page-1/);
    expect(error.message).toMatch(/holds 3 blocks where the post has 2/);
    expect(error.message).toMatch(/demoted back to "Draft"/);
    expect(livePages(notion)[0].status).toBe("Draft");
    expect(statusWrites(notion)).toEqual(["publish:page-1", "status:page-1:Draft"]);
  });

  it("demotes a page whose metadata moved inside the lost window", async () => {
    const notion = new FakeNotion();

    const error = await failure(
      migrate(
        notion,
        answerLost(() =>
          notion.setProperty("page-1", "Excerpt", {
            type: "rich_text",
            rich_text: [{ plain_text: "Somebody retyped this." }],
          }),
        ),
      ),
    );

    expect(error.message).toMatch(/excerpt/i);
    expect(error.message).not.toContain("Somebody retyped this.");
    expect(livePages(notion)[0].status).toBe("Draft");
  });
});

describe("a promotion that never happened", () => {
  it("proves the page is still a draft before saying so", async () => {
    const notion = new FakeNotion();

    const error = await failure(migrate(notion, neverSent));

    expect(error.message).toMatch(/one\.mdx/);
    expect(error.message).toMatch(/"Draft"/);
    expect(error.message).toMatch(/read back/i);
    expect(livePages(notion)[0].status).toBe("Draft");
    // Nothing was written to the Status property at all.
    expect(statusWrites(notion)).toEqual([]);
  });

  it("reports the status it actually reads when the page has moved", async () => {
    const notion = new FakeNotion();

    const error = await failure(
      migrate(notion, (executor) => ({
        ...executor,
        publishPage: async (pageId) => {
          notion.setStatus(pageId, "In progress");
          throw serverError(500);
        },
      })),
    );

    expect(error.message).toMatch(/In progress/);
    expect(livePages(notion)[0].status).toBe("In progress");
    // Somebody else's deliberate status is not overwritten: nothing this run
    // did is on the site, so there is nothing to take off it.
    expect(statusWrites(notion)).toEqual([]);
  });
});

describe("a promotion whose outcome cannot be read back", () => {
  // Every read after the promotion fails: the outage that swallowed the answer
  // is still going.
  const blind =
    (notion: FakeNotion, during?: () => void): Wrap =>
    (executor) => ({
      ...executor,
      async publishPage(pageId) {
        await executor.publishPage(pageId);
        during?.();
        notion.beforeRead = () => {
          throw new Error("connection reset");
        };
        throw serverError(504);
      },
    });

  it("never claims the page is a draft it could not read", async () => {
    const notion = new FakeNotion();

    const error = await failure(migrate(notion, blind(notion)));

    expect(error.message).toMatch(/could not be read back/i);
    expect(error.message).not.toMatch(/it is still a "Draft"/);
    expect(error.message).toMatch(/one\.mdx/);
  });

  it("takes the page off the site rather than leaving it maybe-published", async () => {
    const notion = new FakeNotion();

    const error = await failure(migrate(notion, blind(notion)));

    expect(error.message).toMatch(/"Draft"/);
    expect(livePages(notion)[0].status).toBe("Draft");
    expect(statusWrites(notion)).toEqual(["publish:page-1", "status:page-1:Draft"]);
  });

  it("says so, loudly, when it cannot take it off either", async () => {
    const notion = new FakeNotion();

    const error = await failure(
      migrate(
        notion,
        blind(notion, () => {
          notion.beforeWrite = () => {
            throw new Error("connection reset");
          };
        }),
      ),
    );

    expect(error.message).toMatch(/by hand/i);
    expect(error.message).toMatch(/may still be published|might still be published/i);
    expect(livePages(notion)[0].status).toBe("Published");
  });

  it("retries the read before giving up on it", async () => {
    const notion = new FakeNotion();
    let refusals = 0;

    const written = await migrate(notion, (executor) => ({
      ...executor,
      async publishPage(pageId) {
        await executor.publishPage(pageId);
        notion.beforeRead = () => {
          refusals += 1;
          notion.beforeRead = undefined;
          throw new Error("connection reset");
        };
        throw serverError(502);
      },
    }));

    expect(refusals).toBe(1);
    expect(written).toHaveLength(1);
    expect(livePages(notion)[0].status).toBe("Published");
  });
});

describe("what a failed promotion never says", () => {
  it("does not claim a draft anywhere it has not read one", async () => {
    for (const wrap of [answerLost(), neverSent]) {
      const notion = new FakeNotion();
      const outcome = await migrate(notion, wrap).then(
        () => undefined,
        (error: unknown) => (error as Error).message,
      );
      if (outcome === undefined) continue;

      const claimsDraft = /still a "Draft"/.test(outcome);
      // Only a page that was actually read back as a Draft may be called one.
      expect(claimsDraft).toBe(livePages(notion)[0].status === "Draft");
    }
  });
});
