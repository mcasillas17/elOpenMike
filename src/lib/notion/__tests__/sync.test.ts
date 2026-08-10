import { describe, it, expect } from "vitest";
import { renderPosts, planSync, preservedImageDirs } from "@/lib/notion/sync";
import { serializePost } from "@/lib/notion/serialize";
import { postPath } from "@/lib/notion/plan";
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

  it("names the image directories the pruner must leave alone", async () => {
    const { download } = downloader();
    const broken = source("broken", [imageBlock("https://img/fail.png")]);
    const outcome = await renderPosts([broken], download);
    const result = planSync(
      outcome,
      new Map([[postPath("broken"), fileFor(broken, "Old.\n")]]),
    );

    expect(preservedImageDirs(result)).toEqual(["public/images/blog/broken"]);
  });
});
