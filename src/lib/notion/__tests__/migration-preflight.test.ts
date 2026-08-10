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

describe("raw frontmatter tags", () => {
  const fromTags = (tagsLine?: string) =>
    toLocalPost(
      "raw-tags.mdx",
      [
        "---",
        'title: "Raw tags"',
        "date: 2026-05-20",
        'excerpt: "Tag validation."',
        ...(tagsLine === undefined ? [] : [`tags: ${tagsLine}`]),
        "---",
        "",
        "Body.",
      ].join("\n"),
    );

  async function rejectsRaw(tagsLine?: string): Promise<string> {
    const notion = new FakeNotion();
    const prepared = await prepare(notion, [fromTags(tagsLine)]);

    expect(prepared.writes).toEqual([]);
    expect(notion.mutations).toEqual([]);
    return prepared.errors.join("\n");
  }

  it.each([
    ["a missing value", undefined],
    ["a scalar string", '"AI"'],
    ["a scalar number", "42"],
    ["a mapping", "{ AI: true }"],
  ])("rejects %s instead of treating it as no tags", async (_name, source) => {
    expect(await rejectsRaw(source)).toMatch(/tags?.*array|array.*tags?/i);
  });

  it.each([
    ["a number", '["AI", 42]'],
    ["a boolean", '["AI", true]'],
    ["null", '["AI", null]'],
  ])("rejects %s inside the array instead of coercing it", async (_name, source) => {
    const post = fromTags(source);

    expect(post.tags).not.toContain(String(JSON.parse(source)[1]));
    expect(await rejectsRaw(source)).toMatch(/tag.*string|string.*tag/i);
  });

  it("rejects an empty or whitespace-only option", async () => {
    expect(await rejectsRaw('["AI", "", "   "]')).toMatch(/blank|empty/i);
  });

  it("rejects duplicate options in one post", async () => {
    expect(await rejectsRaw('["AI", "AI"]')).toMatch(/duplicate.*AI|AI.*duplicate/i);
  });

  it("rejects two options whose slugs collide", async () => {
    const errors = await rejectsRaw('["C++", "C#"]');

    expect(errors).toMatch(/tag slug/i);
    expect(errors).toMatch(/C\+\+/);
    expect(errors).toMatch(/C#/);
  });

  it("accepts exactly 100 options and rejects the 101st", async () => {
    const hundred = Array.from({ length: 100 }, (_, index) => `tag-${index}`);
    const notion = new FakeNotion();
    const accepted = await prepare(notion, [fromTags(JSON.stringify(hundred))]);

    expect(accepted.errors).toEqual([]);
    expect(
      (
        accepted.writes[0].page.properties.Tags as {
          multi_select: Array<{ name: string }>;
        }
      ).multi_select,
    ).toEqual(hundred.map((name) => ({ name })));

    const errors = await rejectsRaw(JSON.stringify([...hundred, "tag-100"]));
    expect(errors).toMatch(/101/);
    expect(errors).toMatch(/100/);
  });

  it("preserves authored strings exactly in the request shape", async () => {
    const tags = ["AI", "Distributed Systems", "C++"];
    const notion = new FakeNotion();
    const prepared = await prepare(notion, [fromTags(JSON.stringify(tags))]);

    expect(prepared.errors).toEqual([]);
    expect(prepared.writes[0].page.properties.Tags).toEqual({
      multi_select: tags.map((name) => ({ name })),
    });
  });
});

// The same reasoning as the raw tags above, applied to the two properties a
// page is *identified* by. `String(data.title ?? stem)` turned a YAML sequence
// into "A,B", a mapping into "[object Object]", a number into its digits and a
// boolean into "true" — and each of those was then written into Notion as the
// post's title or excerpt, compared against a live page's, and published to the
// site. A file that says something the frontmatter format cannot express is a
// file the author has to fix, not a value this run gets to invent.
describe("raw frontmatter title and excerpt", () => {
  const fromFrontmatter = (lines: string[]) =>
    toLocalPost(
      "raw-scalars.mdx",
      ["---", ...lines, "---", "", "Body."].join("\n"),
    );

  async function rejects(lines: string[]): Promise<string> {
    const notion = new FakeNotion();
    const prepared = await prepare(notion, [fromFrontmatter(lines)]);

    expect(prepared.writes).toEqual([]);
    expect(notion.mutations).toEqual([]);
    expect(notion.pages.size).toBe(0);
    return prepared.errors.join("\n");
  }

  const withTitle = (value: string) => [
    `title: ${value}`,
    "date: 2026-05-20",
    'excerpt: "An excerpt."',
    'tags: ["AI"]',
  ];

  const withExcerpt = (value: string) => [
    'title: "A title"',
    "date: 2026-05-20",
    `excerpt: ${value}`,
    'tags: ["AI"]',
  ];

  it.each([
    ["a sequence", '["A", "B"]', "A,B"],
    ["a mapping", "{ a: 1 }", "[object Object]"],
    ["a number", "42", "42"],
    ["a boolean", "true", "true"],
  ])("refuses a title written as %s rather than coercing it", async (
    _name,
    written,
    coerced,
  ) => {
    expect(fromFrontmatter(withTitle(written)).title).not.toBe(coerced);
    expect(await rejects(withTitle(written))).toMatch(/title/i);
  });

  it.each([
    ["a sequence", '["A", "B"]', "A,B"],
    ["a mapping", "{ a: 1 }", "[object Object]"],
    ["a number", "42", "42"],
    ["a boolean", "false", "false"],
  ])("refuses an excerpt written as %s rather than coercing it", async (
    _name,
    written,
    coerced,
  ) => {
    expect(fromFrontmatter(withExcerpt(written)).excerpt).not.toBe(coerced);
    expect(await rejects(withExcerpt(written))).toMatch(/excerpt/i);
  });

  // `title:` with nothing after it is a key the author wrote and left empty,
  // which is not the same as a file that carries no title line at all.
  it("refuses an explicitly null title and excerpt", async () => {
    expect(await rejects(withTitle(""))).toMatch(/title/i);
    expect(await rejects(withExcerpt(""))).toMatch(/excerpt/i);
    expect(
      await rejects([
        "title: null",
        "date: 2026-05-20",
        'excerpt: "E"',
        'tags: ["AI"]',
      ]),
    ).toMatch(/title/i);
  });

  it("names the file it refused and writes nothing", async () => {
    expect(await rejects(withTitle("42"))).toMatch(/raw-scalars\.mdx/);
  });

  it("still falls back to the file name when there is no title line at all", async () => {
    const notion = new FakeNotion();
    const post = fromFrontmatter([
      "date: 2026-05-20",
      'excerpt: "An excerpt."',
      'tags: ["AI"]',
    ]);

    expect(post.title).toBe("raw-scalars");
    expect((await prepare(notion, [post])).errors).toEqual([]);
  });

  it("keeps an authored string exactly, including one that looks like a number", async () => {
    const notion = new FakeNotion();
    const post = fromFrontmatter([
      'title: "2026"',
      "date: 2026-05-20",
      'excerpt: "42"',
      'tags: ["AI"]',
    ]);
    const prepared = await prepare(notion, [post]);

    expect(prepared.errors).toEqual([]);
    expect(post.title).toBe("2026");
    expect(post.excerpt).toBe("42");
    expect(prepared.writes[0].page.properties.Excerpt).toEqual({
      rich_text: [{ type: "text", text: { content: "42" } }],
    });
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

  it("refuses a schema that does not expose the options it must validate", () => {
    expect(
      schemaProblems({ ...completeSchema, Status: { type: "status" } }).join(
        "\n",
      ),
    ).toMatch(/options/i);
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
    ["date: 2026-05-20T23:59:59-07:00", "2026-05-20"],
    ['date: "2026-05-20T00:00:00+13:00"', "2026-05-20"],
    ["date: 2026-05-20T00:00:00+13:00", "2026-05-20"],
    ['date: "2026-05-20T09:00:00.000Z"', "2026-05-20"],
    ["date: 2026-05-20T09:00:00.000Z", "2026-05-20"],
    ['date: "2026-05-20"', "2026-05-20"],
    ["date: 2026-05-20", "2026-05-20"],
  ])("reads %s as the day it names", (frontmatter, expected) => {
    expect(day(frontmatter)).toBe(expected);
  });

  it.each([
    '"2026-02-31T09:00:00Z"',
    "2026-02-31T09:00:00Z",
    '"2026-13-01T09:00:00Z"',
    "2026-13-01T09:00:00Z",
  ])(
    "refuses an impossible authored day in %s rather than rolling it over",
    (written) => {
      const post = toLocalPost(
        "a.mdx",
        `---\ntitle: "T"\ndate: ${written}\nexcerpt: "E"\n---\n\nB.\n`,
      );

      expect(post.date).toBe(written.replaceAll('"', "").slice(0, 10));
      expect(validateLocalPosts([post]).join("\n")).toMatch(/date/i);
    },
  );

  it.each([
    '"2026-06-01T23:59:59-07:00"',
    "2026-06-01T23:59:59-07:00",
  ])("narrows an authored `updated` timestamp %s the same way", (written) => {
    expect(
      toLocalPost("a.mdx", `---\nupdated: ${written}\n---\n\nB.\n`).updated,
    ).toBe("2026-06-01");
  });

  it("keeps YAML arrays and quoted escapes while disabling timestamps", () => {
    const post = toLocalPost(
      "a.mdx",
      [
        "---",
        'title: "A \\"quoted\\" title"',
        "date: 2026-05-20",
        'excerpt: "A line\\nbreak"',
        'tags: ["C++", "tag: colon", "back\\\\slash"]',
        "---",
        "",
        "B.",
      ].join("\n"),
    );

    expect(post).toMatchObject({
      title: 'A "quoted" title',
      date: "2026-05-20",
      excerpt: "A line\nbreak",
      tags: ["C++", "tag: colon", "back\\slash"],
    });
  });
});
