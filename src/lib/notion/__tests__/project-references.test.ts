import { describe, expect, it } from "vitest";
import { fetchBlockTree, queryPages, retrievePage, type PageObject } from "../client";
import { collectSources } from "../collect";
import { pageSlug, pageStatus, pageTitle, toPostSource } from "../fetch-post";
import { blocksToMarkdown } from "../blocks-to-md";
import { createMigrationExecutor } from "../migrate-executor";
import {
  compareMetadata,
  prepareMigration,
  runMigration,
  toLocalPost,
  type LocalPost,
  type PageMetadata,
} from "../migrate";
import { schemaProblems, type DataSourceSchema } from "../properties";
import { contentProjection, serializePost } from "../serialize";
import { metadataProblems, validateLocalPosts } from "../validate";
import { FakeNotion, properties } from "./fixtures/fake-notion";
import { block, rt } from "./fixtures/blocks";

const legacySchema: DataSourceSchema = {
  Name: { type: "title" },
  Slug: { type: "rich_text" },
  Excerpt: { type: "rich_text" },
  Tags: { type: "multi_select" },
  Published: { type: "date" },
  Status: {
    type: "status",
    status: { options: [{ name: "Draft" }, { name: "Published" }] },
  },
};
const schema: DataSourceSchema = {
  ...legacySchema,
  Projects: { type: "multi_select" },
};
const frontmatter = {
  title: "Title one",
  date: "2026-05-20",
  excerpt: "Excerpt one",
  tags: ["AI"],
  updated: "2026-06-01",
};
const local = (projects?: string[]): LocalPost => ({
  file: "one.mdx",
  slug: "one",
  title: frontmatter.title,
  date: frontmatter.date,
  excerpt: frontmatter.excerpt,
  tags: frontmatter.tags,
  content: "Body.\n",
  ...(projects === undefined ? {} : { projects }),
});
const selection = (names: unknown[]) => ({
  type: "multi_select",
  multi_select: names.map((name) => ({ name })),
});
const page = (Projects?: unknown): PageObject => ({
  id: "page-1",
  last_edited_time: "2026-06-01T00:00:00Z",
  properties: {
    ...properties({ slug: "one", title: "Title one", status: "Published" }),
    ...(Projects === undefined ? {} : { Projects }),
  },
});
const blocks = [block("paragraph", { rich_text: [rt("Body.")] })];
const raw = (projects: unknown) => [
  "---",
  'title: "Title one"',
  'date: "2026-05-20"',
  'excerpt: "Excerpt one"',
  'tags: ["AI"]',
  `projects: ${JSON.stringify(projects)}`,
  "---",
  "",
  "Body.",
].join("\n");

async function prepare(notion: FakeNotion, posts: LocalPost[], target = schema) {
  const pages = (await queryPages(notion.client, "ds-1")).map((remote) => ({
    pageId: remote.id,
    slug: pageSlug(remote),
    title: pageTitle(remote),
    status: pageStatus(remote),
  }));
  return prepareMigration(
    posts, pages, { dataSourceId: "ds-1", schema: target },
    (id) => fetchBlockTree(notion.client, id),
  );
}

async function migrate(notion: FakeNotion, posts: LocalPost[], target = schema) {
  const prepared = await prepare(notion, posts, target);
  expect(prepared.errors).toEqual([]);
  await runMigration(prepared.writes, createMigrationExecutor(notion.client, "ds-1", target));
  return prepared;
}

describe("optional Notion Projects", () => {
  it("keeps missing and empty selections out of frontmatter", () => {
    expect(toPostSource(page(), blocks).frontmatter).toEqual(frontmatter);
    expect(toPostSource(page(selection([])), blocks).frontmatter).toEqual(frontmatter);
  });

  it("canonicalizes titles, slugs, and duplicates without changing author order", () => {
    expect(toPostSource(page(selection([
      " TuringAgent ", "KNIGHTS OF THE ROUND TABLE", "coding-skills", "watchslinger",
    ])), blocks).frontmatter.projects).toEqual([
      "turingagent", "coding-skills", "watchslinger",
    ]);
  });

  it.each([
    null,
    { type: "select", select: { name: "private-author-value" } },
    { type: "private-author-value", multi_select: [] },
    { type: "multi_select" },
    { type: "multi_select", multi_select: "private-author-value" },
    { type: "multi_select", multi_select: [null] },
    selection(["private-author-value"]),
    selection([null]),
    selection([""]),
    selection(Array(101).fill("watchslinger")),
  ])("explicitly rejects wrong types and malformed references without raw values", (Projects) => {
    let error: unknown;
    try { toPostSource(page(Projects), blocks); } catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).toMatch(/projects/i);
    expect(String(error)).not.toContain("private-author-value");
  });

  it("isolates invalid project metadata through the existing per-post failure path", async () => {
    const invalid = page(selection(["private-author-value"]));
    const valid = { ...page(selection(["Watchslinger"])), id: "page-2" };
    const result = await collectSources([invalid, valid], {
      fetchBlocks: async () => blocks,
      retrievePage: async (id) => id === invalid.id ? invalid : valid,
    });
    expect(result.sources.map((source) => source.pageId)).toEqual(["page-2"]);
    expect(result.failures).toEqual([{
      pageId: "page-1",
      slug: "one",
      message: "projects contains an unknown public project reference",
    }]);
  });
});

describe("project frontmatter serialization and validation", () => {
  it("keeps legacy bytes identical when projects is absent or empty", () => {
    const expected = [
      "---", 'title: "Title one"', 'date: "2026-05-20"',
      'excerpt: "Excerpt one"', 'tags: ["AI"]', 'updated: "2026-06-01"',
      "---", "", "Body.", "",
    ].join("\n");
    expect(serializePost(frontmatter, "Body.\n")).toBe(expected);
    expect(serializePost({ ...frontmatter, projects: [] }, "Body.\n")).toBe(expected);
  });

  it("appends canonical projects after the original five fields", () => {
    const serialized = serializePost({
      ...frontmatter, projects: ["Knights of the Round Table", "coding-skills", "Watchslinger"],
    }, "Body.\n");
    expect(serialized).toContain(
      'updated: "2026-06-01"\nprojects: ["coding-skills", "watchslinger"]\n---',
    );
    expect(contentProjection(serialized)).not.toBe(
      contentProjection(serializePost(frontmatter, "Body.\n")),
    );
  });

  it("rejects malformed references even when the serializer is called directly", () => {
    expect(() => serializePost({
      ...frontmatter, projects: ["private-author-value"],
    }, "Body.\n")).toThrow("projects contains an unknown public project reference");
  });

  it("uses shared validation for sync and local metadata", () => {
    expect(metadataProblems({ ...frontmatter, projects: ["private-author-value"] })).toEqual([
      "projects contains an unknown public project reference",
    ]);
    for (const value of [null, "private-author-value", [false], [""], ["private-author-value"]]) {
      const post = toLocalPost("one.mdx", raw(value));
      const errors = validateLocalPosts([post]);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/one\.mdx: projects/);
      expect(errors[0]).not.toContain("private-author-value");
      expect(JSON.stringify(post)).not.toContain("private-author-value");
    }
  });

  it("reads canonical references from local YAML and omits empty projects", () => {
    expect(toLocalPost("one.mdx", raw(["Watchslinger", "WATCHSLINGER", "TuringAgent"])).projects)
      .toEqual(["watchslinger", "turingagent"]);
    expect(toLocalPost("one.mdx", raw([]))).not.toHaveProperty("projects");
  });
});

describe("Projects schema preflight", () => {
  it("does not require a new column for legacy posts", async () => {
    const notion = new FakeNotion();
    const prepared = await prepare(notion, [local()], legacySchema);
    expect(prepared.errors).toEqual([]);
    expect(prepared.writes[0].page.properties).not.toHaveProperty("Projects");
  });

  it("rejects a missing column before creating any referenced or unrelated post", async () => {
    const notion = new FakeNotion();
    const prepared = await prepare(notion, [local(["watchslinger"])], legacySchema);
    expect(prepared.errors.join("\n")).toMatch(/Projects.*multi-select/);
    expect(prepared.writes).toEqual([]);
    expect(notion.mutations).toEqual([]);
  });

  it("distinguishes missing schema from existing wrong type, even with no references", async () => {
    const target = { ...schema, Projects: { type: "private-author-value" } };
    const notion = new FakeNotion();
    const prepared = await prepare(notion, [local()], target);
    expect(schemaProblems(target).join("\n")).toMatch(/Projects/);
    expect(prepared.errors.join("\n")).toMatch(/Projects/);
    expect(prepared.errors.join("\n")).not.toContain("private-author-value");
    expect(prepared.writes).toEqual([]);
    expect(notion.mutations).toEqual([]);
  });

  it("rejects malformed local references in preflight, not after writing", async () => {
    const notion = new FakeNotion();
    const prepared = await prepare(notion, [toLocalPost("one.mdx", raw(["private-author-value"]))]);
    expect(prepared.errors).toEqual([
      "one.mdx: projects contains an unknown public project reference",
    ]);
    expect(prepared.writes).toEqual([]);
    expect(notion.mutations).toEqual([]);
  });
});

describe("Projects migration round trip and reconciliation", () => {
  it("round-trips the real migration, property reader, converter, and serializer", async () => {
    const notion = new FakeNotion();
    const post = toLocalPost("one.mdx", raw(["TuringAgent", "Knights of the Round Table", "coding-skills"]));
    const prepared = await migrate(notion, [post]);
    expect(prepared.writes[0].page.properties.Projects).toEqual({
      multi_select: [{ name: "turingagent" }, { name: "coding-skills" }],
    });
    const source = toPostSource(
      await retrievePage(notion.client, "page-1"),
      await fetchBlockTree(notion.client, "page-1"),
    );
    const markdown = blocksToMarkdown(source.blocks, { imagePath: () => "" });
    const rebuilt = toLocalPost("one.mdx", serializePost(source.frontmatter, markdown));
    expect(rebuilt.projects).toEqual(post.projects);
    expect(rebuilt.content.trim()).toBe(post.content.trim());
    expect(notion.mutations).toEqual(["create:page-1:1", "publish:page-1"]);
  });

  it("clears stale references on a resumed draft when local references are removed", async () => {
    const notion = new FakeNotion();
    notion.killAfter(1);
    await expect(migrate(notion, [local(["watchslinger"])])).rejects.toThrow(/killed/);
    notion.restart();
    await migrate(notion, [local()]);
    expect(notion.pages.get("page-1")?.properties.Projects).toEqual(selection([]));
    expect(notion.mutations).toEqual([
      "create:page-1:1", "meta:page-1:Projects", "publish:page-1",
    ]);
  });

  it("does not rewrite a resumed page whose title/slug aliases resolve to the same projects", async () => {
    const notion = new FakeNotion();
    notion.killAfter(1);
    await expect(migrate(notion, [local(["coding-skills", "watchslinger"])])).rejects.toThrow(/killed/);
    notion.restart();
    notion.setProperty("page-1", "Projects", selection([
      " Knights of the Round Table ", "CODING-SKILLS", "Watchslinger",
    ]));
    await migrate(notion, [local(["coding-skills", "watchslinger"])]);
    expect(notion.mutations).toEqual(["create:page-1:1", "publish:page-1"]);
  });

  it("compares absent and empty equally, but detects removed or reordered references", () => {
    const metadata: PageMetadata = { ...frontmatter, slug: "one", statusType: "status" };
    expect(compareMetadata(metadata, { ...metadata, projects: [] }).repairable).toEqual([]);
    expect(compareMetadata(metadata, { ...metadata, projects: ["watchslinger"] }).repairable)
      .toEqual(["projects"]);
    expect(compareMetadata(
      { ...metadata, projects: ["watchslinger", "turingagent"] },
      { ...metadata, projects: ["turingagent", "watchslinger"] },
    ).repairable).toEqual(["projects"]);
  });

  it("does not mutate a draft whose Projects property changed to another type", async () => {
    const notion = new FakeNotion();
    notion.killAfter(1);
    await expect(migrate(notion, [local(["watchslinger"])])).rejects.toThrow(/killed/);
    notion.restart();
    notion.setProperty("page-1", "Projects", {
      type: "select", select: { name: "private-author-value" },
    });
    await expect(migrate(notion, [local(["watchslinger"])])).rejects.toThrow(/Projects/);
    expect(notion.mutations).toEqual(["create:page-1:1"]);
  });

  it("refuses stale references when the target schema cannot clear them", async () => {
    const notion = new FakeNotion();
    notion.killAfter(1);
    await expect(migrate(notion, [local(["watchslinger"])])).rejects.toThrow(/killed/);
    notion.restart();
    await expect(migrate(notion, [local()], legacySchema)).rejects.toThrow(/Projects/);
    expect(notion.mutations).toEqual(["create:page-1:1"]);
  });

  it.each([
    selection(["turingagent"]),
    selection(["private-author-value"]),
    { type: "select", select: { name: "private-author-value" } },
  ])("demotes a page whose Projects changed during promotion", async (Projects) => {
    const notion = new FakeNotion();
    notion.beforeWrite = (kind, pageId) => {
      if (kind !== "update") return;
      notion.beforeWrite = undefined;
      notion.setProperty(pageId, "Projects", Projects);
    };
    let error: unknown;
    try { await migrate(notion, [local(["watchslinger"])]); } catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).toMatch(/projects/i);
    expect(String(error)).not.toContain("private-author-value");
    expect(notion.pages.get("page-1")?.properties.Status).toEqual({
      type: "status", status: { name: "Draft" },
    });
    expect(notion.mutations).toEqual([
      "create:page-1:1", "publish:page-1", "status:page-1:Draft",
    ]);
  });
});
