import { describe, it, expect } from "vitest";
import {
  postPath,
  existingUpdated,
  desiredFiles,
  planFiles,
  massDeleteError,
  type RenderedPost,
} from "@/lib/notion/plan";
import type { PostFrontmatter } from "@/lib/notion/types";

const frontmatter: PostFrontmatter = {
  title: "Grounding agents",
  date: "2026-05-20",
  excerpt: "Why retrieval beats prompt-stuffing.",
  tags: ["AI"],
  updated: "2026-05-20",
};

const post = (over: Partial<RenderedPost> = {}): RenderedPost => ({
  slug: "grounding-agents",
  frontmatter,
  body: "Body.\n",
  ...over,
});

const touched = (source: RenderedPost, updated: string): RenderedPost => ({
  ...source,
  frontmatter: { ...source.frontmatter, updated },
});

describe("postPath", () => {
  it("namespaces posts under content/blog", () => {
    expect(postPath("a-post")).toBe("content/blog/a-post.mdx");
  });
});

describe("existingUpdated", () => {
  it("reads the quoted value out of frontmatter", () => {
    expect(existingUpdated(desiredFiles([post()], new Map()).get(postPath("grounding-agents")))).toBe(
      "2026-05-20",
    );
  });

  it("returns undefined when there is no file or no updated line", () => {
    expect(existingUpdated(undefined)).toBeUndefined();
    expect(existingUpdated("---\ntitle: \"x\"\n---\n\nBody.\n")).toBeUndefined();
  });
});

describe("desiredFiles", () => {
  it("adopts the incoming updated for a brand new post", () => {
    const files = desiredFiles([touched(post(), "2026-08-03")], new Map());
    expect(files.get(postPath("grounding-agents"))).toContain(
      'updated: "2026-08-03"',
    );
  });

  it("keeps the on-disk updated when only Notion's timestamp moved", () => {
    const onDisk = desiredFiles([post()], new Map());
    const rerun = desiredFiles([touched(post(), "2099-12-31")], onDisk);
    expect(rerun.get(postPath("grounding-agents"))).toContain(
      'updated: "2026-05-20"',
    );
  });

  it("adopts the new updated when the body actually changed", () => {
    const onDisk = desiredFiles([post()], new Map());
    const rerun = desiredFiles(
      [touched(post({ body: "Rewritten.\n" }), "2099-12-31")],
      onDisk,
    );
    expect(rerun.get(postPath("grounding-agents"))).toContain(
      'updated: "2099-12-31"',
    );
  });
});

// The wiring the 10-minute cron depends on: a re-run over unchanged Notion
// content must plan no writes, even though last_edited_time moved.
describe("planFiles idempotency", () => {
  it("returns the desired contents it planned from", () => {
    const { desired, plan } = planFiles([post()], new Map());
    expect(plan.write).toEqual([postPath("grounding-agents")]);
    expect(desired.get(postPath("grounding-agents"))).toContain(
      'title: "Grounding agents"',
    );
  });

  it("plans no work when replayed against its own output", () => {
    const onDisk = desiredFiles([post()], new Map());
    const { plan } = planFiles([touched(post(), "2099-12-31")], onDisk);
    expect(plan.write).toEqual([]);
    expect(plan.delete).toEqual([]);
    expect(plan.unchanged).toEqual([postPath("grounding-agents")]);
  });

  it("still plans a write when the body changed", () => {
    const onDisk = desiredFiles([post()], new Map());
    const { plan } = planFiles([post({ body: "Rewritten.\n" })], onDisk);
    expect(plan.write).toEqual([postPath("grounding-agents")]);
  });

  it("plans a delete for a post that is no longer published", () => {
    const onDisk = desiredFiles([post(), post({ slug: "other" })], new Map());
    const { plan } = planFiles([post()], onDisk);
    expect(plan.delete).toEqual([postPath("other")]);
  });
});

describe("massDeleteError", () => {
  const plan = (deleteCount: number) => ({
    write: [],
    delete: Array.from({ length: deleteCount }, (_, i) => `content/blog/${i}.mdx`),
    unchanged: [],
  });

  it("allows a run that deletes nothing", () => {
    expect(massDeleteError(plan(0), 4)).toBeUndefined();
  });

  it("allows unpublishing a minority of posts", () => {
    expect(massDeleteError(plan(2), 5)).toBeUndefined();
  });

  it("refuses to delete every post", () => {
    expect(massDeleteError(plan(4), 4)).toMatch(/refusing/i);
  });

  it("refuses to delete a majority of posts", () => {
    expect(massDeleteError(plan(3), 4)).toMatch(/refusing/i);
  });

  it("says how to override deliberately", () => {
    expect(massDeleteError(plan(4), 4)).toContain("--allow-mass-delete");
  });

  it("has nothing to guard when the blog is empty", () => {
    expect(massDeleteError(plan(0), 0)).toBeUndefined();
  });
});
