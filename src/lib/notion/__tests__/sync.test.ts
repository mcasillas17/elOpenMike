import { describe, it, expect } from "vitest";
import {
  renderPosts,
  planSync,
  protectedImageDirs,
  prunableImageDirs,
  pendingOperations,
} from "@/lib/notion/sync";
import { serializePost } from "@/lib/notion/serialize";
import { postPath, massDeleteError } from "@/lib/notion/plan";
import { validateSourceSlugs } from "@/lib/notion/validate";
import type { MdBlock, PostSource } from "@/lib/notion/types";
import { block, rt } from "./fixtures/blocks";

const bytes = (value: string) => new TextEncoder().encode(value);

function imageBlock(url: string): MdBlock {
  return block("image", { type: "file", file: { url }, caption: [rt("Alt")] });
}

function source(slug: string, blocks: MdBlock[] = []): PostSource {
  return {
    pageId: `page-${slug}`,
    slug,
    frontmatter: {
      title: `Title ${slug}`,
      date: "2026-05-20",
      excerpt: `Excerpt ${slug}`,
      tags: ["AI"],
      updated: "2026-05-20",
    },
    blocks: [block("paragraph", { rich_text: [rt(`Body of ${slug}.`)] }), ...blocks],
  };
}

// Fails for any URL containing `fail`, succeeds otherwise, and records the
// order URLs were attempted in.
function downloader() {
  const attempted: string[] = [];
  return {
    attempted,
    download: async (url: string) => {
      attempted.push(url);
      if (url.includes("fail")) {
        throw new Error(`image download failed: 403 ${url.split("?")[0]}`);
      }
      return { bytes: bytes(url), contentType: "image/png" };
    },
  };
}

const fileFor = (post: PostSource, body: string) =>
  serializePost(post.frontmatter, body);

describe("renderPosts", () => {
  it("renders every post when nothing fails", async () => {
    const { download } = downloader();
    const outcome = await renderPosts([source("a"), source("b")], download);

    expect(outcome.rendered.map((p) => p.slug)).toEqual(["a", "b"]);
    expect(outcome.failures).toEqual([]);
  });

  it("keeps a failing post from taking the others down with it", async () => {
    const { attempted, download } = downloader();
    const outcome = await renderPosts(
      [
        source("first", [imageBlock("https://img/ok-1.png")]),
        source("broken", [imageBlock("https://img/fail.png")]),
        source("last", [imageBlock("https://img/ok-2.png")]),
      ],
      download,
    );

    expect(outcome.rendered.map((p) => p.slug)).toEqual(["first", "last"]);
    expect(outcome.failures).toEqual([
      {
        slug: "broken",
        pageId: "page-broken",
        message: "image download failed: 403 https://img/fail.png",
      },
    ]);
    // The post after the failure was still attempted.
    expect(attempted).toEqual([
      "https://img/ok-1.png",
      "https://img/fail.png",
      "https://img/ok-2.png",
    ]);
  });

  it("drops the images a failed post had already downloaded", async () => {
    const { download } = downloader();
    const outcome = await renderPosts(
      [
        source("broken", [
          imageBlock("https://img/ok-1.png"),
          imageBlock("https://img/fail.png"),
        ]),
        source("fine", [imageBlock("https://img/ok-2.png")]),
      ],
      download,
    );

    const dirs = [...outcome.images.keys()];
    expect(dirs.some((file) => file.includes("/broken/"))).toBe(false);
    expect(dirs.filter((file) => file.includes("/fine/"))).toHaveLength(1);
  });

  it("records warnings per slug, and none for a failed post", async () => {
    const { download } = downloader();
    const outcome = await renderPosts(
      [
        source("fine", [block("unsupported_block", {})]),
        source("broken", [
          block("unsupported_block", {}),
          imageBlock("https://img/fail.png"),
        ]),
      ],
      download,
    );

    expect(outcome.warnings).toEqual([
      "fine: skipped unsupported block: unsupported_block",
    ]);
  });

  it("reports a non-Error rejection without crashing", async () => {
    const outcome = await renderPosts([source("x", [imageBlock("u")])], async () => {
      throw "socket hang up";
    });
    expect(outcome.failures[0].message).toBe("socket hang up");
  });
});

describe("planSync", () => {
  it("keeps a failed post's existing file instead of deleting it", async () => {
    const { download } = downloader();
    const broken = source("broken", [imageBlock("https://img/fail.png")]);
    const outcome = await renderPosts([source("fine"), broken], download);

    const onDisk = fileFor(broken, "Older body.\n");
    const existing = new Map([[postPath("broken"), onDisk]]);
    const result = planSync(outcome, existing);

    expect(result.plan.delete).toEqual([]);
    expect(result.plan.unchanged).toContain(postPath("broken"));
    expect(result.desired.get(postPath("broken"))).toBe(onDisk);
    expect(result.preserved).toEqual(["broken"]);
    expect(result.skipped).toEqual([]);
  });

  it("skips a failed post that has nothing on disk yet", async () => {
    const { download } = downloader();
    const outcome = await renderPosts(
      [source("fine"), source("brand-new", [imageBlock("https://img/fail.png")])],
      download,
    );

    const result = planSync(outcome, new Map());
    expect(result.desired.has(postPath("brand-new"))).toBe(false);
    expect(result.plan.write).toEqual([postPath("fine")]);
    expect(result.skipped).toEqual(["brand-new"]);
    expect(result.preserved).toEqual([]);
  });

  it("still writes the posts that did render", async () => {
    const { download } = downloader();
    const outcome = await renderPosts(
      [source("fine"), source("broken", [imageBlock("https://img/fail.png")])],
      download,
    );

    const result = planSync(outcome, new Map());
    expect(result.plan.write).toEqual([postPath("fine")]);
    expect(result.desired.get(postPath("fine"))).toContain("Body of fine.");
  });

  // A Notion-wide image outage must not read as "every post was unpublished":
  // that is exactly the shape the mass-delete guard exists to refuse, and
  // queueing the deletions would push them straight to production.
  it("proposes no deletions when every post fails", async () => {
    const { download } = downloader();
    const posts = ["a", "b", "c"].map((slug) =>
      source(slug, [imageBlock(`https://img/fail-${slug}.png`)]),
    );
    const outcome = await renderPosts(posts, download);

    const existing = new Map(
      posts.map((post) => [postPath(post.slug), fileFor(post, "Old.\n")]),
    );
    const result = planSync(outcome, existing);

    expect(outcome.failures).toHaveLength(3);
    expect(result.plan.delete).toEqual([]);
    expect(result.plan.write).toEqual([]);
    expect(result.preserved).toEqual(["a", "b", "c"]);
  });

  it("still deletes a post that Notion really did unpublish", async () => {
    const { download } = downloader();
    const outcome = await renderPosts([source("kept")], download);

    const existing = new Map([
      [postPath("kept"), fileFor(source("kept"), "Old.\n")],
      [postPath("gone"), "---\ntitle: \"Gone\"\n---\n\nGone.\n"],
    ]);
    const result = planSync(outcome, existing);

    expect(result.plan.delete).toEqual([postPath("gone")]);
    expect(result.deferred).toEqual([]);
  });

  it("prefers a rendered post over a same-slug failure", async () => {
    const { download } = downloader();
    const outcome = await renderPosts(
      [source("dup"), source("dup", [imageBlock("https://img/fail.png")])],
      download,
    );

    const existing = new Map([[postPath("dup"), fileFor(source("dup"), "Old.\n")]]);
    const result = planSync(outcome, existing);

    expect(result.desired.get(postPath("dup"))).toContain("Body of dup.");
    expect(result.preserved).toEqual([]);
  });

  // Two *different* pages under one slug can only be told apart before the run
  // renders: afterwards the survivor and the file on disk look like one post,
  // and whichever page rendered wins. That is what validateSourceSlugs() has to
  // refuse up front — planSync alone cannot see the problem.
  it("cannot tell two distinct pages apart once one of them has failed", async () => {
    const { download } = downloader();
    const first = { ...source("dup"), pageId: "page-first" };
    const second = {
      ...source("dup", [imageBlock("https://img/fail.png")]),
      pageId: "page-second",
    };

    expect(
      validateSourceSlugs(
        [first, second].map(({ pageId, slug }) => ({ pageId, slug })),
      ),
    ).toHaveLength(1);

    const outcome = await renderPosts([first, second], download);
    const existing = new Map([
      [postPath("dup"), fileFor(second, "The other page.\n")],
    ]);
    const result = planSync(outcome, existing);

    expect(outcome.failures.map((failure) => failure.pageId)).toEqual([
      "page-second",
    ]);
    // Nothing here can stop it: the page that rendered publishes over the file
    // the page that failed had on disk.
    expect(result.plan.write).toEqual([postPath("dup")]);
    expect(result.desired.get(postPath("dup"))).toContain("Body of dup.");
    expect(result.desired.get(postPath("dup"))).not.toContain(
      "The other page.",
    );
  });

  it("names the image directories the pruner must leave alone", async () => {
    const { download } = downloader();
    const broken = source("broken", [imageBlock("https://img/fail.png")]);
    const outcome = await renderPosts([broken], download);
    const result = planSync(
      outcome,
      new Map([[postPath("broken"), fileFor(broken, "Old.\n")]]),
    );

    expect(protectedImageDirs(result)).toEqual(["public/images/blog/broken"]);
  });

  it("protects the image directories of skipped and deferred posts too", async () => {
    const { download } = downloader();
    const outcome = await renderPosts(
      [
        source("kept", [imageBlock("https://img/fail-kept.png")]),
        source("never-synced", [imageBlock("https://img/fail-new.png")]),
      ],
      download,
    );

    const result = planSync(
      outcome,
      new Map([
        [postPath("kept"), fileFor(source("kept"), "Old.\n")],
        [postPath("renamed-away"), fileFor(source("renamed-away"), "Old.\n")],
      ]),
    );

    expect(protectedImageDirs(result)).toEqual([
      "public/images/blog/kept",
      "public/images/blog/never-synced",
      "public/images/blog/renamed-away",
    ]);
  });
});

// A post is identified on disk by its slug alone — nothing records which Notion
// page wrote which file. So when a page whose slug changed fails to render, the
// file under its *old* slug looks exactly like a post that was unpublished, and
// deleting it would destroy content that is still published. Any failure at all
// therefore freezes deletion for the whole run: an incomplete view of the blog
// is never a mandate to remove anything.
describe("planSync deletion suppression", () => {
  it("keeps the old file when a failing post's slug changed", async () => {
    const { download } = downloader();
    const outcome = await renderPosts(
      [
        source("fine"),
        source("new-name", [imageBlock("https://img/fail.png")]),
      ],
      download,
    );

    const orphan = fileFor(source("old-name"), "Old body.\n");
    const result = planSync(outcome, new Map([[postPath("old-name"), orphan]]));

    expect(result.plan.delete).toEqual([]);
    expect(result.desired.get(postPath("old-name"))).toBe(orphan);
    expect(result.deferred).toEqual([postPath("old-name")]);
    // The post that did render is still published.
    expect(result.plan.write).toEqual([postPath("fine")]);
    expect(result.skipped).toEqual(["new-name"]);
  });

  it("defers every orphan deletion while any post fails", async () => {
    const { download } = downloader();
    const outcome = await renderPosts(
      [source("fine"), source("broken", [imageBlock("https://img/fail.png")])],
      download,
    );

    const existing = new Map([
      [postPath("broken"), fileFor(source("broken"), "Old.\n")],
      [postPath("orphan-a"), "---\ntitle: \"A\"\n---\n\nA.\n"],
      [postPath("orphan-b"), "---\ntitle: \"B\"\n---\n\nB.\n"],
    ]);
    const result = planSync(outcome, existing);

    expect(result.plan.delete).toEqual([]);
    expect(result.deferred).toEqual([
      postPath("orphan-a"),
      postPath("orphan-b"),
    ]);
    // Deferring is not preserving: the failed post keeps its own bookkeeping.
    expect(result.preserved).toEqual(["broken"]);
  });

  it("leaves the mass-delete guard nothing to refuse when posts fail", async () => {
    const { download } = downloader();
    const outcome = await renderPosts(
      [source("broken", [imageBlock("https://img/fail.png")])],
      download,
    );

    const existing = new Map(
      ["broken", "a", "b", "c"].map((slug) => [
        postPath(slug),
        fileFor(source(slug), "Old.\n"),
      ]),
    );
    const result = planSync(outcome, existing);

    expect(result.plan.delete).toEqual([]);
    expect(massDeleteError(result.plan, existing.size)).toBeUndefined();
  });
});

// Which directories this run is entitled to prune. A directory it never
// observed — a failed post's, a skipped post's, one behind a file whose
// deletion was deferred — is not evidence of anything and must be left alone.
describe("prunableImageDirs", () => {
  it("may prune the posts that rendered", async () => {
    const { download } = downloader();
    const outcome = await renderPosts([source("a"), source("b")], download);
    const result = planSync(outcome, new Map());

    expect(prunableImageDirs(outcome, result)).toEqual([
      "public/images/blog/a",
      "public/images/blog/b",
    ]);
  });

  it("may prune a post Notion really did unpublish", async () => {
    const { download } = downloader();
    const outcome = await renderPosts([source("kept")], download);
    const result = planSync(
      outcome,
      new Map([
        [postPath("kept"), fileFor(source("kept"), "Old.\n")],
        [postPath("gone"), "---\ntitle: \"Gone\"\n---\n\nGone.\n"],
      ]),
    );

    expect(result.plan.delete).toEqual([postPath("gone")]);
    expect(prunableImageDirs(outcome, result)).toContain(
      "public/images/blog/gone",
    );
  });

  it("never prunes a failed, skipped, or deferred post's directory", async () => {
    const { download } = downloader();
    const outcome = await renderPosts(
      [
        source("fine"),
        source("broken", [imageBlock("https://img/fail-1.png")]),
        source("never-synced", [imageBlock("https://img/fail-2.png")]),
      ],
      download,
    );
    const result = planSync(
      outcome,
      new Map([
        [postPath("broken"), fileFor(source("broken"), "Old.\n")],
        [postPath("renamed-away"), fileFor(source("renamed-away"), "Old.\n")],
      ]),
    );

    expect(prunableImageDirs(outcome, result)).toEqual([
      "public/images/blog/fine",
    ]);
  });

  it("refuses a directory a traversal-shaped file name would produce", async () => {
    const { download } = downloader();
    const outcome = await renderPosts([], download);
    const result = planSync(
      outcome,
      new Map([
        ["content/blog/..mdx", "x"],
        ["content/blog/...mdx", "x"],
        ["content/blog/a/../../..mdx", "x"],
      ]),
    );

    expect(result.plan.delete).toHaveLength(3);
    expect(prunableImageDirs(outcome, result)).toEqual([]);
  });
});

// The drift `--check` reports and the work a normal run performs are the same
// list, so the gate cannot pass a run that would change files.
describe("pendingOperations", () => {
  const empty = { write: [], delete: [], unchanged: [] };

  it("is empty when neither plan would touch anything", () => {
    expect(pendingOperations(empty, empty)).toEqual([]);
  });

  it("counts image work even when no mdx file changes", () => {
    expect(
      pendingOperations(empty, {
        write: ["public/images/blog/a/new.png"],
        delete: ["public/images/blog/a/old.png"],
        unchanged: [],
      }),
    ).toEqual([
      "public/images/blog/a/new.png",
      "public/images/blog/a/old.png",
    ]);
  });

  it("merges both plans, sorted", () => {
    expect(
      pendingOperations(
        { write: ["content/blog/b.mdx"], delete: ["content/blog/a.mdx"], unchanged: [] },
        { write: ["public/images/blog/b/new.png"], delete: [], unchanged: [] },
      ),
    ).toEqual([
      "content/blog/a.mdx",
      "content/blog/b.mdx",
      "public/images/blog/b/new.png",
    ]);
  });
});
