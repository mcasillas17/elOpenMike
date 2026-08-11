import { describe, it, expect } from "vitest";
import {
  postPath,
  existingUpdated,
  desiredFiles,
  massDeleteError,
  type RenderedPost,
} from "@/lib/notion/plan";
import { planSync } from "@/lib/notion/sync";
import type { PostFrontmatter } from "@/lib/notion/types";

const frontmatter: PostFrontmatter = {
  title: "Grounding agents",
  date: "2026-05-20",
  excerpt: "Why retrieval beats prompt-stuffing.",
  tags: ["AI"],
  updated: "2026-05-20",
};

const post = (over: Partial<RenderedPost> = {}): RenderedPost => ({
  pageId: "page-grounding-agents",
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

  // A body line reading `updated: "..."` was stripped by the projection along
  // with the frontmatter key, so editing that line in Notion looked like no
  // change at all and the post kept the stale timestamp it had on disk.
  it("adopts the new updated when only an updated-shaped body line changed", () => {
    const onDisk = desiredFiles(
      [post({ body: 'Prose.\nupdated: "old content"\n' })],
      new Map(),
    );
    const rerun = desiredFiles(
      [
        touched(
          post({ body: 'Prose.\nupdated: "new content"\n' }),
          "2099-12-31",
        ),
      ],
      onDisk,
    );

    const file = rerun.get(postPath("grounding-agents"))!;
    expect(file).toContain('updated: "2099-12-31"');
    expect(file).toContain('updated: "new content"');
  });

  it("keeps the on-disk updated when an updated-shaped body line did not change", () => {
    const body = 'Prose.\nupdated: "new content"\n';
    const onDisk = desiredFiles([post({ body })], new Map());
    const rerun = desiredFiles([touched(post({ body }), "2099-12-31")], onDisk);
    expect(rerun.get(postPath("grounding-agents"))).toContain(
      'updated: "2026-05-20"',
    );
  });
});

// The wiring the 10-minute cron depends on: a re-run over unchanged Notion
// content must plan no writes, even though last_edited_time moved. Exercised
// through planSync, the sync's only planning entry point.
const planFiles = (posts: RenderedPost[], existing: Map<string, string>) =>
  planSync(
    { rendered: posts, images: new Map(), warnings: [], failures: [] },
    existing,
  );

describe("planSync idempotency", () => {
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

// existingUpdated() read the first `updated: "` line anywhere in the file, so a
// post whose body carried one — and whose frontmatter did not — reported a
// timestamp lifted out of its own prose.
describe("existingUpdated outside the frontmatter", () => {
  it("ignores a body line that looks like the key", () => {
    expect(
      existingUpdated('---\ntitle: "x"\n---\n\nupdated: "1999-01-01"\n'),
    ).toBeUndefined();
  });

  it("still reads the real key when the body has one too", () => {
    expect(
      existingUpdated(
        '---\ntitle: "x"\nupdated: "2026-05-20"\n---\n\nupdated: "1999-01-01"\n',
      ),
    ).toBe("2026-05-20");
  });

  it("ignores a file with no frontmatter at all", () => {
    expect(existingUpdated('updated: "1999-01-01"\n')).toBeUndefined();
  });
});
