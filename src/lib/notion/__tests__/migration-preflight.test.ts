import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { queryPages, fetchBlockTree } from "@/lib/notion/client";
import { pageSlug, pageStatus, pageTitle } from "@/lib/notion/fetch-post";
import {
  prepareMigration,
  toLocalPost,
  type LocalPost,
  type RemotePage,
} from "@/lib/notion/migrate";
import {
  metadataProblems,
  validateLocalPosts,
  validatePosts,
  type ValidatablePost,
} from "@/lib/notion/validate";
import { schemaProblems, type DataSourceSchema } from "@/lib/notion/properties";
import { FakeNotion } from "./fixtures/fake-notion";

// The migration measured a post's *blocks* against everything Notion would
// refuse and never looked at its frontmatter at all. So a post with no date, an
// excerpt twice the length the site allows, or a tag that slugifies to nothing
// was pushed into Notion anyway — and then failed forever at the other end,
// where the sync validates exactly those things and writes nothing until they
// are fixed. The post was in Notion, invisible on the site, and the only sign
// of it was a sync that refused the whole blog.
//
// Worse, a bad date is not even survivable that far: `Published: { start: "" }`
// is rejected by the API mid-run, after earlier posts already have pages.
//
// So every local post is measured before the first write, against the same
// validators the sync runs, and every problem across every post is reported
// together. A run that finds one changes nothing at all.

const completeSchema: DataSourceSchema = {
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

async function prepare(
  notion: FakeNotion,
  posts: LocalPost[],
  schema: DataSourceSchema = completeSchema,
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

  return prepareMigration(posts, pages, { dataSourceId: "ds-1", schema }, (id) =>
    fetchBlockTree(notion.client, id),
  );
}

// Everything the preflight refuses, and nothing it writes.
async function refuses(
  posts: LocalPost[],
  schema: DataSourceSchema = completeSchema,
): Promise<string[]> {
  const notion = new FakeNotion();
  const prepared = await prepare(notion, posts, schema);

  expect(prepared.writes).toEqual([]);
  expect(notion.mutations).toEqual([]);
  expect(notion.pages.size).toBe(0);
  return prepared.errors;
}

describe("a post whose date the site could not read", () => {
  it("refuses a missing date, before a page exists", async () => {
    const errors = await refuses([local("one", { date: "" })]);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/one\.mdx/);
    expect(errors[0]).toMatch(/date/i);
  });

  it("refuses a date in any shape but YYYY-MM-DD", async () => {
    for (const date of ["May 20, 2026", "2026/05/20", "20-05-2026", "2026-5-1"]) {
      const errors = await refuses([local("one", { date })]);
      expect(errors.join("\n")).toMatch(/date/i);
    }
  });

  // 2026-02-31 parses in JS and rolls over into March, so a post dated it would
  // silently publish on the wrong day.
  it("refuses a date that does not exist", async () => {
    const errors = await refuses([local("one", { date: "2026-02-31" })]);

    expect(errors.join("\n")).toMatch(/date/i);
  });

  it("refuses a date carrying a time, which is not the property's shape", async () => {
    const errors = await refuses([
      local("one", { date: "2026-05-20T09:00:00.000Z" }),
    ]);

    expect(errors.join("\n")).toMatch(/date/i);
  });
});

describe("frontmatter the site would refuse on the other side", () => {
  it("refuses an excerpt over the 200 characters the site allows", async () => {
    const errors = await refuses([local("one", { excerpt: "x".repeat(201) })]);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/excerpt/i);
    expect(errors[0]).toMatch(/201/);
  });

  it("accepts an excerpt of exactly 200", async () => {
    const notion = new FakeNotion();
    const prepared = await prepare(notion, [
      local("one", { excerpt: "x".repeat(200) }),
    ]);

    expect(prepared.errors).toEqual([]);
  });

  it("refuses an empty excerpt", async () => {
    const errors = await refuses([local("one", { excerpt: "   " })]);

    expect(errors.join("\n")).toMatch(/excerpt/i);
  });

  it("refuses a post with no title", async () => {
    const errors = await refuses([local("one", { title: "  " })]);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/one\.mdx/);
    expect(errors[0]).toMatch(/title/i);
  });

  it("refuses an `updated` that is not a date", async () => {
    const errors = await refuses([local("one", { updated: "last tuesday" })]);

    expect(errors.join("\n")).toMatch(/updated/i);
  });
});

describe("tags the blog could not build a url from", () => {
  it("refuses a tag with no url-safe characters", async () => {
    for (const tag of ["🔥", "日本語", "—"]) {
      const errors = await refuses([local("one", { tags: ["AI", tag] })]);
      expect(errors.join("\n")).toMatch(/tag/i);
    }
  });

  it("refuses two tags that collapse onto one tag page", async () => {
    const errors = await refuses([
      local("one", { tags: ["C++"] }),
      local("two", { tags: ["C#"] }),
    ]);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/C\+\+/);
    expect(errors[0]).toMatch(/C#/);
  });

  it("refuses a tag Notion cannot store under that name", async () => {
    const errors = await refuses([local("one", { tags: ["AI, and more"] })]);

    expect(errors.join("\n")).toMatch(/comma/i);
  });

  it("refuses a blank tag", async () => {
    const errors = await refuses([local("one", { tags: ["AI", "   "] })]);

    expect(errors.join("\n")).toMatch(/tag/i);
  });

  it("says nothing about the same tag on two posts", async () => {
    const notion = new FakeNotion();
    const prepared = await prepare(notion, [
      local("one", { tags: ["AI"] }),
      local("two", { tags: ["AI"] }),
    ]);

    expect(prepared.errors).toEqual([]);
  });
});

describe("slugs", () => {
  it("refuses a file with no url-safe characters to build a slug from", async () => {
    const errors = await refuses([local("", { file: "!!!.mdx" })]);

    expect(errors.join("\n")).toMatch(/!!!\.mdx/);
  });

  it("refuses two files that map to one slug", async () => {
    const errors = await refuses([
      local("one", { file: "One.mdx" }),
      local("one", { file: "one.mdx" }),
    ]);

    expect(errors.join("\n")).toMatch(/One\.mdx/);
    expect(errors.join("\n")).toMatch(/one\.mdx/);
  });
});

describe("a database that could not hold what the migration writes", () => {
  const without = (name: string): DataSourceSchema => {
    const copy = { ...completeSchema };
    delete copy[name];
    return copy;
  };

  const retyped = (name: string, type: string): DataSourceSchema => ({
    ...completeSchema,
    [name]: { type },
  });

  it.each(["Slug", "Excerpt", "Tags", "Published"])(
    "refuses a database with no %s property",
    async (name) => {
      const errors = await refuses([local("one")], without(name));
      expect(errors.join("\n")).toMatch(new RegExp(name));
    },
  );

  it.each([
    ["Slug", "number"],
    ["Excerpt", "number"],
    ["Tags", "rich_text"],
    ["Published", "rich_text"],
  ])("refuses %s being a %s property", async (name, type) => {
    const errors = await refuses([local("one")], retyped(name, type));
    expect(errors.join("\n")).toMatch(new RegExp(name));
  });

  it("refuses a database with no title property at all", async () => {
    const errors = await refuses([local("one")], without("Name"));
    expect(errors.join("\n")).toMatch(/title/i);
  });

  it("refuses a Status property in neither shape", async () => {
    const errors = await refuses([local("one")], retyped("Status", "rich_text"));
    expect(errors.join("\n")).toMatch(/Status/);
  });

  it("refuses a Status property missing an option the run needs", async () => {
    const errors = await refuses([local("one")], {
      ...completeSchema,
      Status: { type: "status", status: { options: [{ name: "Published" }] } },
    });

    expect(errors.join("\n")).toMatch(/Draft/);
  });

  it("accepts the title property under any name", async () => {
    const notion = new FakeNotion();
    const { Name, ...rest } = completeSchema;
    const prepared = await prepare(notion, [local("one")], {
      ...rest,
      "Post title": Name,
    });

    expect(prepared.errors).toEqual([]);
  });
});

describe("a batch with good posts and bad ones", () => {
  it("reports every problem across every post and writes nothing", async () => {
    const errors = await refuses([
      local("fine"),
      local("no-date", { date: "" }),
      local("long", { excerpt: "x".repeat(400) }),
      local("untitled", { title: "" }),
      local("bad-tag", { tags: ["🔥"] }),
      local("also-fine"),
    ]);

    expect(errors.join("\n")).toMatch(/no-date\.mdx/);
    expect(errors.join("\n")).toMatch(/long\.mdx/);
    expect(errors.join("\n")).toMatch(/untitled\.mdx/);
    expect(errors.join("\n")).toMatch(/bad-tag\.mdx/);
    expect(errors.join("\n")).not.toMatch(/fine\.mdx/);
    expect(errors.length).toBeGreaterThanOrEqual(4);
  });

  it("measures a post the plan would otherwise have skipped", async () => {
    // Already published in Notion, so nothing would be written for it — but a
    // post whose frontmatter is wrong is wrong wherever it is, and the sync
    // refuses the whole blog for it.
    const notion = new FakeNotion();
    notion.seed({ slug: "one", title: "Title one", status: "Published" });

    const prepared = await prepare(notion, [local("one", { date: "nope" })]);

    expect(prepared.errors.join("\n")).toMatch(/one\.mdx/);
    expect(prepared.writes).toEqual([]);
    expect(notion.mutations).toEqual([]);
  });

  it("lets a clean batch through untouched", async () => {
    const notion = new FakeNotion();
    const prepared = await prepare(notion, [local("one"), local("two")]);

    expect(prepared.errors).toEqual([]);
    expect(prepared.writes.map((write) => write.slug)).toEqual(["one", "two"]);
    expect(notion.mutations).toEqual([]);
  });
});

// The point of sharing the validators is that the two directions cannot drift:
// what the sync refuses to publish is what the migration refuses to write.
describe("the invariants both directions are measured against", () => {
  const cases: Array<[string, Partial<LocalPost>]> = [
    ["an empty title", { title: " " }],
    ["a missing date", { date: "" }],
    ["an impossible date", { date: "2026-02-31" }],
    ["an empty excerpt", { excerpt: "" }],
    ["an oversized excerpt", { excerpt: "x".repeat(201) }],
    ["an unslugifiable tag", { tags: ["🔥"] }],
    ["a blank tag", { tags: [" "] }],
    ["an unreadable updated", { updated: "yesterday" }],
    ["a post with nothing in it", { content: "  \n" }],
  ];

  it.each(cases)("both sides refuse %s", (_name, overrides) => {
    const post = local("one", overrides);

    const migration = validateLocalPosts([post]);
    const sync: ValidatablePost = {
      slug: post.slug,
      frontmatter: {
        title: post.title,
        date: post.date,
        excerpt: post.excerpt,
        tags: post.tags,
        updated: post.updated ?? post.date,
      },
      body: post.content,
    };

    expect(migration.length).toBeGreaterThan(0);
    expect(validatePosts([sync]).length).toBeGreaterThan(0);
  });

  it("is one function, so a message means the same thing on both sides", () => {
    expect(
      metadataProblems({
        title: "",
        date: "nope",
        excerpt: "",
        tags: ["🔥"],
        updated: "whenever",
      }).length,
    ).toBeGreaterThanOrEqual(5);
    expect(
      metadataProblems({
        title: "A post",
        date: "2026-05-20",
        excerpt: "Short.",
        tags: ["AI"],
        updated: "2026-05-21",
      }),
    ).toEqual([]);
  });
});

describe("what the repo's own posts say", () => {
  const dir = path.join(process.cwd(), "content", "blog");
  const posts = readdirSync(dir)
    .filter((name) => name.endsWith(".mdx"))
    .sort()
    .map((name) => toLocalPost(name, readFileSync(path.join(dir, name), "utf8")));

  it("passes the preflight every one of them has to", () => {
    expect(posts.length).toBeGreaterThan(0);
    expect(validateLocalPosts(posts)).toEqual([]);
  });
});

describe("schemaProblems", () => {
  it("has nothing to say about the documented schema", () => {
    expect(schemaProblems(completeSchema)).toEqual([]);
  });

  it("reports every missing property at once", () => {
    const problems = schemaProblems({ Name: { type: "title" } });

    expect(problems.join("\n")).toMatch(/Slug/);
    expect(problems.join("\n")).toMatch(/Excerpt/);
    expect(problems.join("\n")).toMatch(/Tags/);
    expect(problems.join("\n")).toMatch(/Published/);
    expect(problems.join("\n")).toMatch(/Status/);
  });

  it("accepts a Select where the database uses one", () => {
    expect(
      schemaProblems({
        ...completeSchema,
        Status: {
          type: "select",
          select: { options: [{ name: "Draft" }, { name: "Published" }] },
        },
      }),
    ).toEqual([]);
  });

  it("says nothing about options a schema does not list", () => {
    expect(
      schemaProblems({ ...completeSchema, Status: { type: "status" } }),
    ).toEqual([]);
  });
});

// The file on disk is where a bad value comes from, so what the reader makes of
// it is part of the invariant.
describe("what toLocalPost carries into the check", () => {
  it("reads an `updated` the author wrote, however YAML parsed it", () => {
    expect(
      toLocalPost("a.mdx", "---\ndate: 2026-05-20\nupdated: 2026-06-01\n---\n\nB.\n")
        .updated,
    ).toBe("2026-06-01");
    expect(
      toLocalPost("a.mdx", '---\ndate: "2026-05-20"\nupdated: "2026-06-01"\n---\n\nB.\n')
        .updated,
    ).toBe("2026-06-01");
  });

  it("leaves `updated` unset when the file does not carry one", () => {
    expect(
      toLocalPost("a.mdx", "---\ndate: 2026-05-20\n---\n\nB.\n").updated,
    ).toBeUndefined();
  });

  // A quoted timestamp is a string, and `new Date("2026-05-20T18:30:00")` is
  // read by JS as *local* time — so narrowing it through a Date moved the post
  // a day west of Greenwich and left the same file meaning two different days
  // on two machines. The day is the ten characters the author wrote.
  const day = (frontmatter: string) =>
    toLocalPost("a.mdx", `---\n${frontmatter}\n---\n\nB.\n`).date;

  it.each([
    ['date: "2026-05-20T18:30:00"', "2026-05-20"],
    ['date: "2026-05-20 22:00:00"', "2026-05-20"],
    ['date: "2026-05-20T23:59:59-07:00"', "2026-05-20"],
    ['date: "2026-05-20T00:00:00+13:00"', "2026-05-20"],
    ['date: "2026-05-20T09:00:00.000Z"', "2026-05-20"],
    ['date: "2026-05-20"', "2026-05-20"],
  ])("reads %s as the day it names", (frontmatter, expected) => {
    expect(day(frontmatter)).toBe(expected);
  });

  it("refuses a timestamp whose day does not exist, rather than rolling it over", () => {
    const post = toLocalPost(
      "a.mdx",
      '---\ntitle: "T"\ndate: "2026-02-31T09:00:00Z"\nexcerpt: "E"\n---\n\nB.\n',
    );

    expect(post.date).toBe("2026-02-31");
    expect(validateLocalPosts([post]).join("\n")).toMatch(/date/i);
  });

  it("narrows an `updated` timestamp the same way", () => {
    expect(
      toLocalPost("a.mdx", '---\nupdated: "2026-06-01T18:30:00"\n---\n\nB.\n')
        .updated,
    ).toBe("2026-06-01");
  });
});
