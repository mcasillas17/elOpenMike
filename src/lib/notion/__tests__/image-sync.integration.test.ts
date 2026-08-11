import fs from "node:fs/promises";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import {
  imageMetadata,
  planImages,
  inspectImageFiles,
  applyImagePlan,
} from "@/lib/notion/image-plan";
import {
  planSync,
  prunableImageDirs,
  pendingOperations,
  type RenderOutcome,
} from "@/lib/notion/sync";
import { desiredFiles, postPath, type RenderedPost } from "@/lib/notion/plan";
import { imageDir } from "@/lib/notion/images";

// Runs the image half of the sync against a real directory tree: the planning
// and the writing are the same objects the script uses, so a divergence between
// what `--check` reports and what a run does would fail here.

const bytes = (value: string) => new TextEncoder().encode(value);

const SCRATCH = path.join(process.cwd(), ".tmp-tests");

let root: string;

const post = (slug: string): RenderedPost => ({
  pageId: `page-${slug}`,
  slug,
  frontmatter: {
    title: `Title ${slug}`,
    date: "2026-05-20",
    excerpt: `Excerpt ${slug}`,
    tags: ["AI"],
    updated: "2026-05-20",
  },
  body: `Body of ${slug}.\n`,
});

const image = (slug: string, name: string) => `${imageDir(slug)}/${name}`;

async function seed(files: Record<string, string>): Promise<void> {
  for (const [file, contents] of Object.entries(files)) {
    await fs.mkdir(path.join(root, path.dirname(file)), { recursive: true });
    await fs.writeFile(path.join(root, file), contents);
  }
}

const read = (file: string) => fs.readFile(path.join(root, file), "utf8");
const exists = (file: string) =>
  fs
    .access(path.join(root, file))
    .then(() => true)
    .catch(() => false);

beforeEach(async () => {
  root = path.join(
    SCRATCH,
    `image-sync-${process.pid}-${Math.random().toString(36).slice(2)}`,
  );
  await fs.mkdir(root, { recursive: true });
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

// Leave nothing behind in the repo. rmdir fails while another file's tree is
// still there, which is the right answer.
afterAll(async () => {
  await fs.rmdir(SCRATCH).catch(() => undefined);
});

describe("image reconciliation against a real tree", () => {
  // Every case at once, because they interact: pruning `kept` while `failed`
  // is protected is the whole point.
  const rendered = [post("kept"), post("changed")];
  const outcome = (): RenderOutcome => ({
    rendered,
    images: new Map([
      [image("kept", "same.png"), bytes("SAME")],
      [image("kept", "new.png"), bytes("NEW")],
      [image("changed", "img.png"), bytes("FRESH")],
    ]),
    warnings: [],
    failures: [
      { slug: "failed", pageId: "page-failed", message: "image download failed" },
    ],
  });

  // MDX deliberately already in sync, so the only drift is in the images.
  const existingMdx = () =>
    new Map([
      ...desiredFiles(rendered, new Map()),
      [postPath("failed"), "---\ntitle: \"Failed\"\n---\n\nOld.\n"],
    ]);

  const seedImages = () =>
    seed({
      [image("kept", "same.png")]: "SAME",
      [image("kept", "stale.png")]: "ORPHAN",
      [image("changed", "img.png")]: "CORRUPT",
      [image("failed", "kept.png")]: "PRESERVED",
    });

  async function plan() {
    const result = outcome();
    const sync = planSync(result, existingMdx());
    const images = planImages(
      result.images,
      await inspectImageFiles(root),
      prunableImageDirs(result, sync),
    );
    return { result, sync, images };
  }

  it("plans the missing, changed, orphan, and identical images", async () => {
    await seedImages();
    const { images } = await plan();

    expect(images.write).toEqual([
      image("changed", "img.png"),
      image("kept", "new.png"),
    ]);
    expect(images.delete).toEqual([image("kept", "stale.png")]);
    expect(images.unchanged).toEqual([image("kept", "same.png")]);
  });

  it("never flags or prunes the failed post's directory", async () => {
    await seedImages();
    const { images } = await plan();

    const touched = [...images.write, ...images.delete, ...images.unchanged];
    expect(touched.some((file) => file.startsWith(imageDir("failed")))).toBe(
      false,
    );
  });

  // The bug: MDX was in sync, so `--check` said "in sync" and exited 0 while a
  // real run went on to write two images and delete a third.
  it("reports drift in check mode when only the images changed", async () => {
    await seedImages();
    const { sync, images } = await plan();

    expect(sync.plan.write).toEqual([]);
    expect(sync.plan.delete).toEqual([]);
    expect(pendingOperations(sync.plan, images)).toEqual([
      image("changed", "img.png"),
      image("kept", "new.png"),
      image("kept", "stale.png"),
    ]);
  });

  it("applies exactly what it planned, and then reports nothing to do", async () => {
    await seedImages();
    const first = await plan();
    await applyImagePlan(root, first.images, first.result.images);

    expect(await read(image("kept", "new.png"))).toBe("NEW");
    expect(await read(image("changed", "img.png"))).toBe("FRESH");
    expect(await read(image("kept", "same.png"))).toBe("SAME");
    expect(await exists(image("kept", "stale.png"))).toBe(false);
    // The failed post's images are still there for the file left on disk.
    expect(await read(image("failed", "kept.png"))).toBe("PRESERVED");

    const second = await plan();
    expect(second.images.write).toEqual([]);
    expect(second.images.delete).toEqual([]);
    expect(pendingOperations(second.sync.plan, second.images)).toEqual([]);
  });

  it("writes a post's images into a directory that does not exist yet", async () => {
    const { result, sync } = await plan();
    const images = planImages(
      result.images,
      await inspectImageFiles(root),
      prunableImageDirs(result, sync),
    );

    expect(images.write).toHaveLength(3);
    await applyImagePlan(root, images, result.images);
    expect(await read(image("kept", "same.png"))).toBe("SAME");
  });

  it("removes a directory its last image just left", async () => {
    await seed({ [image("gone", "only.png")]: "X" });
    const existing = await inspectImageFiles(root);

    const plan = planImages(new Map(), existing, [imageDir("gone")]);
    expect(plan.delete).toEqual([image("gone", "only.png")]);

    await applyImagePlan(root, plan, new Map());
    expect(await exists(imageDir("gone"))).toBe(false);
  });
});

describe("inspectImageFiles", () => {
  it("returns nothing when the blog has no images yet", async () => {
    expect(await inspectImageFiles(root)).toEqual(new Map());
  });

  it("describes every post directory, keyed by repo-relative path", async () => {
    await seed({
      [image("b", "two.png")]: "TWO",
      [image("a", "one.png")]: "ONE",
    });

    const files = await inspectImageFiles(root);
    expect([...files.keys()]).toEqual([image("a", "one.png"), image("b", "two.png")]);
    // A length and a digest, which is everything the plan asks of a file — and
    // no part of what is inside it.
    expect(files.get(image("a", "one.png"))).toEqual(imageMetadata(bytes("ONE")));
  });

  it("ignores a stray file sitting where a post directory should be", async () => {
    await seed({ "public/images/blog/loose.png": "X" });
    expect(await inspectImageFiles(root)).toEqual(new Map());
  });
});
