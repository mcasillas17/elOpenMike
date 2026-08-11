import { describe, it, expect } from "vitest";
import {
  ImageBudget,
  ImageBudgetError,
  MAX_RUN_IMAGE_BYTES,
  MAX_RUN_IMAGE_COUNT,
  PEAK_RUN_IMAGE_BYTES,
} from "@/lib/notion/image-budget";
import { MAX_IMAGE_BYTES } from "@/lib/notion/images";
import { renderPosts, planSync } from "@/lib/notion/sync";
import { postPath } from "@/lib/notion/plan";
import { serializePost } from "@/lib/notion/serialize";
import type { MdBlock, PostSource } from "@/lib/notion/types";
import { block, rt } from "./fixtures/blocks";

// A sync holds every image it downloads in memory until the very end of the
// run: the plan is computed against the whole desired set before a byte is
// written, because `--check` has to be able to answer "would this change
// anything?" without changing anything. That is the right shape and it is why
// nothing could be streamed to disk — but it means the run's peak memory was
// whatever the blog happened to weigh.
//
// Nothing bounded it. One image is capped at 10 MB (images.ts), and a hundred
// posts carrying ten each is 10 GB of `Uint8Array` on a runner with a few. The
// process does not fail with a message about images: it is killed, mid-run,
// having written nothing, and the next scheduled tick starts behind it.
//
// So the run has a budget, and it is spent per file and per byte. A post whose
// images will not fit is the post that fails — its file on disk is preserved
// exactly like a post whose image would not download — and every other post,
// image-free or merely smaller, syncs as usual. A post that fails gives its
// bytes back, because it never kept them.

// Distinct content per seed, right down to a one-byte image: the sync names a
// file after the hash of its bytes, so two fixtures that happened to share a
// byte would share a file — and be accounted once, which is correct behaviour
// and the wrong thing to be testing here.
const seedOf = (seed: string): number => {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) % 251;
  return hash;
};

const filler = (size: number, seed: string): Uint8Array => {
  const out = new Uint8Array(size);
  const base = seedOf(seed);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = (base + seed.charCodeAt(i % seed.length) + i) % 256;
  }
  return out;
};

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
    blocks: [
      block("paragraph", { rich_text: [rt(`Body of ${slug}.`)] }),
      ...blocks,
    ],
  };
}

// Every URL carries the size it should answer with, so a test says what a post
// weighs rather than building one.
const sized = (name: string, size: number) =>
  `https://img/${name}.png?size=${size}`;

const downloader = () => {
  const attempted: string[] = [];
  return {
    attempted,
    download: async (url: string) => {
      attempted.push(url);
      const size = Number(new URL(url).searchParams.get("size") ?? "1");
      const name = new URL(url).pathname;
      return {
        bytes: filler(size, `${name}:${size}`),
        contentType: "image/png",
        format: "png" as const,
      };
    },
  };
};

const budget = (maxBytes: number, maxCount = 100) =>
  new ImageBudget({ maxBytes, maxCount });

describe("the budget itself", () => {
  it("is documented as a run-wide ceiling, in bytes and in files", () => {
    expect(MAX_RUN_IMAGE_BYTES).toBeGreaterThan(MAX_IMAGE_BYTES);
    expect(Number.isInteger(MAX_RUN_IMAGE_COUNT)).toBe(true);
    expect(MAX_RUN_IMAGE_COUNT).toBeGreaterThan(0);
  });

  it("counts what it was given, exactly once", () => {
    const run = budget(100);
    const post = run.open();

    post.take(30);
    post.take(20);

    expect(run.bytes).toBe(50);
    expect(run.count).toBe(2);
  });

  it("lets the last byte in and refuses the one after it", () => {
    const run = budget(100);
    const post = run.open();

    post.take(100);
    expect(run.bytes).toBe(100);
    expect(() => post.take(1)).toThrow(ImageBudgetError);
    // The refusal costs nothing: what was already accounted stands.
    expect(run.bytes).toBe(100);
    expect(run.count).toBe(1);
  });

  it("refuses one file past the count, whatever it weighs", () => {
    const run = budget(1_000_000, 2);
    const post = run.open();

    post.take(1);
    post.take(1);
    expect(() => post.take(1)).toThrow(ImageBudgetError);
  });

  it("says there is no room for another file before one is fetched", () => {
    const run = budget(10, 1);
    const post = run.open();

    post.room();
    post.take(4);
    expect(() => post.room()).toThrow(ImageBudgetError);
  });

  it("gives a failed post's bytes back, and a committed post's never", () => {
    const run = budget(100);

    const kept = run.open();
    kept.take(40);
    kept.commit();

    const lost = run.open();
    lost.take(50);
    lost.release();

    expect(run.bytes).toBe(40);
    expect(run.count).toBe(1);

    // Releasing twice, or after a commit, changes nothing.
    lost.release();
    kept.release();
    expect(run.bytes).toBe(40);
  });

  it("checks and commits in one step, so two posts cannot take one byte", () => {
    const run = budget(10);
    const first = run.open();
    const second = run.open();

    first.take(10);
    expect(() => second.take(1)).toThrow(ImageBudgetError);
    expect(run.bytes).toBe(10);
  });
});

describe("a run whose images will not all fit", () => {
  it("renders every post while the budget holds them", async () => {
    const { download } = downloader();
    const outcome = await renderPosts(
      [
        source("a", [imageBlock(sized("a", 400))]),
        source("b", [imageBlock(sized("b", 400))]),
        source("c", [imageBlock(sized("c", 200))]),
      ],
      download,
      [],
      budget(1000),
    );

    expect(outcome.rendered.map((post) => post.slug)).toEqual(["a", "b", "c"]);
    expect(outcome.failures).toEqual([]);
    expect([...outcome.images.values()].reduce((n, b) => n + b.byteLength, 0)).toBe(
      1000,
    );
  });

  it("fails the post that crosses the line and nothing else", async () => {
    const { download } = downloader();
    const outcome = await renderPosts(
      [
        source("first", [imageBlock(sized("first", 600))]),
        source("heavy", [imageBlock(sized("heavy", 600))]),
        source("small", [imageBlock(sized("small", 300))]),
        source("wordy"),
      ],
      download,
      [],
      budget(1000),
    );

    expect(outcome.rendered.map((post) => post.slug)).toEqual([
      "first",
      "small",
      "wordy",
    ]);
    expect(outcome.failures.map((failure) => failure.slug)).toEqual(["heavy"]);
    expect(outcome.failures[0].message).toMatch(/image/i);
  });

  it("gives the failed post's bytes back, so the next one still fits", async () => {
    const { download } = downloader();
    const outcome = await renderPosts(
      [
        // Two images: the first fits, the second does not, and the post fails.
        source("heavy", [
          imageBlock(sized("h1", 600)),
          imageBlock(sized("h2", 600)),
        ]),
        source("later", [imageBlock(sized("later", 900))]),
      ],
      download,
      [],
      budget(1000),
    );

    expect(outcome.failures.map((failure) => failure.slug)).toEqual(["heavy"]);
    expect(outcome.rendered.map((post) => post.slug)).toEqual(["later"]);
    // Only the surviving post's image is held.
    expect([...outcome.images.keys()]).toEqual([
      expect.stringContaining("public/images/blog/later/"),
    ]);
  });

  it("gives them back when the post fails for any other reason too", async () => {
    const attempted: string[] = [];
    const download = async (url: string) => {
      attempted.push(url);
      if (url.includes("broken")) throw new Error("image download failed: 403");
      const size = Number(new URL(url).searchParams.get("size") ?? "1");
      return {
        bytes: filler(size, url),
        contentType: "image/png",
        format: "png" as const,
      };
    };

    const outcome = await renderPosts(
      [
        source("half", [
          imageBlock(sized("ok", 900)),
          imageBlock(sized("broken", 10)),
        ]),
        source("next", [imageBlock(sized("next", 900))]),
      ],
      download,
      [],
      budget(1000),
    );

    expect(outcome.failures.map((failure) => failure.slug)).toEqual(["half"]);
    expect(outcome.rendered.map((post) => post.slug)).toEqual(["next"]);
  });

  it("counts one image twice in a post once, because one file is written", async () => {
    const { download } = downloader();
    const url = sized("same", 600);
    const outcome = await renderPosts(
      [source("twice", [imageBlock(url), imageBlock(url)])],
      download,
      [],
      budget(1000),
    );

    expect(outcome.failures).toEqual([]);
    expect(outcome.images.size).toBe(1);
  });

  it("refuses on the file count as well as on the bytes", async () => {
    const { download } = downloader();
    const outcome = await renderPosts(
      [
        source("a", [imageBlock(sized("a1", 1)), imageBlock(sized("a2", 1))]),
        source("b", [imageBlock(sized("b1", 1))]),
      ],
      download,
      [],
      new ImageBudget({ maxBytes: 1_000_000, maxCount: 2 }),
    );

    expect(outcome.rendered.map((post) => post.slug)).toEqual(["a"]);
    expect(outcome.failures.map((failure) => failure.slug)).toEqual(["b"]);
  });

  it("keeps a post whose only remaining image is one it already holds", async () => {
    const { download } = downloader();
    const url = sized("same", 10);
    const outcome = await renderPosts(
      [
        source("first", [imageBlock(sized("first", 10))]),
        // Two references to one image: one file, so one slot, and the run has
        // exactly one left.
        source("twice", [imageBlock(url), imageBlock(url)]),
      ],
      download,
      [],
      new ImageBudget({ maxBytes: 1_000_000, maxCount: 2 }),
    );

    expect(outcome.failures).toEqual([]);
    expect(outcome.rendered.map((post) => post.slug)).toEqual([
      "first",
      "twice",
    ]);
    expect(outcome.images.size).toBe(2);
  });

  it("does not fetch an image there is no room to keep", async () => {
    const { attempted, download } = downloader();
    await renderPosts(
      [
        source("a", [imageBlock(sized("a1", 1))]),
        source("b", [imageBlock(sized("b1", 1))]),
      ],
      download,
      [],
      new ImageBudget({ maxBytes: 1_000_000, maxCount: 1 }),
    );

    expect(attempted).toEqual([sized("a1", 1)]);
  });

  it("lets a run with no budget of its own use the documented one", async () => {
    const { download } = downloader();
    const outcome = await renderPosts(
      [source("a", [imageBlock(sized("a", 1024))])],
      download,
    );

    expect(outcome.failures).toEqual([]);
    expect(outcome.rendered.map((post) => post.slug)).toEqual(["a"]);
  });

  it("says the same thing twice over, given the same posts", async () => {
    const posts = [
      source("first", [imageBlock(sized("first", 600))]),
      source("heavy", [imageBlock(sized("heavy", 600))]),
      source("small", [imageBlock(sized("small", 300))]),
    ];

    const one = await renderPosts(posts, downloader().download, [], budget(1000));
    const two = await renderPosts(posts, downloader().download, [], budget(1000));

    expect(one.rendered.map((post) => post.slug)).toEqual(
      two.rendered.map((post) => post.slug),
    );
    expect(one.failures.map((failure) => failure.slug)).toEqual(
      two.failures.map((failure) => failure.slug),
    );
    expect([...one.images.keys()].sort()).toEqual([...two.images.keys()].sort());
  });
});

// A post that could not be rendered is a post this run knows nothing about, so
// its file stays and every unclaimed file stays with it. Running out of memory
// budget must not read as "the author deleted half the blog".
describe("what a run that hit the budget does to the files on disk", () => {
  it("deletes nothing and keeps the failed post's file exactly as it was", async () => {
    const { download } = downloader();
    const outcome = await renderPosts(
      [
        source("first", [imageBlock(sized("first", 600))]),
        source("heavy", [imageBlock(sized("heavy", 600))]),
      ],
      download,
      [],
      budget(1000),
    );

    const existing = new Map([
      [postPath("heavy"), "the file already on disk"],
      [postPath("gone-from-notion"), "another file"],
    ]);
    const plan = planSync(outcome, existing);

    expect(plan.plan.delete).toEqual([]);
    expect(plan.preserved).toEqual(["heavy"]);
    expect(plan.desired.get(postPath("heavy"))).toBe("the file already on disk");
    expect(plan.desired.get(postPath("gone-from-notion"))).toBe("another file");
  });

  it("still writes the posts that did fit", async () => {
    const { download } = downloader();
    const outcome = await renderPosts(
      [
        source("first", [imageBlock(sized("first", 600))]),
        source("heavy", [imageBlock(sized("heavy", 600))]),
      ],
      download,
      [],
      budget(1000),
    );

    const plan = planSync(outcome, new Map());

    expect(plan.plan.write).toEqual([postPath("first")]);
    expect(plan.desired.get(postPath("first"))).toBe(
      serializePost(
        outcome.rendered[0].frontmatter,
        outcome.rendered[0].body,
      ),
    );
  });
});

// The shape of a real run: a blog of posts each carrying images that nearly
// fill the budget between them.
describe("a blog that only just fits", () => {
  it("keeps every post whose images the run can still hold", async () => {
    const { download } = downloader();
    const posts = Array.from({ length: 20 }, (_, i) =>
      source(`post-${String(i).padStart(2, "0")}`, [
        imageBlock(sized(`img-${i}`, 50)),
      ]),
    );

    const outcome = await renderPosts(posts, download, [], budget(20 * 50));

    expect(outcome.failures).toEqual([]);
    expect(outcome.images.size).toBe(20);
  });

  it("stops at the post that would go one byte over", async () => {
    const { download } = downloader();
    const posts = Array.from({ length: 20 }, (_, i) =>
      source(`post-${String(i).padStart(2, "0")}`, [
        imageBlock(sized(`img-${i}`, 50)),
      ]),
    );

    const outcome = await renderPosts(posts, download, [], budget(20 * 50 - 1));

    expect(outcome.failures.map((failure) => failure.slug)).toEqual(["post-19"]);
    expect(outcome.rendered).toHaveLength(19);
  });
});

// The number the ceiling has to be chosen against: everything a run is allowed
// to keep, plus the one image it has just read and is about to refuse.
describe("the peak a run can reach", () => {
  it("is the budget plus the one image being weighed", () => {
    expect(PEAK_RUN_IMAGE_BYTES).toBe(MAX_RUN_IMAGE_BYTES + MAX_IMAGE_BYTES);
  });
});
