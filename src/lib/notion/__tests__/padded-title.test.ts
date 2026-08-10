import { describe, it, expect } from "vitest";
import { queryPages, fetchBlockTree } from "@/lib/notion/client";
import { pageSlug, pageStatus, pageTitle } from "@/lib/notion/fetch-post";
import {
  prepareMigration,
  runMigration,
  toLocalPost,
  type LocalPost,
  type RemotePage,
} from "@/lib/notion/migrate";
import { createMigrationExecutor } from "@/lib/notion/migrate-executor";
import type { DataSourceSchema } from "@/lib/notion/properties";
import { validatePosts, validateLocalPosts } from "@/lib/notion/validate";
import { FakeNotion, livePages } from "./fixtures/fake-notion";

// A title is the one piece of a post's metadata that is also its *identity*: a
// page under another title is not this post, so the migration refuses to write
// to it rather than overwriting what it finds.
//
// Notion trims a title on the way out — every reader of a page property does,
// because a title property holds rich text and its edges are not meaningful —
// so a file whose frontmatter says `title: " Ship it "` is a post whose page
// will always read "Ship it". The migration used to have that both ways: it
// wrote the padded title into Notion, and compared against the trimmed one.
//
// Two things fell out of it. A draft left behind by a killed run could never be
// resumed: the plan compares the page's title with the file's, and the file's
// carried spaces the page could not. And the padding was silently dropped from
// what the site published — the file said one thing, the blog said another, and
// nothing ever reported it.
//
// So there is one contract, and it is checked before anything is written: a
// post's title is exactly what Notion will read back, or the run refuses it and
// writes nothing at all. Nothing is trimmed on anybody's behalf, because a
// title is the author's to write.

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

const local = (over: Partial<LocalPost> = {}): LocalPost => ({
  file: "one.mdx",
  slug: "one",
  title: "Title one",
  date: "2026-05-20",
  excerpt: "Excerpt one",
  tags: ["AI"],
  content: "Body one.\n\nBody two.\n",
  ...over,
});

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

const PADDED = [
  ["a leading space", " Title one"],
  ["a trailing space", "Title one "],
  ["a trailing newline", "Title one\n"],
  ["a tab on both ends", "\tTitle one\t"],
] as const;

describe("a local title with whitespace on its edges", () => {
  for (const [shape, title] of PADDED) {
    it(`is refused before anything is written, for ${shape}`, async () => {
      const notion = new FakeNotion();

      const result = await migrate(notion, [local({ title })]);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.join("\n")).toMatch(/title/i);
      expect(result.errors.join("\n")).toMatch(/space|whitespace/i);
      expect(result.errors.join("\n")).toContain("one.mdx");
      // Nothing was created, so nothing has to be tidied up by hand.
      expect(notion.mutations).toEqual([]);
      expect(livePages(notion)).toEqual([]);
    });
  }

  it("says which file, and not what the title says", async () => {
    const notion = new FakeNotion();

    const result = await migrate(notion, [
      local({ title: " Draft: ghp_examplePersonalAccessToken " }),
    ]);

    expect(result.errors.join("\n")).not.toContain(
      "ghp_examplePersonalAccessToken",
    );
    expect(result.errors.join("\n")).toContain("one.mdx");
  });

  it("is reported from the frontmatter the file actually carries", () => {
    const post = toLocalPost(
      "one.mdx",
      ['---', 'title: " Ship it "', 'date: "2026-05-20"', 'excerpt: "A summary."', 'tags: ["AI"]', '---', '', 'Body.', ''].join("\n"),
    );

    // Nothing is trimmed on the way in: the file says what it says.
    expect(post.title).toBe(" Ship it ");
    expect(validateLocalPosts([post]).join("\n")).toMatch(/title/i);
  });

  it("lets the same post through the moment the padding is gone", async () => {
    const notion = new FakeNotion();

    const result = await migrate(notion, [local({ title: "Title one" })]);

    expect(result.errors).toEqual([]);
    expect(result.written).toHaveLength(1);
    expect(livePages(notion)[0].status).toBe("Published");
  });
});

describe("a draft a killed run left behind", () => {
  // The case the mismatch made unrecoverable: the page reads the title Notion
  // trimmed, the file carries the one it was written with, and the plan can
  // never match them.
  it("is refused for the padding rather than for being somebody else's", async () => {
    const notion = new FakeNotion();
    notion.seed({ slug: "one", title: "Title one", status: "Draft" });

    const result = await migrate(notion, [local({ title: "Title one " })]);

    const said = result.errors.join("\n");
    expect(said).toMatch(/title/i);
    expect(said).toMatch(/space|whitespace/i);
    expect(notion.mutations).toEqual([]);
  });

  it("is finished by the same run once the file is fixed", async () => {
    const notion = new FakeNotion();
    const draft = notion.seed({
      slug: "one",
      title: "Title one",
      status: "Draft",
    });

    const result = await migrate(notion, [local()]);

    expect(result.errors).toEqual([]);
    expect(result.written.map((page) => page.pageId)).toEqual([draft]);
    expect(livePages(notion)[0].status).toBe("Published");
  });
});

describe("what the page is written with", () => {
  it("is exactly what the check compares against", async () => {
    const notion = new FakeNotion();

    await migrate(notion, [local({ title: "Title one" })]);

    const page = notion.pages.get("page-1");
    const runs = (
      page?.properties.Name as { title: { plain_text: string }[] }
    ).title;
    const written = runs.map((run) => run.plain_text).join("");

    // What Notion stores and what a reader gets back are the same string, so a
    // page never disagrees with its own post.
    expect(written).toBe("Title one");
    expect(written.trim()).toBe(written);
  });

  it("repairs a drifted excerpt without ever rewriting the title", async () => {
    const notion = new FakeNotion();
    const draft = notion.seed({
      slug: "one",
      title: "Title one",
      status: "Draft",
      excerpt: "Somebody retyped this.",
    });

    const result = await migrate(notion, [local()]);

    expect(result.errors).toEqual([]);
    const repairs = notion.mutations.filter((m) => m.startsWith("meta:"));
    expect(repairs).toEqual([`meta:${draft}:Excerpt`]);
    expect(livePages(notion)[0].status).toBe("Published");
  });
});

describe("a title read back off a Notion page", () => {
  const post = (title: string) => ({
    pageId: "page-1",
    slug: "a-good-post",
    frontmatter: {
      title,
      date: "2026-05-20",
      excerpt: "A summary.",
      tags: ["AI"],
      updated: "2026-05-20",
    },
    body: "A body.\n",
  });

  it("is refused by the sync too when it carries padding", () => {
    const errors = validatePosts([post(" A good post ")]);

    expect(errors.join("\n")).toMatch(/title/i);
    expect(errors.join("\n")).toMatch(/space|whitespace/i);
    expect(errors.join("\n")).toContain("page-1");
    expect(errors.join("\n")).not.toContain("A good post");
  });

  it("passes when it is what every reader of the page sees", () => {
    expect(validatePosts([post("A good post")])).toEqual([]);
  });
});
