import { describe, it, expect } from "vitest";
import {
  planMigration,
  migrationRequests,
  runMigration,
  type LocalPost,
  type MigrationWrite,
} from "@/lib/notion/migrate";
import { createMigrationExecutor } from "@/lib/notion/migrate-executor";
import { FakeNotion } from "./fixtures/fake-notion";
import {
  MAX_CHILDREN_PER_REQUEST,
  MAX_RICH_TEXT_ITEMS,
  MAX_TEXT_CONTENT,
  MAX_URL_LENGTH,
} from "@/lib/notion/limits";
import type { DataSourceSchema } from "@/lib/notion/properties";

// Notion's API has hard limits, and the migration walked straight through all
// of them: a create-page request takes at most 100 children, a rich-text array
// at most 100 elements, and one text run at most 2000 characters. A long post
// was rejected whole, and a run that had already created a page before hitting
// the limit left it behind — half a post under a slug the next run would then
// duplicate.
//
// Every post is now measured before the first request goes out. What fits is
// sent; what cannot be split is refused with the file named, so nothing at all
// is created for content Notion could not store. And a page is created as a
// draft and promoted to Published only once all of its blocks have landed, so
// a page whose remaining blocks never arrive is left as a draft the site never
// shows and the next run finishes — see migration-resume.test.ts.

const schema = (properties: Record<string, string>): DataSourceSchema =>
  Object.fromEntries(
    Object.entries(properties).map(([name, type]) => [name, { type }]),
  );

const statusSchema = schema({
  Name: "title",
  Slug: "rich_text",
  Excerpt: "rich_text",
  Tags: "multi_select",
  Status: "status",
  Published: "date",
});

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

const writesFor = (content: string, slug = "one"): MigrationWrite[] =>
  migrationRequests(planMigration([local(slug, content)], []), options);

const paragraphs = (count: number) =>
  Array.from({ length: count }, (_, index) => `Line ${index + 1}.`).join("\n\n");

// A Notion that records every write it accepts and can be told to refuse one of
// them. The double is the real one (see fixtures/fake-notion.ts) driven through
// the real executor, so what these tests measure is the batching the script
// actually performs — reads, checks and all. A refused write is not recorded,
// because it did not land.
function recorder(
  fail: { on?: "create" | "append" | "publish"; at?: number } = {},
) {
  const notion = new FakeNotion();
  let appends = 0;

  notion.beforeWrite = (kind) => {
    if (kind === "create" && fail.on === "create") {
      throw new Error("notion said no");
    }
    if (kind === "append") {
      appends += 1;
      if (fail.on === "append" && appends === (fail.at ?? 1)) {
        throw new Error("notion said no");
      }
    }
    if (kind === "update" && fail.on === "publish") {
      throw new Error("notion said no");
    }
  };

  return {
    notion,
    executor: createMigrationExecutor(notion.client, resumableSchema),
    calls: notion.mutations,
  };
}

// The same schema, with the two status options the executor checks for before
// it makes a single request.
const resumableSchema: DataSourceSchema = {
  ...statusSchema,
  Status: {
    type: "status",
    status: { options: [{ name: "Draft" }, { name: "Published" }] },
  },
};

describe("the limits every request is measured against", () => {
  it("names the ones Notion actually enforces", () => {
    expect(MAX_CHILDREN_PER_REQUEST).toBe(100);
    expect(MAX_RICH_TEXT_ITEMS).toBe(100);
    expect(MAX_TEXT_CONTENT).toBe(2000);
    expect(MAX_URL_LENGTH).toBe(2000);
  });
});

describe("a post with more blocks than one request can carry", () => {
  it("sends exactly one request's worth and nothing more", () => {
    const [write] = writesFor(paragraphs(MAX_CHILDREN_PER_REQUEST));

    expect(write.page.children).toHaveLength(MAX_CHILDREN_PER_REQUEST);
    expect(write.appends).toEqual([]);
  });

  it("appends the one block past the boundary", () => {
    const [write] = writesFor(paragraphs(MAX_CHILDREN_PER_REQUEST + 1));

    expect(write.page.children).toHaveLength(MAX_CHILDREN_PER_REQUEST);
    expect(write.appends).toHaveLength(1);
    expect(write.appends[0]).toHaveLength(1);
  });

  it("splits a long post into whole batches, in order", () => {
    const [write] = writesFor(paragraphs(250));

    expect(write.page.children).toHaveLength(100);
    expect(write.appends.map((batch) => batch.length)).toEqual([100, 50]);

    const sent = [...write.page.children, ...write.appends.flat()];
    expect(sent).toHaveLength(250);
    expect(text(sent[0])).toBe("Line 1.");
    expect(text(sent[100])).toBe("Line 101.");
    expect(text(sent[249])).toBe("Line 250.");
  });
});

describe("a run of text longer than one rich-text element", () => {
  it("leaves a run right on the boundary alone", () => {
    const [write] = writesFor("a".repeat(MAX_TEXT_CONTENT));

    expect(runsOf(write).map((run) => run.text.content.length)).toEqual([
      MAX_TEXT_CONTENT,
    ]);
  });

  it("splits the one character past it into a second run", () => {
    const [write] = writesFor("a".repeat(MAX_TEXT_CONTENT + 1));
    const runs = runsOf(write);

    expect(runs.map((run) => run.text.content.length)).toEqual([
      MAX_TEXT_CONTENT,
      1,
    ]);
    expect(runs.map((run) => run.text.content).join("")).toBe(
      "a".repeat(MAX_TEXT_CONTENT + 1),
    );
  });

  it("carries the annotations and the link onto every chunk", () => {
    const long = "b".repeat(MAX_TEXT_CONTENT + 10);
    const [write] = writesFor(`[**${long}**](https://example.com/x)`);
    const runs = runsOf(write);

    expect(runs).toHaveLength(2);
    for (const run of runs) {
      expect(run.annotations).toEqual({ bold: true });
      expect(run.text.link).toEqual({ url: "https://example.com/x" });
    }
    expect(runs.map((run) => run.text.content).join("")).toBe(long);
  });

  it("never splits a surrogate pair down the middle", () => {
    const [write] = writesFor(
      `${"a".repeat(MAX_TEXT_CONTENT - 1)}\u{1F600}tail`,
    );
    const runs = runsOf(write);

    expect(runs.map((run) => run.text.content).join("")).toBe(
      `${"a".repeat(MAX_TEXT_CONTENT - 1)}\u{1F600}tail`,
    );
    for (const run of runs) {
      expect(run.text.content.length).toBeLessThanOrEqual(MAX_TEXT_CONTENT);
      expect(/[\uD800-\uDBFF]$/.test(run.text.content)).toBe(false);
      expect(/^[\uDC00-\uDFFF]/.test(run.text.content)).toBe(false);
    }
  });

  it("merges runs that render identically before counting them", () => {
    // Two ways of writing one bold word, back to back: Notion stores them as
    // one run, and counting them as two would refuse a paragraph that fits.
    const [write] = writesFor("<strong>a</strong>**b**");

    expect(runsOf(write)).toEqual([
      { type: "text", text: { content: "ab" }, annotations: { bold: true } },
    ]);
  });
});

describe("content Notion has no way to store", () => {
  const refuses = (content: string, matcher: RegExp) =>
    expect(() => writesFor(content)).toThrow(matcher);

  it("refuses a paragraph with more runs than one array can hold", () => {
    const content = Array.from(
      { length: MAX_RICH_TEXT_ITEMS + 1 },
      (_, index) => `\`c${index}\``,
    ).join(" x ");

    refuses(content, /rich text|runs/i);
  });

  it("accepts a paragraph right on the run limit", () => {
    const content = Array.from(
      { length: Math.floor(MAX_RICH_TEXT_ITEMS / 2) },
      (_, index) => `\`c${index}\``,
    ).join(" x ");

    expect(runsOf(writesFor(content)[0]).length).toBeLessThanOrEqual(
      MAX_RICH_TEXT_ITEMS,
    );
  });

  it("refuses a link Notion would reject for its length", () => {
    const url = `https://example.com/${"a".repeat(MAX_URL_LENGTH)}`;

    refuses(`[label](${url})`, /url/i);
  });

  it("refuses more nested blocks than one parent can take", () => {
    const nested = Array.from({ length: 101 }, (_, i) => `  - n${i}`).join("\n");

    refuses(`- outer\n${nested}\n`, /nested|children/i);
  });

  it("names the file, so the run says which post to fix", () => {
    expect(() =>
      migrationRequests(
        planMigration(
          [
            local("fine", "Body.\n"),
            local("broken", `[a](https://x/${"y".repeat(MAX_URL_LENGTH)})`),
          ],
          [],
        ),
        options,
      ),
    ).toThrow(/broken\.mdx/);
  });

  it("checks every post before it builds any of them", async () => {
    const plan = planMigration(
      [
        local("fine", "Body.\n"),
        local("broken", `[a](https://x/${"y".repeat(MAX_URL_LENGTH)})`),
      ],
      [],
    );
    const { executor, calls } = recorder();

    expect(() => migrationRequests(plan, options)).toThrow();
    // Nothing was built, so nothing can be sent: the executor is never reached.
    await expect(runMigration([], executor)).resolves.toEqual([]);
    expect(calls).toEqual([]);
  });
});

describe("sending a run", () => {
  it("creates each page and appends the rest of its blocks in order", async () => {
    const writes = writesFor(paragraphs(250));
    const { executor, calls } = recorder();

    const done = await runMigration(writes, executor);

    expect(calls).toEqual([
      "create:page-1:100",
      "append:page-1:100",
      "append:page-1:50",
      "publish:page-1",
    ]);
    expect(done).toEqual([
      { slug: "one", pageId: "page-1", batches: 2, resumed: false },
    ]);
  });

  it("makes no append call at all for a post that fits in one request", async () => {
    const { executor, calls } = recorder();

    await runMigration(writesFor("Body.\n"), executor);

    expect(calls).toEqual(["create:page-1:1", "publish:page-1"]);
  });

  // The page is not trashed. Trashing it would throw away the blocks that did
  // land — the ones the next run resumes from — and it could never run at all
  // for the failure this design exists for, a process that is killed outright.
  it("leaves a page whose blocks did not all land as an unpublished draft", async () => {
    const writes = writesFor(paragraphs(250));
    const { executor, calls } = recorder({ on: "append", at: 2 });

    await expect(runMigration(writes, executor)).rejects.toThrow(
      /draft|re-?run|again/i,
    );
    expect(calls).toEqual(["create:page-1:100", "append:page-1:100"]);
    expect(calls).not.toContain("publish:page-1");
  });

  it("names the page and says a re-run finishes it", async () => {
    const writes = writesFor(paragraphs(250));
    const { executor } = recorder({ on: "append", at: 1 });

    await expect(runMigration(writes, executor)).rejects.toThrow(/page-1/);
  });

  // The promotion is the only write that makes a post visible, so a failure
  // there leaves a complete page nobody can see — and one the next run
  // promotes, having found every block already in place.
  it("leaves a page whose promotion failed as a draft", async () => {
    const { executor, calls } = recorder({ on: "publish" });

    await expect(runMigration(writesFor("Body.\n"), executor)).rejects.toThrow(
      /again/i,
    );
    expect(calls).toEqual(["create:page-1:1"]);
  });

  it("appends into a page a previous run left, rather than creating another", async () => {
    const [write] = writesFor(paragraphs(250));
    const { notion, executor, calls } = recorder();
    // The draft a killed run left: this post's metadata, and the 200 blocks it
    // managed to write.
    const pageId = notion.seed({
      slug: "one",
      title: "Title one",
      status: "Draft",
      blocks: write.blocks.slice(0, 200),
    });

    const done = await runMigration(
      [{ ...write, appends: [write.blocks.slice(200)], resume: { pageId } }],
      executor,
    );

    expect(calls).toEqual([`append:${pageId}:50`, `publish:${pageId}`]);
    expect(done).toEqual([
      { slug: "one", pageId, batches: 1, resumed: true },
    ]);
  });

  it("stops at the first post that fails rather than carrying on", async () => {
    const plan = planMigration(
      [local("one", paragraphs(150)), local("two", "Body.\n")],
      [],
    );
    const writes = migrationRequests(plan, options);
    const { executor, calls } = recorder({ on: "append", at: 1 });

    await expect(runMigration(writes, executor)).rejects.toThrow();
    expect(calls).not.toContain("create:page-2:1");
  });
});

type TextRun = {
  type: "text";
  text: { content: string; link?: { url: string } };
  annotations?: Record<string, boolean>;
};

// The runs of a write's first block, whatever kind of block it is.
function runsOf(write: MigrationWrite): TextRun[] {
  const [first] = write.page.children;
  const payload = (first as unknown as Record<string, Record<string, unknown>>)[
    (first as { type: string }).type
  ];
  return payload.rich_text as TextRun[];
}

function text(block: unknown): string {
  const typed = block as { type: string } & Record<string, { rich_text: TextRun[] }>;
  return typed[typed.type].rich_text.map((run) => run.text.content).join("");
}
