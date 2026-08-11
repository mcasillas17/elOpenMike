import fs from "node:fs/promises";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";

// The same tree, on a platform that has neither O_NOFOLLOW nor O_DIRECTORY.
//
// Windows has neither, and opening a directory there fails outright, so the
// flags that make an *open* refuse a link are simply not available: what stands
// is the lstat of every component, and the comparison of what was opened with
// what is at that name afterwards. That fallback is the half of this that is
// never exercised on the machines this repo is developed and built on, which is
// exactly why it is worth a test — a check that only works where it was written
// is not a check.
vi.mock("node:fs", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs")>();
  const constants = { ...real.constants, O_NOFOLLOW: 0, O_DIRECTORY: 0 };
  return { ...real, constants, default: { ...real, constants } };
});

const { applyImagePlan, inspectImageFiles, ImageTreeError, planImages } =
  await import("@/lib/notion/image-plan");
const { BLOG_IMAGE_ROOT, imageDir } = await import("@/lib/notion/images");

const SCRATCH = path.join(process.cwd(), ".tmp-tests");

let root: string;
let outside: string;

const image = (slug: string, name: string) => `${imageDir(slug)}/${name}`;
const bytes = (value: string) => new TextEncoder().encode(value);

async function linkAt(relative: string, target: string): Promise<void> {
  const full = path.join(root, relative);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.rm(full, { recursive: true, force: true });
  await fs.symlink(target, full);
}

const read = (file: string) => fs.readFile(file, "utf8");

beforeEach(async () => {
  const id = `image-nofollowless-${process.pid}-${Math.random().toString(36).slice(2)}`;
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

describe("without the no-follow flags", () => {
  it("really is running without them", async () => {
    const { constants } = await import("node:fs");
    expect(constants.O_NOFOLLOW).toBe(0);
    expect(constants.O_DIRECTORY).toBe(0);
  });

  it("still refuses a linked image root", async () => {
    const planted = path.join(outside, "blog");
    await fs.mkdir(path.join(planted, "a"), { recursive: true });
    await fs.writeFile(path.join(planted, "a/one.png"), "OUTSIDE");
    await linkAt(BLOG_IMAGE_ROOT, planted);

    await expect(inspectImageFiles(root)).rejects.toBeInstanceOf(ImageTreeError);
  });

  it("still refuses a linked post directory", async () => {
    const planted = path.join(outside, "post");
    await fs.mkdir(planted, { recursive: true });
    await fs.writeFile(path.join(planted, "one.png"), "OUTSIDE");
    await fs.mkdir(path.join(root, BLOG_IMAGE_ROOT), { recursive: true });
    await linkAt(imageDir("a"), planted);

    await expect(inspectImageFiles(root)).rejects.toBeInstanceOf(ImageTreeError);
  });

  // The open itself would follow the link here, so what refuses it is the lstat
  // the walk makes of every name before it touches it — the check that has to
  // stand on a platform whose flags cannot.
  it("still refuses to read a linked image", async () => {
    const target = path.join(outside, "secret.png");
    await fs.writeFile(target, "OUTSIDE");
    await fs.mkdir(path.join(root, imageDir("a")), { recursive: true });
    await linkAt(image("a", "one.png"), target);

    const failure = await inspectImageFiles(root).then(
      () => undefined,
      (error: unknown) => error as InstanceType<typeof ImageTreeError>,
    );

    expect(failure).toBeInstanceOf(ImageTreeError);
    expect(failure?.reason).toBe("not-a-regular-file");
  });

  it("still refuses to write through a linked image", async () => {
    const target = path.join(outside, "victim.png");
    await fs.writeFile(target, "OUTSIDE");
    await fs.mkdir(path.join(root, imageDir("a")), { recursive: true });
    await linkAt(image("a", "one.png"), target);

    const desired = new Map([[image("a", "one.png"), bytes("INSIDE")]]);
    await expect(
      applyImagePlan(
        root,
        { write: [image("a", "one.png")], delete: [], unchanged: [] },
        desired,
      ),
    ).rejects.toBeInstanceOf(ImageTreeError);
    expect(await read(target)).toBe("OUTSIDE");
  });

  it("still writes and reads an ordinary tree", async () => {
    const desired = new Map([[image("a", "one.png"), bytes("ONE")]]);
    await applyImagePlan(
      root,
      planImages(desired, new Map(), [imageDir("a")]),
      desired,
    );

    expect(await read(path.join(root, image("a", "one.png")))).toBe("ONE");
    expect([...(await inspectImageFiles(root)).keys()]).toEqual([
      image("a", "one.png"),
    ]);
  });
});
