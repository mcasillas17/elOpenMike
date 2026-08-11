import fs from "node:fs/promises";
import path from "node:path";
import { describe, it, expect, afterAll } from "vitest";
import {
  MAX_FILENAME_BYTES,
  filenameByteLength,
  slugFilenameProblems,
} from "@/lib/notion/slug";
import { validatePosts, type ValidatablePost } from "@/lib/notion/validate";
import { toPostSource } from "@/lib/notion/fetch-post";
import { postPath } from "@/lib/notion/plan";
import { imageDir } from "@/lib/notion/images";
import { planMigration, prepareMigration, type LocalPost } from "@/lib/notion/migrate";
import type { DataSourceSchema } from "@/lib/notion/properties";
import type { PageObject } from "@/lib/notion/client";
import { FakeNotion } from "./fixtures/fake-notion";
import { block, rt } from "./fixtures/blocks";

// A slug is not only a URL. It is the name of two things on disk —
// content/blog/<slug>.mdx and public/images/blog/<slug>/ — and every filesystem
// this repo is written or checked out on caps a single path component at 255
// bytes. Nothing measured that, so a Notion title long enough to slugify past
// the cap produced a plan the run then failed to carry out: `fs.writeFile`
// threw ENAMETOOLONG partway through, after earlier posts had already been
// written and images already applied, leaving the tree half-updated and the
// commit step to publish it.
//
// So the names are measured in *bytes* before anything is planned or written.

const SCRATCH = path.join(process.cwd(), ".tmp-tests");

const ok: ValidatablePost = {
  pageId: "page-good",
  slug: "a-good-post",
  frontmatter: {
    title: "A good post",
    date: "2026-05-20",
    excerpt: "A short summary.",
    tags: ["AI"],
    updated: "2026-05-20",
  },
  body: "Real content.\n",
};

const withSlug = (slug: string): ValidatablePost => ({ ...ok, slug });

// `${slug}.mdx` is the longer of the two names, so it is what the boundary sits
// on: 251 characters plus the four of ".mdx" is exactly 255 bytes.
const LONGEST_ASCII_SLUG = 251;

describe("filenameByteLength", () => {
  it("counts UTF-8 bytes rather than characters", () => {
    expect(filenameByteLength("abc")).toBe(3);
    expect(filenameByteLength("é")).toBe(2);
    expect(filenameByteLength("日")).toBe(3);
    expect(filenameByteLength("🙂")).toBe(4);
    expect(filenameByteLength("")).toBe(0);
  });
});

describe("slugFilenameProblems", () => {
  it("accepts the longest slug that still fits", () => {
    const slug = "a".repeat(LONGEST_ASCII_SLUG);

    expect(filenameByteLength(`${slug}.mdx`)).toBe(MAX_FILENAME_BYTES);
    expect(slugFilenameProblems(slug)).toEqual([]);
  });

  it("refuses the next character along", () => {
    const problems = slugFilenameProblems("a".repeat(LONGEST_ASCII_SLUG + 1));

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/255/);
    expect(problems[0]).toMatch(/256/);
    expect(problems[0]).toMatch(/byte/i);
  });

  // Slugs are ASCII today, because that is what slugify() builds. The limit is
  // a byte limit all the same, and the check has to be one too: a character
  // count would pass a name the filesystem refuses the moment either changes.
  it("measures a multi-byte slug in bytes, not characters", () => {
    const justFits = "é".repeat(125) + "a"; // 251 bytes, 126 characters
    expect(filenameByteLength(`${justFits}.mdx`)).toBe(MAX_FILENAME_BYTES);
    expect(slugFilenameProblems(justFits)).toEqual([]);

    const overByOne = "é".repeat(126); // 252 bytes as a directory, 256 as a file
    expect(slugFilenameProblems(overByOne)).toHaveLength(1);
  });

  // Both names the slug becomes, not just the post file: an image directory
  // this run would create is a path component too.
  it("names the image directory as well when even that is too long", () => {
    const problems = slugFilenameProblems("é".repeat(200));

    expect(problems).toHaveLength(2);
    expect(problems.join("\n")).toMatch(/content\/blog/);
    expect(problems.join("\n")).toMatch(/images\/blog/);
  });

  it("has nothing to say about an ordinary slug", () => {
    expect(slugFilenameProblems("grounding-agents-with-mcp")).toEqual([]);
  });
});

describe("validatePosts against the filename limit", () => {
  it("accepts a slug of exactly 251 characters and refuses 252", () => {
    expect(validatePosts([withSlug("a".repeat(LONGEST_ASCII_SLUG))])).toEqual([]);

    const errors = validatePosts([withSlug("a".repeat(LONGEST_ASCII_SLUG + 1))]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/byte/i);
  });

  // The slug a page publishes under is derived from its Slug property or, when
  // it has none, from its title — which is free text somebody types in Notion.
  it("refuses a slug a long Notion title produced", () => {
    const page: PageObject = {
      id: "page-1",
      last_edited_time: "2026-06-01T12:34:56.000Z",
      properties: {
        Name: {
          type: "title",
          title: [{ plain_text: "A very long title ".repeat(20) }],
        },
        Excerpt: {
          type: "rich_text",
          rich_text: [{ plain_text: "Keep the surface small." }],
        },
        Tags: { type: "multi_select", multi_select: [{ name: "AI" }] },
        Published: { type: "date", date: { start: "2026-05-20" } },
        Status: { type: "status", status: { name: "Published" } },
      },
    };

    const source = toPostSource(page, [
      block("paragraph", { rich_text: [rt("Body.")] }),
    ]);

    expect(filenameByteLength(`${source.slug}.mdx`)).toBeGreaterThan(
      MAX_FILENAME_BYTES,
    );
    expect(
      validatePosts([{ ...source, body: "Body.\n" }]).join("\n"),
    ).toMatch(/byte/i);
  });
});

// The migration writes no files itself, but the post it pushes into Notion is
// one the sync then has to write — so a name the sync could never create is
// refused before the first page is created, in the same pass as every other
// invariant the two directions share.
describe("the migration against the filename limit", () => {
  const schema: DataSourceSchema = {
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

  const local = (slug: string): LocalPost => ({
    file: `${slug}.mdx`,
    slug,
    title: "A title",
    date: "2026-05-20",
    excerpt: "An excerpt.",
    tags: ["AI"],
    content: "Body.\n",
  });

  it("reports the slug and creates no page", async () => {
    const notion = new FakeNotion();
    const post = local("a".repeat(LONGEST_ASCII_SLUG + 1));

    expect(planMigration([post], []).errors.join("\n")).toMatch(/byte/i);

    const prepared = await prepareMigration(
      [post],
      [],
      { dataSourceId: "ds-1", schema },
      async () => [],
    );

    expect(prepared.writes).toEqual([]);
    expect(prepared.errors.join("\n")).toMatch(/byte/i);
    expect(notion.mutations).toEqual([]);
    expect(notion.pages.size).toBe(0);
  });

  it("lets the longest slug that fits through", async () => {
    const prepared = await prepareMigration(
      [local("a".repeat(LONGEST_ASCII_SLUG))],
      [],
      { dataSourceId: "ds-1", schema },
      async () => [],
    );

    expect(prepared.errors).toEqual([]);
    expect(prepared.writes).toHaveLength(1);
  });
});

// Why the number is 255 and not a guess: the filesystem this repo is written on
// refuses the name itself. Both paths the sync builds are checked, so a change
// to either one is caught here rather than mid-run.
describe("the filesystem the limit comes from", () => {
  const root = path.join(SCRATCH, `filename-${process.pid}`);

  afterAll(async () => {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rmdir(SCRATCH).catch(() => undefined);
  });

  it("writes a 255-byte name and refuses a 256-byte one", async () => {
    const fits = "a".repeat(LONGEST_ASCII_SLUG);
    const over = "a".repeat(LONGEST_ASCII_SLUG + 1);
    await fs.mkdir(path.join(root, path.dirname(postPath(fits))), {
      recursive: true,
    });

    await fs.writeFile(path.join(root, postPath(fits)), "x");
    await expect(
      fs.writeFile(path.join(root, postPath(over)), "x"),
    ).rejects.toMatchObject({ code: "ENAMETOOLONG" });
  });

  it("refuses an image directory whose name is too long", async () => {
    const over = "a".repeat(MAX_FILENAME_BYTES + 1);
    await fs.mkdir(path.join(root, "public/images/blog"), { recursive: true });

    await expect(
      fs.mkdir(path.join(root, imageDir(over)), { recursive: true }),
    ).rejects.toMatchObject({ code: "ENAMETOOLONG" });
  });
});
