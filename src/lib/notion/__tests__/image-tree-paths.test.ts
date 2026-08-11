import fs from "node:fs/promises";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import {
  applyImagePlan,
  inspectImageFiles,
  ImageTreeError,
  planImages,
  type ExistingImages,
} from "@/lib/notion/image-plan";
import { BLOG_IMAGE_ROOT, imageDir } from "@/lib/notion/images";

// The walk refused a symlink where an *image* should be, and opened every write
// with O_NOFOLLOW. Both of those check the last component of a path and nothing
// else — and a path is only as safe as the whole of it.
//
// `public/images/blog` is three directories deep, and the sync neither made nor
// checked any of them. A link at `public`, at `public/images`, or at the blog
// root itself sends the entire walk somewhere else: every file the run then
// "finds on disk" is a file outside the repo, every write lands there, and
// every orphan it decides to prune is deleted there. O_NOFOLLOW on the last
// component says nothing about that, because by the time it is applied the
// directory it is applied *in* is already the wrong one. The same holds one
// level lower: a post's directory swapped for a link between the plan and the
// write is a plan that writes a post's images wherever the link points.
//
// Node has no openat(2), so a descriptor-relative walk is not available: the
// strongest thing here is to check every component immediately before the
// operation it justifies, to refuse a link at any of them, to prove the
// resolved path still lands inside the repo, and to compare what was opened
// with what is at the path afterwards — refusing rather than guessing when the
// two disagree. Deletion is never recursive and never resolves a link.

const SCRATCH = path.join(process.cwd(), ".tmp-tests");

let root: string;
let outside: string;

const image = (slug: string, name: string) => `${imageDir(slug)}/${name}`;

const bytes = (value: string) => new TextEncoder().encode(value);

async function seed(files: Record<string, string>): Promise<void> {
  for (const [file, contents] of Object.entries(files)) {
    await fs.mkdir(path.join(root, path.dirname(file)), { recursive: true });
    await fs.writeFile(path.join(root, file), contents);
  }
}

// A directory outside the repo, holding a file the sync must never touch.
async function seedOutside(name: string, contents: string): Promise<string> {
  await fs.mkdir(outside, { recursive: true });
  const file = path.join(outside, name);
  await fs.writeFile(file, contents);
  return file;
}

// Replaces a repo-relative path with a symlink to `target`, whatever is there.
async function linkAt(relative: string, target: string): Promise<void> {
  const full = path.join(root, relative);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.rm(full, { recursive: true, force: true });
  await fs.symlink(target, full);
}

const read = (file: string) => fs.readFile(file, "utf8");
const exists = (file: string) =>
  fs
    .access(file)
    .then(() => true)
    .catch(() => false);

const planOf = (desired: Map<string, Uint8Array>, prunable: string[]) =>
  planImages(desired, new Map() as ExistingImages, prunable);

beforeEach(async () => {
  const id = `image-paths-${process.pid}-${Math.random().toString(36).slice(2)}`;
  root = path.join(SCRATCH, id, "repo");
  outside = path.join(SCRATCH, id, "outside");
  await fs.mkdir(root, { recursive: true });
  await fs.mkdir(outside, { recursive: true });
});

afterEach(async () => {
  await fs.rm(path.dirname(root), { recursive: true, force: true });
});

afterAll(async () => {
  await fs.rmdir(SCRATCH).catch(() => undefined);
});

// Every directory between the repo root and an image, one test each: the bug
// was that only the last name in a path was ever looked at.
const PARENTS = ["public", "public/images", BLOG_IMAGE_ROOT];

describe("a link anywhere above the images", () => {
  it.each(PARENTS)("stops the walk when %s is a symlink", async (parent) => {
    const planted = path.join(outside, "tree");
    await fs.mkdir(path.join(planted, "images/blog/a"), { recursive: true });
    await fs.writeFile(path.join(planted, "images/blog/a/one.png"), "OUTSIDE");
    // The link is planted at `parent`, pointing at whichever level of the
    // planted tree lines up with it.
    const depth = parent.split("/").length;
    const target = [planted, "images", "blog"].slice(0, depth).join("/");
    await linkAt(parent, target);

    await expect(inspectImageFiles(root)).rejects.toBeInstanceOf(ImageTreeError);
  });

  it.each(PARENTS)("never reports a file behind a linked %s", async (parent) => {
    const planted = path.join(outside, "tree");
    await fs.mkdir(path.join(planted, "images/blog/a"), { recursive: true });
    await fs.writeFile(path.join(planted, "images/blog/a/one.png"), "OUTSIDE");
    const depth = parent.split("/").length;
    await linkAt(parent, [planted, "images", "blog"].slice(0, depth).join("/"));

    const found = await inspectImageFiles(root).catch(() => undefined);
    expect(found).toBeUndefined();
  });

  it.each(PARENTS)("writes nothing when %s is a symlink", async (parent) => {
    const planted = path.join(outside, "tree");
    await fs.mkdir(path.join(planted, "images/blog"), { recursive: true });
    const depth = parent.split("/").length;
    await linkAt(parent, [planted, "images", "blog"].slice(0, depth).join("/"));

    const desired = new Map([[image("a", "one.png"), bytes("INSIDE")]]);
    await expect(
      applyImagePlan(root, planOf(desired, [imageDir("a")]), desired),
    ).rejects.toBeInstanceOf(ImageTreeError);

    expect(await exists(path.join(planted, "images/blog/a/one.png"))).toBe(false);
  });

  it("refuses a dangling link where the image root should be", async () => {
    await linkAt(BLOG_IMAGE_ROOT, path.join(outside, "nothing-here"));

    await expect(inspectImageFiles(root)).rejects.toBeInstanceOf(ImageTreeError);
  });

  // A link that happens to point back inside the repo is still not a directory
  // this sync made, and following it is still following something.
  it("refuses a link into the repo just as firmly", async () => {
    await seed({ "public/real/one.png": "INSIDE" });
    await linkAt(BLOG_IMAGE_ROOT, path.join(root, "public/real"));

    await expect(inspectImageFiles(root)).rejects.toBeInstanceOf(ImageTreeError);
  });
});

describe("a post's directory that is a link", () => {
  it("is refused by the walk rather than read through", async () => {
    const planted = path.join(outside, "post");
    await fs.mkdir(planted, { recursive: true });
    await fs.writeFile(path.join(planted, "secret.png"), "OUTSIDE");
    await fs.mkdir(path.join(root, BLOG_IMAGE_ROOT), { recursive: true });
    await linkAt(imageDir("a"), planted);

    await expect(inspectImageFiles(root)).rejects.toBeInstanceOf(ImageTreeError);
  });

  it("is refused by the write rather than written through", async () => {
    const planted = path.join(outside, "post");
    await fs.mkdir(planted, { recursive: true });
    await fs.mkdir(path.join(root, BLOG_IMAGE_ROOT), { recursive: true });
    await linkAt(imageDir("a"), planted);

    const desired = new Map([[image("a", "one.png"), bytes("INSIDE")]]);
    await expect(
      applyImagePlan(root, planOf(desired, [imageDir("a")]), desired),
    ).rejects.toBeInstanceOf(ImageTreeError);

    expect(await exists(path.join(planted, "one.png"))).toBe(false);
  });

  // The plan is made against a tree that was real when it was walked. What the
  // write happens in is a different moment.
  it("is refused when it is swapped in after the plan was made", async () => {
    await seed({ [image("a", "old.png")]: "OLD" });
    const desired = new Map([[image("a", "one.png"), bytes("INSIDE")]]);
    const plan = planOf(desired, [imageDir("a")]);

    const planted = path.join(outside, "post");
    await fs.mkdir(planted, { recursive: true });
    await linkAt(imageDir("a"), planted);

    await expect(applyImagePlan(root, plan, desired)).rejects.toBeInstanceOf(
      ImageTreeError,
    );
    expect(await exists(path.join(planted, "one.png"))).toBe(false);
  });

  it("is refused when a parent above it is swapped in after the plan", async () => {
    await seed({ [image("a", "old.png")]: "OLD" });
    const desired = new Map([[image("a", "one.png"), bytes("INSIDE")]]);
    const plan = planOf(desired, [imageDir("a")]);

    const planted = path.join(outside, "images");
    await fs.mkdir(path.join(planted, "blog/a"), { recursive: true });
    await linkAt("public/images", planted);

    await expect(applyImagePlan(root, plan, desired)).rejects.toBeInstanceOf(
      ImageTreeError,
    );
    expect(await exists(path.join(planted, "blog/a/one.png"))).toBe(false);
  });
});

describe("deleting through a link", () => {
  it("refuses to remove a file whose directory became a link", async () => {
    await seed({ [image("a", "stale.png")]: "STALE" });
    const existing = await inspectImageFiles(root);
    const plan = planImages(new Map(), existing, [imageDir("a")]);
    expect(plan.delete).toEqual([image("a", "stale.png")]);

    const planted = path.join(outside, "post");
    await fs.mkdir(planted, { recursive: true });
    const victim = path.join(planted, "stale.png");
    await fs.writeFile(victim, "SOMEBODY ELSE'S");
    await linkAt(imageDir("a"), planted);

    await expect(
      applyImagePlan(root, plan, new Map()),
    ).rejects.toBeInstanceOf(ImageTreeError);
    expect(await read(victim)).toBe("SOMEBODY ELSE'S");
  });

  it("refuses to remove a file whose parent above it became a link", async () => {
    await seed({ [image("a", "stale.png")]: "STALE" });
    const existing = await inspectImageFiles(root);
    const plan = planImages(new Map(), existing, [imageDir("a")]);

    const planted = path.join(outside, "images");
    await fs.mkdir(path.join(planted, "blog/a"), { recursive: true });
    const victim = path.join(planted, "blog/a/stale.png");
    await fs.writeFile(victim, "SOMEBODY ELSE'S");
    await linkAt("public/images", planted);

    await expect(
      applyImagePlan(root, plan, new Map()),
    ).rejects.toBeInstanceOf(ImageTreeError);
    expect(await read(victim)).toBe("SOMEBODY ELSE'S");
  });

  // Tidying an emptied directory must never become "remove a tree somebody
  // else's link points at".
  it("never removes a directory through a link when tidying up", async () => {
    await seed({ [image("gone", "only.png")]: "X" });
    const existing = await inspectImageFiles(root);
    const plan = planImages(new Map(), existing, [imageDir("gone")]);

    const planted = path.join(outside, "keep-me");
    await fs.mkdir(planted, { recursive: true });
    await fs.writeFile(path.join(planted, "theirs.png"), "THEIRS");
    // The file this run planned to delete is already gone; what is left at that
    // path is a link to somebody else's directory.
    await linkAt(imageDir("gone"), planted);

    await applyImagePlan(root, plan, new Map()).catch(() => undefined);

    expect(await exists(planted)).toBe(true);
    expect(await read(path.join(planted, "theirs.png"))).toBe("THEIRS");
  });
});

// The whole point of the checks above, stated once as the property they exist
// to hold: nothing this sync does can put a byte outside the repo.
describe("what a run can reach", () => {
  it("refuses a path that climbs out of the tree it names", async () => {
    const victim = await seedOutside("victim.png", "OUTSIDE");
    const escaping = `${BLOG_IMAGE_ROOT}/../../../outside/victim.png`;
    const desired = new Map([[escaping, bytes("INSIDE")]]);

    await expect(
      applyImagePlan(
        root,
        { write: [escaping], delete: [], unchanged: [] },
        desired,
      ),
    ).rejects.toBeInstanceOf(ImageTreeError);
    await expect(
      applyImagePlan(root, { write: [], delete: [escaping], unchanged: [] }, new Map()),
    ).rejects.toBeInstanceOf(ImageTreeError);

    expect(await read(victim)).toBe("OUTSIDE");
  });

  it("refuses to delete a file that became a link after the plan", async () => {
    await seed({ [image("a", "stale.png")]: "STALE" });
    const plan = planImages(new Map(), await inspectImageFiles(root), [
      imageDir("a"),
    ]);
    const victim = await seedOutside("victim.png", "OUTSIDE");
    await linkAt(image("a", "stale.png"), victim);

    await expect(applyImagePlan(root, plan, new Map())).rejects.toBeInstanceOf(
      ImageTreeError,
    );
    expect(await read(victim)).toBe("OUTSIDE");
  });

  it("writes nothing outside the repo, whatever is planted in the tree", async () => {
    const untouched = await seedOutside("untouched.png", "OUTSIDE");
    const planted = path.join(outside, "post");
    await fs.mkdir(planted, { recursive: true });

    const attempts: Array<[string, string]> = [
      ["public", path.join(outside, "public")],
      ["public/images", path.join(outside, "images")],
      [BLOG_IMAGE_ROOT, planted],
      [imageDir("a"), planted],
    ];

    for (const [where, target] of attempts) {
      await fs.rm(path.join(root, "public"), { recursive: true, force: true });
      await fs.mkdir(target, { recursive: true });
      await linkAt(where, target);

      const desired = new Map([[image("a", "one.png"), bytes("INSIDE")]]);
      await expect(
        applyImagePlan(root, planOf(desired, [imageDir("a")]), desired),
      ).rejects.toBeInstanceOf(ImageTreeError);
    }

    expect(await read(untouched)).toBe("OUTSIDE");
    const strays: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(full);
        else if (entry.name === "one.png") strays.push(full);
      }
    };
    await walk(outside);
    expect(strays).toEqual([]);
  });
});

// None of the above may cost the ordinary case anything.
describe("an ordinary tree", () => {
  it("creates every missing directory and writes the images", async () => {
    const desired = new Map([
      [image("a", "one.png"), bytes("ONE")],
      [image("b", "two.png"), bytes("TWO")],
    ]);

    await applyImagePlan(
      root,
      planOf(desired, [imageDir("a"), imageDir("b")]),
      desired,
    );

    expect(await read(path.join(root, image("a", "one.png")))).toBe("ONE");
    expect(await read(path.join(root, image("b", "two.png")))).toBe("TWO");
    for (const parent of PARENTS) {
      const stats = await fs.lstat(path.join(root, parent));
      expect(stats.isSymbolicLink()).toBe(false);
      expect(stats.isDirectory()).toBe(true);
    }
  });

  it("walks, plans, applies and comes back with nothing left to do", async () => {
    await seed({
      [image("a", "keep.png")]: "KEEP",
      [image("a", "stale.png")]: "STALE",
    });
    const desired = new Map([[image("a", "keep.png"), bytes("KEEP")]]);

    const plan = planImages(
      desired,
      await inspectImageFiles(root),
      [imageDir("a")],
    );
    expect(plan.unchanged).toEqual([image("a", "keep.png")]);
    expect(plan.delete).toEqual([image("a", "stale.png")]);

    await applyImagePlan(root, plan, desired);

    const after = planImages(desired, await inspectImageFiles(root), [
      imageDir("a"),
    ]);
    expect(after.write).toEqual([]);
    expect(after.delete).toEqual([]);
  });

  it("removes a directory its last image left, without following anything", async () => {
    await seed({ [image("gone", "only.png")]: "X" });
    const plan = planImages(new Map(), await inspectImageFiles(root), [
      imageDir("gone"),
    ]);

    await applyImagePlan(root, plan, new Map());

    expect(await exists(path.join(root, imageDir("gone")))).toBe(false);
    expect(await exists(path.join(root, BLOG_IMAGE_ROOT))).toBe(true);
  });
});
