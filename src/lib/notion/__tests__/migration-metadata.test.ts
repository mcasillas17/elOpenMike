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

// A page carries more than its blocks. Its date, excerpt and tags are the
// post's frontmatter, and its title and slug are what say which post it is.
//
// A resumed draft has been sitting in the database since the run that made it,
// which may have been days ago: somebody can have retyped its excerpt, moved
// its date, added a tag. The migration only ever looked at the blocks, so it
// appended the missing ones and published a page whose frontmatter was nobody's
// — not the file's, and not the version the author last saw either.
//
// So the properties are compared as carefully as the blocks, and the two kinds
// of difference are treated differently:
//
//   * title and slug are identity. A page under another one is not this post,
//     and overwriting them is how one post's page becomes another's, so the run
//     refuses rather than writes;
//   * date, excerpt and tags are the migration's to write. They are put back
//     while the page is still a Draft — invisible to the site — and the whole
//     page is then read again before the promotion goes out.
//
// The Status property's own shape is checked with them: a database can track
// publication with a Status property or with a Select, and writing the value
// into the other one is refused by Notion.

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

const selectSchema: DataSourceSchema = {
  ...statusSchema,
  Status: {
    type: "select",
    select: { options: [{ name: "Draft" }, { name: "Published" }] },
  },
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

const paragraphs = (count: number) =>
  Array.from({ length: count }, (_, index) => `Line ${index + 1}.`).join("\n\n");

async function migrate(
  notion: FakeNotion,
  posts: LocalPost[],
  schema: DataSourceSchema = statusSchema,
) {
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
    posts,
    pages,
    { dataSourceId: "ds-1", schema },
    (pageId) => fetchBlockTree(notion.client, pageId),
  );
  if (prepared.errors.length > 0) return { ...prepared, written: [] };

  const written = await runMigration(
    prepared.writes,
    createMigrationExecutor(notion.client, schema),
  );
  return { ...prepared, written };
}

// A draft a killed run left behind: this post's properties, and the first
// hundred blocks — the ones the create request carried — with the rest still to
// come.
async function killedMidPost(post: LocalPost): Promise<FakeNotion> {
  const notion = new FakeNotion();
  notion.killAfter(1);
  await expect(migrate(notion, [post])).rejects.toThrow(/killed/);
  notion.restart();
  return notion;
}

const propertyOf = (notion: FakeNotion, pageId: string, name: string) =>
  notion.pages.get(pageId)?.properties[name];

describe("a draft whose metadata moved on while it waited", () => {
  const post = local("one", paragraphs(150));

  it("puts a changed date back before publishing it", async () => {
    const notion = await killedMidPost(post);
    notion.setProperty("page-1", "Published", {
      type: "date",
      date: { start: "2019-01-01" },
    });

    const result = await migrate(notion, [post]);

    expect(result.errors).toEqual([]);
    expect(propertyOf(notion, "page-1", "Published")).toEqual({
      type: "date",
      date: { start: "2026-05-20" },
    });
    expect(livePages(notion)[0].status).toBe("Published");
  });

  it("puts a changed excerpt back", async () => {
    const notion = await killedMidPost(post);
    notion.setProperty("page-1", "Excerpt", {
      type: "rich_text",
      rich_text: [{ plain_text: "Somebody retyped this." }],
    });

    await migrate(notion, [post]);

    const excerpt = propertyOf(notion, "page-1", "Excerpt") as {
      rich_text: { plain_text: string }[];
    };
    expect(excerpt.rich_text.map((run) => run.plain_text).join("")).toBe(
      "Excerpt one",
    );
  });

  it("puts changed tags back", async () => {
    const notion = await killedMidPost(post);
    notion.setProperty("page-1", "Tags", {
      type: "multi_select",
      multi_select: [{ name: "Cooking" }, { name: "Notion" }],
    });

    await migrate(notion, [post]);

    const tags = propertyOf(notion, "page-1", "Tags") as {
      multi_select: { name: string }[];
    };
    expect(tags.multi_select.map((tag) => tag.name)).toEqual(["AI"]);
  });

  it("rewrites all three in one request, while the page is still a Draft", async () => {
    const notion = await killedMidPost(post);
    notion.setProperty("page-1", "Published", {
      type: "date",
      date: { start: "2019-01-01" },
    });
    notion.setProperty("page-1", "Excerpt", {
      type: "rich_text",
      rich_text: [{ plain_text: "Changed." }],
    });
    notion.setProperty("page-1", "Tags", {
      type: "multi_select",
      multi_select: [],
    });

    const before = notion.mutations.length;
    await migrate(notion, [post]);

    expect(notion.mutations.slice(before)).toEqual([
      "append:page-1:50",
      "meta:page-1:Excerpt+Published+Tags",
      "publish:page-1",
    ]);
  });

  it("touches nothing when the metadata already agrees", async () => {
    const notion = await killedMidPost(post);

    const before = notion.mutations.length;
    await migrate(notion, [post]);

    expect(notion.mutations.slice(before)).toEqual([
      "append:page-1:50",
      "publish:page-1",
    ]);
  });

  it("reads the whole page again after the rewrite, before publishing", async () => {
    const notion = await killedMidPost(post);
    notion.setProperty("page-1", "Excerpt", {
      type: "rich_text",
      rich_text: [{ plain_text: "Changed." }],
    });
    // Somebody writes into the page in the same moment the excerpt is put back.
    notion.beforeWrite = (kind, pageId) => {
      if (kind !== "update") return;
      notion.beforeWrite = undefined;
      notion.addBlock(pageId, "Mine, not yours.");
    };

    await expect(migrate(notion, [post])).rejects.toThrow(/one\.mdx/);

    expect(notion.published).toEqual([]);
    expect(livePages(notion)[0].status).toBe("Draft");
  });
});

describe("a draft that turns out to be another post", () => {
  const post = local("one", paragraphs(150));

  it("refuses a changed title rather than overwriting it", async () => {
    const notion = await killedMidPost(post);
    notion.setProperty("page-1", "Name", {
      type: "title",
      title: [{ plain_text: "Somebody else's post" }],
    });

    const result = await migrate(notion, [post]);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/title/i);
    expect(propertyOf(notion, "page-1", "Name")).toEqual({
      type: "title",
      title: [{ plain_text: "Somebody else's post" }],
    });
    expect(livePages(notion)[0].status).toBe("Draft");
  });

  // The slug is read once for the plan and again for every write, so one that
  // moves in between is caught by the run rather than by the plan.
  it("refuses a slug that changed after the plan was made", async () => {
    const notion = await killedMidPost(post);
    let done = false;
    notion.afterRead = (kind, id) => {
      if (done || kind !== "retrieve") return;
      done = true;
      notion.setProperty(id, "Slug", {
        type: "rich_text",
        rich_text: [{ plain_text: "somebody-elses-slug" }],
      });
    };

    await expect(migrate(notion, [post])).rejects.toThrow(/slug/i);

    const slug = propertyOf(notion, "page-1", "Slug") as {
      rich_text: { plain_text: string }[];
    };
    expect(slug.rich_text[0].plain_text).toBe("somebody-elses-slug");
    expect(notion.published).toEqual([]);
  });
});

describe("a database that tracks publication with the other property", () => {
  const post = local("one", paragraphs(3));

  it("migrates end to end when the page and the schema agree on Select", async () => {
    const notion = new FakeNotion();

    const result = await migrate(notion, [post], selectSchema);

    expect(result.errors).toEqual([]);
    expect(propertyOf(notion, "page-1", "Status")).toEqual({
      type: "select",
      select: { name: "Published" },
    });
  });

  it("refuses a page whose Status is a Select where the schema says Status", async () => {
    const notion = new FakeNotion();
    notion.seed({
      slug: "one",
      title: "Title one",
      status: "Draft",
      statusType: "select",
    });

    await expect(migrate(notion, [post], statusSchema)).rejects.toThrow(
      /select[\s\S]*status|status[\s\S]*select/i,
    );

    expect(notion.mutations).toEqual([]);
  });

  it("refuses a page whose Status is a Status where the schema says Select", async () => {
    const notion = new FakeNotion();
    notion.seed({
      slug: "one",
      title: "Title one",
      status: "Draft",
      statusType: "status",
    });

    await expect(migrate(notion, [post], selectSchema)).rejects.toThrow(
      /Status/,
    );

    expect(notion.mutations).toEqual([]);
  });
});

describe("metadata that moves under the promotion itself", () => {
  it("demotes a page whose excerpt changed as it was published", async () => {
    const notion = new FakeNotion();
    notion.beforeWrite = (kind, pageId) => {
      if (kind !== "update") return;
      notion.beforeWrite = undefined;
      notion.setProperty(pageId, "Excerpt", {
        type: "rich_text",
        rich_text: [{ plain_text: "Changed under the promotion." }],
      });
    };

    await expect(
      migrate(notion, [local("one", paragraphs(3))]),
    ).rejects.toThrow(/excerpt/i);

    expect(livePages(notion)[0].status).toBe("Draft");
    expect(notion.mutations).toEqual([
      "create:page-1:3",
      "publish:page-1",
      "status:page-1:Draft",
    ]);
  });
});
