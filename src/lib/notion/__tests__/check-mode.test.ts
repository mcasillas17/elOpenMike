import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  checkVerdict,
  planSync,
  pendingOperations,
  prunableImageDirs,
  renderPosts,
} from "@/lib/notion/sync";
import { planImages } from "@/lib/notion/image-plan";
import { postPath } from "@/lib/notion/plan";
import { serializePost } from "@/lib/notion/serialize";
import { imageDir } from "@/lib/notion/images";
import type { MdBlock, PostSource } from "@/lib/notion/types";
import { block, rt } from "./fixtures/blocks";

// `pnpm sync:notion --check` is the question "is what is on disk what Notion
// says?", and CI answers it by its exit code.
//
// A post that fails — an image whose signed url expired, a page that changed
// under the run, a host the sync refuses — is deliberately not fatal to a normal
// run: the file already on disk is kept, the other posts sync, and the job
// commits them. But planSync keeps that file by copying it into the *desired*
// set verbatim, which is exactly what "nothing to do" looks like. So `--check`
// printed "✓ in sync" and exited 0 on a run that had failed to read half the
// blog: a Notion outage, an expired token, a rate limit, all reported as
// verified.
//
// A check that could not look is not a check that passed. Failures make the
// verdict fail whether or not anything on disk would change, and the normal run
// is untouched — it still isolates the failure and still commits the posts that
// did sync.

const bytes = (value: string) => new TextEncoder().encode(value);

const failure = (slug: string, message = `image download failed: 403 ${slug}`) => ({
  slug,
  pageId: `page-${slug}`,
  message,
});

describe("checkVerdict", () => {
  it("passes a run with nothing to do and nothing that failed", () => {
    const verdict = checkVerdict([], []);

    expect(verdict.ok).toBe(true);
    expect(verdict.exitCode).toBe(0);
    expect(verdict.lines.join("\n")).toMatch(/in sync/);
  });

  it("fails on drift, naming the files", () => {
    const verdict = checkVerdict(
      ["content/blog/a.mdx", "public/images/blog/a/1.png"],
      [],
    );

    expect(verdict.ok).toBe(false);
    expect(verdict.exitCode).toBe(1);
    expect(verdict.lines.join("\n")).toMatch(/content\/blog\/a\.mdx/);
    expect(verdict.lines.join("\n")).toMatch(/public\/images\/blog\/a\/1\.png/);
  });

  // The hole: nothing would change on disk precisely *because* the failed
  // post's file was carried over untouched.
  it("fails on a failure even when no file would change", () => {
    const verdict = checkVerdict([], [failure("broken")]);

    expect(verdict.ok).toBe(false);
    expect(verdict.exitCode).toBe(1);
    expect(verdict.lines.join("\n")).toMatch(/broken/);
    expect(verdict.lines.join("\n")).not.toMatch(/in sync/);
  });

  it("reports both when a run failed and would also change files", () => {
    const verdict = checkVerdict(["content/blog/a.mdx"], [failure("broken")]);

    expect(verdict.ok).toBe(false);
    expect(verdict.exitCode).toBe(1);
    expect(verdict.lines.join("\n")).toMatch(/broken/);
    expect(verdict.lines.join("\n")).toMatch(/content\/blog\/a\.mdx/);
  });

  it("names every failed post, in a stable order", () => {
    const verdict = checkVerdict([], [failure("zeta"), failure("alpha")]);

    const text = verdict.lines.join("\n");
    expect(text.indexOf("alpha")).toBeLessThan(text.indexOf("zeta"));
  });

  it("says why a failure means the answer is unknown rather than no", () => {
    const verdict = checkVerdict([], [failure("broken")]);

    expect(verdict.lines.join("\n")).toMatch(/could not|unverified|cannot/i);
  });
});

// The same objects the script runs, wired the same way: render, plan, plan the
// images, ask for the verdict.
function check(
  sources: PostSource[],
  existing: Map<string, string>,
  onDisk: Map<string, Uint8Array>,
  download: (url: string) => Promise<{ bytes: Uint8Array; contentType: string }>,
) {
  return renderPosts(sources, download).then((rendered) => {
    const syncPlan = planSync(rendered, existing);
    const images = planImages(
      rendered.images,
      onDisk,
      prunableImageDirs(rendered, syncPlan),
    );
    const pending = pendingOperations(syncPlan.plan, images);
    return {
      pending,
      plan: syncPlan.plan,
      verdict: checkVerdict(pending, rendered.failures),
    };
  });
}

const imageBlock = (url: string): MdBlock =>
  block("image", { type: "file", file: { url }, caption: [rt("Alt")] });

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

const downloader = async (url: string) => {
  if (url.includes("fail")) throw new Error(`image download failed: 403 ${url}`);
  return { bytes: bytes(url), contentType: "image/png" };
};

// What the post's file looks like on disk once it has synced cleanly.
const fileFor = (slug: string) =>
  serializePost(source(slug).frontmatter, `Body of ${slug}.\n`);

describe("a --check run over a blog that failed to read", () => {
  it("fails even though not one file would change", async () => {
    const existing = new Map([
      [postPath("broken"), fileFor("broken")],
      [postPath("fine"), fileFor("fine")],
    ]);
    const onDisk = new Map([
      [`${imageDir("broken")}/kept.png`, bytes("kept")],
    ]);

    const { pending, verdict } = await check(
      [source("fine"), source("broken", [imageBlock("https://img/fail.png")])],
      existing,
      onDisk,
      downloader,
    );

    // The whole trap: the failed post's file was carried over verbatim, so
    // there is nothing at all to do.
    expect(pending).toEqual([]);
    expect(verdict.ok).toBe(false);
    expect(verdict.exitCode).toBe(1);
    expect(verdict.lines.join("\n")).toMatch(/broken/);
  });

  it("fails, and says both things, when a file would change too", async () => {
    const existing = new Map([[postPath("broken"), fileFor("broken")]]);

    const { pending, verdict } = await check(
      [source("fine"), source("broken", [imageBlock("https://img/fail.png")])],
      existing,
      new Map(),
      downloader,
    );

    expect(pending).toContain(postPath("fine"));
    expect(verdict.exitCode).toBe(1);
    expect(verdict.lines.join("\n")).toMatch(/broken/);
    expect(verdict.lines.join("\n")).toMatch(/content\/blog\/fine\.mdx/);
  });

  it("passes a clean run whose disk already matches Notion", async () => {
    const existing = new Map([
      [postPath("one"), fileFor("one")],
      [postPath("two"), fileFor("two")],
    ]);

    const { pending, verdict } = await check(
      [source("one"), source("two")],
      existing,
      new Map(),
      downloader,
    );

    expect(pending).toEqual([]);
    expect(verdict.ok).toBe(true);
    expect(verdict.exitCode).toBe(0);
  });

  it("still fails a clean-but-drifted run, as it always did", async () => {
    const { verdict } = await check(
      [source("one")],
      new Map(),
      new Map(),
      downloader,
    );

    expect(verdict.ok).toBe(false);
    expect(verdict.lines.join("\n")).toMatch(/content\/blog\/one\.mdx/);
  });
});

// A normal run is not a verification: a failed post must not stop the posts
// that did sync from being written and committed.
describe("what a normal run still does with the same failure", () => {
  it("writes the posts that synced and keeps the file of the one that did not", async () => {
    const existing = new Map([[postPath("broken"), fileFor("broken")]]);

    const rendered = await renderPosts(
      [source("fine"), source("broken", [imageBlock("https://img/fail.png")])],
      downloader,
    );
    const { plan, preserved } = planSync(rendered, existing);

    expect(rendered.rendered.map((post) => post.slug)).toEqual(["fine"]);
    expect(plan.write).toEqual([postPath("fine")]);
    expect(plan.delete).toEqual([]);
    expect(preserved).toEqual(["broken"]);
  });
});

// The verdict only matters if the script asks for it.
describe("what the sync script is wired to", () => {
  const script = fs.readFileSync(
    path.join(process.cwd(), "scripts", "sync-notion.ts"),
    "utf8",
  );

  it("asks checkVerdict for its --check answer, and exits on it", () => {
    expect(script).toMatch(/checkVerdict\(/);
    expect(script).toMatch(/process\.exit\(verdict\.exitCode\)/);
  });

  it("no longer decides --check on the pending list alone", () => {
    expect(script).not.toMatch(/process\.exit\(pending\.length === 0 \? 0 : 1\)/);
  });

  it("leaves the normal run's exit code alone", () => {
    // Everything after the --check block and before the crash handler: the
    // writing path, which still ends by returning normally so the posts that
    // did sync are committed.
    const writing = script.slice(
      script.indexOf("await fs.mkdir(BLOG_DIR"),
      script.indexOf("main().catch"),
    );

    expect(writing).not.toBe("");
    expect(writing).not.toMatch(/process\.exit/);
  });
});
