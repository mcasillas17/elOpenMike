import { describe, it, expect } from "vitest";
import { isPublished, pageSlug, toPostSource } from "@/lib/notion/fetch-post";
import { validatePosts } from "@/lib/notion/validate";
import type { PageObject } from "@/lib/notion/client";
import type { MdBlock } from "@/lib/notion/types";
import { block, rt } from "./fixtures/blocks";

const richText = (...values: string[]) => ({
  type: "rich_text",
  rich_text: values.map((plain_text) => ({ plain_text })),
});

const title = (...values: string[]) => ({
  type: "title",
  title: values.map((plain_text) => ({ plain_text })),
});

const page = (
  properties: Record<string, unknown>,
  last_edited_time = "2026-06-01T12:34:56.000Z",
): PageObject => ({ id: "page-1", last_edited_time, properties });

const blocks: MdBlock[] = [
  block("paragraph", { rich_text: [rt("Body.")] }),
];

const complete = {
  Name: title("A minimal tool"),
  Slug: richText("a-minimal-tool"),
  Excerpt: richText("Keep the surface small."),
  Tags: { type: "multi_select", multi_select: [{ name: "AI" }] },
  Published: { type: "date", date: { start: "2026-05-20" } },
  Status: { type: "status", status: { name: "Published" } },
};

describe("isPublished", () => {
  it("accepts a Status property set to Published", () => {
    expect(
      isPublished(page({ Status: { status: { name: "Published" } } })),
    ).toBe(true);
  });

  // Notion offers both property types for the same job and a database can use
  // either, so the check reads both shapes rather than assuming one.
  it("accepts a Select property set to Published", () => {
    expect(
      isPublished(page({ Status: { select: { name: "Published" } } })),
    ).toBe(true);
  });

  it("rejects every other value", () => {
    for (const value of ["Draft", "In review", "Archived", "published", ""]) {
      expect(isPublished(page({ Status: { status: { name: value } } }))).toBe(
        false,
      );
      expect(isPublished(page({ Status: { select: { name: value } } }))).toBe(
        false,
      );
    }
  });

  it("rejects a page with no Status property at all", () => {
    expect(isPublished(page({}))).toBe(false);
    expect(isPublished(page({ Stage: { status: { name: "Published" } } }))).toBe(
      false,
    );
  });

  it("rejects a cleared Status", () => {
    expect(isPublished(page({ Status: { status: null } }))).toBe(false);
    expect(isPublished(page({ Status: { select: null } }))).toBe(false);
    expect(isPublished(page({ Status: {} }))).toBe(false);
  });
});

describe("toPostSource title", () => {
  // Notion names the title property "Name" by default and only calls it
  // something else if you rename it, so it is found by type.
  it("finds the title whatever the property is called", () => {
    for (const name of ["Name", "Title", "Post title", "Заголовок"]) {
      const source = toPostSource(page({ [name]: title("Renamed") }), blocks);
      expect(source.frontmatter.title).toBe("Renamed");
    }
  });

  it("joins every run and trims the result", () => {
    const source = toPostSource(
      page({ Name: title("  Grounding ", "agents  ") }),
      blocks,
    );
    expect(source.frontmatter.title).toBe("Grounding agents");
  });

  it("is empty when there is no title property, which validation rejects", () => {
    const source = toPostSource(page({ Slug: richText("a-post") }), blocks);
    expect(source.frontmatter.title).toBe("");
    expect(
      validatePosts([{ ...source, body: "Body.\n" }]).join("\n"),
    ).toContain("title is empty");
  });

  it("ignores a rich_text property that merely looks like a title", () => {
    const source = toPostSource(
      page({ Title: richText("Not the title"), Name: title("Real title") }),
      blocks,
    );
    expect(source.frontmatter.title).toBe("Real title");
  });
});

// The collision guard checks page metadata before any block is fetched, so it
// must derive exactly the slug the post is later written under — a guard that
// checked a different string would wave the collision through.
describe("pageSlug", () => {
  it("is the slug toPostSource publishes under", () => {
    const cases = [
      complete,
      { ...complete, Slug: richText("  A Minimal Tool! ") },
      { ...complete, Slug: undefined },
      { Name: title("!!!") },
    ];
    for (const properties of cases) {
      expect(pageSlug(page(properties))).toBe(
        toPostSource(page(properties), blocks).slug,
      );
    }
  });
});

describe("toPostSource slug", () => {
  it("uses an explicit Slug property", () => {
    expect(toPostSource(page(complete), blocks).slug).toBe("a-minimal-tool");
  });

  it("slugifies an explicit Slug that is not already url-safe", () => {
    const source = toPostSource(
      page({ ...complete, Slug: richText("  A Minimal Tool! ") }),
      blocks,
    );
    expect(source.slug).toBe("a-minimal-tool");
  });

  it("falls back to the title when Slug is absent or empty", () => {
    for (const slug of [undefined, richText(""), richText("   ")]) {
      const properties = { ...complete, Slug: slug };
      const source = toPostSource(page(properties), blocks);
      expect(source.slug).toBe("a-minimal-tool");
    }
  });

  it("produces an invalid slug rather than guessing when both are unusable", () => {
    const source = toPostSource(page({ Name: title("!!!") }), blocks);
    expect(source.slug).toBe("");
    expect(validatePosts([{ ...source, body: "Body.\n" }]).join("\n")).toContain(
      "slug must be lowercase alphanumeric",
    );
  });
});

describe("toPostSource dates", () => {
  it("takes the date from the Published property, day precision", () => {
    const source = toPostSource(
      page({
        ...complete,
        Published: { date: { start: "2026-05-20T09:00:00.000-07:00" } },
      }),
      blocks,
    );
    expect(source.frontmatter.date).toBe("2026-05-20");
  });

  // The mapper's contract is "empty when unset"; validatePosts is what refuses
  // to publish it, so an unset date can never reach the site silently.
  it("is empty for a missing, cleared, or end-only Published property", () => {
    for (const Published of [
      undefined,
      {},
      { date: null },
      { date: {} },
      { date: { end: "2026-05-20" } },
    ]) {
      const source = toPostSource(page({ ...complete, Published }), blocks);
      expect(source.frontmatter.date).toBe("");
      expect(
        validatePosts([{ ...source, body: "Body.\n" }]).join("\n"),
      ).toContain("date must be a valid YYYY-MM-DD value");
    }
  });

  it("takes updated from the page's last_edited_time, not a property", () => {
    const source = toPostSource(
      page(complete, "2026-08-03T23:59:59.000Z"),
      blocks,
    );
    expect(source.frontmatter.updated).toBe("2026-08-03");
  });
});

describe("toPostSource excerpt, tags, and blocks", () => {
  it("reads the excerpt and every tag in order", () => {
    const source = toPostSource(
      page({
        ...complete,
        Excerpt: richText("Keep the ", "surface small."),
        Tags: {
          multi_select: [
            { name: "AI" },
            { name: "Distributed Systems" },
            { name: "Observability" },
          ],
        },
      }),
      blocks,
    );
    expect(source.frontmatter.excerpt).toBe("Keep the surface small.");
    expect(source.frontmatter.tags).toEqual([
      "AI",
      "Distributed Systems",
      "Observability",
    ]);
  });

  it("returns empty values for missing Excerpt and Tags", () => {
    const source = toPostSource(page({ Name: title("A post") }), blocks);
    expect(source.frontmatter.excerpt).toBe("");
    expect(source.frontmatter.tags).toEqual([]);
  });

  it("carries the page id and the blocks through untouched", () => {
    const source = toPostSource(page(complete), blocks);
    expect(source.pageId).toBe("page-1");
    expect(source.blocks).toBe(blocks);
  });

  it("maps a fully populated page in one piece", () => {
    expect(toPostSource(page(complete), blocks)).toEqual({
      pageId: "page-1",
      slug: "a-minimal-tool",
      frontmatter: {
        title: "A minimal tool",
        date: "2026-05-20",
        excerpt: "Keep the surface small.",
        tags: ["AI"],
        updated: "2026-06-01",
      },
      blocks,
    });
  });
});
