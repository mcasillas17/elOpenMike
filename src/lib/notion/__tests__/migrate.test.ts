import { describe, it, expect } from "vitest";
import {
  toLocalPost,
  planMigration,
  migrationRequests,
  type LocalPost,
  type RemotePage,
} from "@/lib/notion/migrate";
import type { DataSourceSchema } from "@/lib/notion/properties";

// The migration created a page for every local .mdx file, unconditionally. It
// is a one-shot script over a network API, so the first run that dies halfway —
// a 429, a bad fence, a dropped connection — leaves the database half full and
// the only recovery is to run it again, which duplicates everything that had
// already landed. Two Notion pages then claim one slug, which the sync refuses
// outright, so the blog stops updating until someone cleans the database by
// hand.

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

const file = (slug: string, body = "Body.\n") =>
  [
    "---",
    'title: "A minimal tool"',
    'date: "2026-05-20"',
    'excerpt: "Keep the surface small."',
    'tags: ["AI", "Distributed Systems"]',
    "---",
    "",
    body,
  ].join("\n");

const local = (slug: string, overrides: Partial<LocalPost> = {}): LocalPost => ({
  file: `${slug}.mdx`,
  slug,
  title: `Title ${slug}`,
  date: "2026-05-20",
  excerpt: `Excerpt ${slug}`,
  tags: ["AI"],
  content: `Body of ${slug}.\n`,
  ...overrides,
});

const remote = (slug: string, overrides: Partial<RemotePage> = {}): RemotePage => ({
  pageId: `page-${slug}`,
  slug,
  ...overrides,
});

describe("toLocalPost", () => {
  it("maps a post's frontmatter and body, keying it by a normalized slug", () => {
    const post = toLocalPost("grounding-agents.mdx", file("grounding-agents"));
    expect(post).toEqual({
      file: "grounding-agents.mdx",
      slug: "grounding-agents",
      title: "A minimal tool",
      date: "2026-05-20",
      excerpt: "Keep the surface small.",
      tags: ["AI", "Distributed Systems"],
      content: "\nBody.\n",
    });
  });

  it("normalizes a file name that is not already url-safe", () => {
    expect(toLocalPost("A Minimal Tool!.mdx", file("x")).slug).toBe(
      "a-minimal-tool",
    );
  });

  it("falls back to the file name when the frontmatter has no title", () => {
    expect(toLocalPost("a-post.mdx", "---\ndate: 2026-01-01\n---\n\nBody.\n").title).toBe(
      "a-post",
    );
  });

  // YAML turns an unquoted 2026-05-20 into a Date, whose default string form
  // Notion rejects — and which local time has already moved back a day.
  it("keeps an unquoted frontmatter date on the day it was written", () => {
    expect(
      toLocalPost("a-post.mdx", "---\ndate: 2026-05-20\n---\n\nBody.\n").date,
    ).toBe("2026-05-20");
    expect(
      toLocalPost("a-post.mdx", '---\ndate: "2026-05-20"\n---\n\nBody.\n').date,
    ).toBe("2026-05-20");
    expect(toLocalPost("a-post.mdx", "---\ntitle: X\n---\n\nBody.\n").date).toBe(
      "",
    );
  });
});

describe("planMigration", () => {
  it("creates every post on a clean first run", () => {
    const posts = [local("one"), local("two")];
    const plan = planMigration(posts, []);

    expect(plan.errors).toEqual([]);
    expect(plan.create.map((p) => p.slug)).toEqual(["one", "two"]);
    expect(plan.skip).toEqual([]);
  });

  it("creates only what is missing when a first run died halfway", () => {
    const posts = [local("one"), local("two"), local("three")];
    const plan = planMigration(posts, [remote("one")]);

    expect(plan.errors).toEqual([]);
    expect(plan.create.map((p) => p.slug)).toEqual(["two", "three"]);
    expect(plan.skip).toEqual([{ slug: "one", pageId: "page-one" }]);
  });

  it("does nothing at all once every post is in the database", () => {
    const posts = [local("one"), local("two")];
    const plan = planMigration(posts, [remote("two"), remote("one")]);

    expect(plan.errors).toEqual([]);
    expect(plan.create).toEqual([]);
    expect(plan.skip.map((s) => s.slug)).toEqual(["one", "two"]);
  });

  it("ignores database pages no local post claims", () => {
    const plan = planMigration([local("one")], [remote("written-in-notion")]);
    expect(plan.errors).toEqual([]);
    expect(plan.create.map((p) => p.slug)).toEqual(["one"]);
  });

  // Two remote pages on one slug is exactly what a duplicated migration leaves
  // behind. Picking one to match against would quietly bless the mess.
  it("refuses to plan anything when two database pages share a slug", () => {
    const plan = planMigration(
      [local("one"), local("two")],
      [remote("one"), { pageId: "page-one-again", slug: "one" }],
    );

    expect(plan.create).toEqual([]);
    expect(plan.errors).toHaveLength(1);
    expect(plan.errors[0]).toContain('"one"');
    expect(plan.errors[0]).toContain("page-one");
    expect(plan.errors[0]).toContain("page-one-again");
  });

  it("refuses to plan anything when two local files map to one slug", () => {
    const plan = planMigration(
      [
        local("a-post", { file: "a-post.mdx" }),
        local("a-post", { file: "A Post.mdx" }),
      ],
      [],
    );

    expect(plan.create).toEqual([]);
    expect(plan.errors).toHaveLength(1);
    expect(plan.errors[0]).toContain("a-post");
    expect(plan.errors[0]).toContain("A Post.mdx");
  });

  it("refuses a file name with nothing url-safe in it", () => {
    const plan = planMigration([local("", { file: "!!!.mdx" })], []);
    expect(plan.create).toEqual([]);
    expect(plan.errors[0]).toContain("!!!.mdx");
  });

  // A trashed page is invisible to the sync, so it does not hold its slug —
  // trashing a page and re-running is how you redo one post.
  it("recreates a post whose only database page is in the trash", () => {
    for (const trashed of [{ archived: true }, { in_trash: true }]) {
      const plan = planMigration(
        [local("one")],
        [remote("one", trashed)],
      );
      expect(plan.errors).toEqual([]);
      expect(plan.create.map((p) => p.slug)).toEqual(["one"]);
      expect(plan.archived.map((a) => a.slug)).toEqual(["one"]);
    }
  });

  // A blank row is one Enter press away in any Notion database view, and its
  // slug normalizes to nothing. Two of them are not a collision with anything.
  it("ignores database rows with no usable slug", () => {
    const plan = planMigration(
      [local("one")],
      [
        { pageId: "page-blank-1", slug: "" },
        { pageId: "page-blank-2", slug: "" },
      ],
    );

    expect(plan.errors).toEqual([]);
    expect(plan.create.map((p) => p.slug)).toEqual(["one"]);
  });

  it("does not count a trashed page as a duplicate of a live one", () => {
    const plan = planMigration(
      [local("one")],
      [remote("one"), { pageId: "page-old", slug: "one", in_trash: true }],
    );

    expect(plan.errors).toEqual([]);
    expect(plan.create).toEqual([]);
    expect(plan.skip).toEqual([{ slug: "one", pageId: "page-one" }]);
  });
});

describe("migrationRequests", () => {
  const options = {
    dataSourceId: "ds-1",
    schema: statusSchema,
  };

  it("builds one create-page request per missing post, and none for the rest", () => {
    const plan = planMigration([local("one"), local("two")], [remote("one")]);
    const requests = migrationRequests(plan, options);

    expect(requests).toHaveLength(1);
    expect(requests[0].page.parent).toEqual({
      type: "data_source_id",
      data_source_id: "ds-1",
    });
    expect(requests[0].page.properties.Slug).toEqual({
      rich_text: [{ type: "text", text: { content: "two" } }],
    });
  });

  it("writes the title under whatever the title property is called", () => {
    const plan = planMigration([local("one")], []);
    const [request] = migrationRequests(plan, {
      dataSourceId: "ds-1",
      schema: schema({ "Post title": "title", Status: "status" }),
    });

    expect(request.page.properties["Post title"]).toEqual({
      title: [{ type: "text", text: { content: "Title one" } }],
    });
  });

  // buildStatusProperty and notionCodeLanguage are load-bearing: the API
  // rejects the whole page for the wrong Status shape or an unknown fence.
  it("keeps writing Status in the shape the database uses", () => {
    const plan = planMigration([local("one")], []);

    expect(
      migrationRequests(plan, options)[0].page.properties.Status,
    ).toEqual({ status: { name: "Published" } });
    expect(
      migrationRequests(plan, {
        dataSourceId: "ds-1",
        schema: schema({ Name: "title", Status: "select" }),
      })[0].page.properties.Status,
    ).toEqual({ select: { name: "Published" } });
  });

  it("fails loudly, before any page is created, on an unusable Status property", () => {
    const plan = planMigration([local("one")], []);
    expect(() =>
      migrationRequests(plan, {
        dataSourceId: "ds-1",
        schema: schema({ Name: "title", Status: "rich_text" }),
      }),
    ).toThrow(/Status/);
  });

  it("keeps translating fence languages Notion would refuse", () => {
    const plan = planMigration(
      [local("one", { content: "```ts\nconst a = 1;\n```\n" })],
      [],
    );
    const [request] = migrationRequests(plan, options);

    expect(request.page.children).toEqual([
      {
        object: "block",
        type: "code",
        code: {
          rich_text: [{ type: "text", text: { content: "const a = 1;" } }],
          language: "typescript",
        },
      },
    ]);
  });

  it("carries the remaining frontmatter across", () => {
    const plan = planMigration(
      [local("one", { tags: ["AI", "Observability"] })],
      [],
    );
    const [request] = migrationRequests(plan, options);

    expect(request.page.properties.Tags).toEqual({
      multi_select: [{ name: "AI" }, { name: "Observability" }],
    });
    expect(request.page.properties.Published).toEqual({
      date: { start: "2026-05-20" },
    });
    expect(request.page.properties.Excerpt).toEqual({
      rich_text: [{ type: "text", text: { content: "Excerpt one" } }],
    });
  });

  it("builds nothing from a plan that reported errors", () => {
    const plan = planMigration(
      [local("one")],
      [remote("one"), { pageId: "other", slug: "one" }],
    );
    expect(migrationRequests(plan, options)).toEqual([]);
  });

  // The script logs each created slug by pairing plan.create with this list, so
  // the two have to stay one-to-one and in order.
  it("returns exactly one request per created post, in plan order", () => {
    const plan = planMigration(
      [local("one"), local("two"), local("three")],
      [remote("two")],
    );
    const requests = migrationRequests(plan, options);

    expect(requests).toHaveLength(plan.create.length);
    expect(requests.map((r) => r.page.properties.Slug)).toEqual(
      plan.create.map((post) => ({
        rich_text: [{ type: "text", text: { content: post.slug } }],
      })),
    );
  });
});
