import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import {
  applyImagePlan,
  inspectImageFiles,
  ImageTreeError,
  planImages,
  type ExistingImages,
} from "@/lib/notion/image-plan";
import { digestBytes } from "@/lib/notion/image-digest";
import { imageDir, imageFileName } from "@/lib/notion/images";

// The sync used to read every image already on disk into memory, in full, to
// compare it with the images it had just downloaded — `readImageFiles` returned
// `Map<string, Uint8Array>`, and every entry stayed reachable until the plan was
// applied. So the run's peak was the downloaded images *plus the whole of
// public/images/blog*: a blog whose images weigh 300 MB spent 300 MB proving
// that none of them had changed. image-budget.ts put a ceiling on the half of
// that the run downloads; this half had none at all, and the way it ends is not
// an error message but a killed process.
//
// Nothing about a file's *bytes* is needed to plan it, though — only whether
// they are the bytes in hand. So a file is opened, read through one small
// buffer, and reduced to what the plan actually uses: its size and its digest.
// Nothing keeps a body.

const SCRATCH = path.join(process.cwd(), ".tmp-tests");
const MIB = 1024 * 1024;

let root: string;

const image = (slug: string, name: string) => `${imageDir(slug)}/${name}`;

async function write(file: string, bytes: Uint8Array): Promise<void> {
  await fs.mkdir(path.join(root, path.dirname(file)), { recursive: true });
  await fs.writeFile(path.join(root, file), bytes);
}

// A megabyte whose contents depend on which file it is, so no two files share a
// digest by accident.
function filler(seed: number, size = MIB): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.fill(seed % 251);
  bytes[0] = seed & 0xff;
  bytes[1] = (seed >> 8) & 0xff;
  return bytes;
}

// What a run holds is measured in a process of its own, under `--expose-gc`:
// inside a vitest worker `process.memoryUsage()` does not see a Buffer — 64 MiB
// read into a live Map there reports under two megabytes of `arrayBuffers` —
// so a budget asserted from in here would pass whatever the code did. The
// helper measures the old implementation too, as a control, so this test can
// tell "nothing is retained" from "nothing is measured". See
// fixtures/measure-image-memory.ts.
const run = promisify(execFile);
const MEASURE = path.join(
  process.cwd(),
  "src/lib/notion/__tests__/fixtures/measure-image-memory.ts",
);

type Measurement = {
  mode: string;
  retained: number;
  files: number;
  bytes: number;
  unchanged?: number;
  write?: number;
  delete?: number;
};

async function measure(mode: "naive" | "run", size: number): Promise<Measurement> {
  const { stdout } = await run(
    process.execPath,
    ["--expose-gc", "--import", "tsx", MEASURE, root, mode, String(size)],
    { cwd: process.cwd(), maxBuffer: 4 * MIB },
  );
  return JSON.parse(stdout.trim().split("\n").pop() ?? "{}") as Measurement;
}

// Anything in a value that is a body: a typed array, a Buffer, an ArrayBuffer,
// or a string long enough to be one.
function bodyBytesIn(value: unknown, seen = new Set<unknown>()): number {
  if (value === null || typeof value !== "object") return 0;
  if (seen.has(value)) return 0;
  seen.add(value);
  if (ArrayBuffer.isView(value)) return value.byteLength;
  if (value instanceof ArrayBuffer) return value.byteLength;
  if (value instanceof Map) {
    let total = 0;
    for (const [key, entry] of value) {
      total += bodyBytesIn(key, seen) + bodyBytesIn(entry, seen);
    }
    return total;
  }
  let total = 0;
  for (const entry of Object.values(value)) total += bodyBytesIn(entry, seen);
  return total;
}

beforeEach(async () => {
  root = path.join(
    SCRATCH,
    `image-memory-${process.pid}-${Math.random().toString(36).slice(2)}`,
  );
  await fs.mkdir(root, { recursive: true });
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

afterAll(async () => {
  await fs.rmdir(SCRATCH).catch(() => undefined);
});

describe("what inspecting the tree keeps", () => {
  it("answers with a size and a digest, and no bytes at all", async () => {
    const bytes = filler(7, 4096);
    await write(image("a", "one.png"), bytes);

    const existing = await inspectImageFiles(root);

    expect([...existing.keys()]).toEqual([image("a", "one.png")]);
    expect(existing.get(image("a", "one.png"))).toEqual({
      size: bytes.byteLength,
      digest: digestBytes(bytes),
    });
    // Nothing anywhere in the answer is a body.
    expect(bodyBytesIn(existing)).toBe(0);
  });

  it("holds a description of a large tree, not the tree", async () => {
    const files = 64;
    for (let i = 0; i < files; i++) {
      await write(image(`post-${String(i).padStart(3, "0")}`, "big.png"), filler(i));
    }

    const existing = await inspectImageFiles(root);

    expect(existing.size).toBe(files);
    // Sixty-four megabytes on disk; two fields per file in hand.
    expect(bodyBytesIn(existing)).toBe(0);
    for (const entry of existing.values()) {
      expect(Object.keys(entry).sort()).toEqual(["digest", "size"]);
      expect(entry.size).toBe(MIB);
      expect(entry.digest).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("walks it in one deterministic order, whatever the filesystem says", async () => {
    for (const slug of ["c", "a", "b"]) {
      for (const name of ["z.png", "m.png", "a.png"]) {
        await write(image(slug, name), filler(slug.charCodeAt(0), 32));
      }
    }

    const first = [...(await inspectImageFiles(root)).keys()];
    const second = [...(await inspectImageFiles(root)).keys()];

    expect(first).toEqual([...first].sort());
    expect(second).toEqual(first);
  });

  it("names a file by the same digest the plan compares it with", async () => {
    const bytes = filler(3, 2048);
    const name = imageFileName(bytes, "png");
    await write(image("a", name), bytes);

    const existing = await inspectImageFiles(root);
    const onDisk = existing.get(image("a", name));

    expect(onDisk?.digest.startsWith(name.replace(/\.png$/, ""))).toBe(true);
    expect(planImages(new Map([[image("a", name), bytes]]), existing, [
      imageDir("a"),
    ])).toEqual({
      write: [],
      delete: [],
      unchanged: [image("a", name)],
    });
  });
});

describe("planning a whole run against a tree it never holds", () => {
  it("plans the changed, the identical, the orphan and the missing", async () => {
    for (let i = 0; i < 8; i++) {
      await write(image(`old-${i}`, "keep.png"), filler(i, 4096));
    }
    await write(image("fresh", "same.png"), filler(200, 4096));
    await write(image("fresh", "changed.png"), filler(201, 4096));
    await write(image("fresh", "orphan.png"), filler(202, 4096));

    const desired = new Map<string, Uint8Array>([
      [image("fresh", "same.png"), filler(200, 4096)],
      [image("fresh", "changed.png"), filler(203, 4096)],
      [image("fresh", "new.png"), filler(204, 4096)],
    ]);
    const existing = await inspectImageFiles(root);
    const plan = planImages(desired, existing, [imageDir("fresh")]);

    expect(plan.unchanged).toEqual([image("fresh", "same.png")]);
    expect(plan.write).toEqual([
      image("fresh", "changed.png"),
      image("fresh", "new.png"),
    ]);
    // A directory this run never rendered keeps everything it has.
    expect(plan.delete).toEqual([image("fresh", "orphan.png")]);
    expect(bodyBytesIn(existing)).toBe(0);

    await applyImagePlan(root, plan, desired);
    const afterApply = await inspectImageFiles(root);
    expect(planImages(desired, afterApply, [imageDir("fresh")])).toEqual({
      write: [],
      delete: [],
      unchanged: [...desired.keys()].sort(),
    });
  });

  // The measurement itself: a real process, a real collection, and the old
  // implementation measured beside the new one so "held nothing" cannot be
  // confused with "measured nothing".
  it(
    "holds the images it downloaded and not the tree it planned against",
    async () => {
      const files = 64;
      for (let i = 0; i < files; i++) {
        await write(
          image(`post-${String(i).padStart(3, "0")}`, "big.png"),
          filler(i),
        );
      }

      const naive = await measure("naive", MIB);
      const run = await measure("run", MIB);

      // The control: reading the tree the old way holds all 64 MiB of it, and
      // the instrument says so.
      expect(naive.files).toBe(files);
      expect(naive.bytes).toBe(files * MIB);
      expect(naive.retained).toBeGreaterThan(32 * MIB);

      // The run: two downloaded megabytes, a described tree, and the plan it
      // came to.
      expect(run.files).toBe(files);
      expect(run.bytes).toBe(2 * MIB);
      expect(run.unchanged).toBe(1);
      expect(run.write).toBe(1);
      expect(run.delete).toBe(0);
      expect(run.retained).toBeLessThan(run.bytes + 16 * MIB);
      // And a fraction of what holding the tree costs.
      expect(run.retained).toBeLessThan(naive.retained / 2);
    },
    120_000,
  );
});

// Everything under public/images/blog was written by a previous run of this
// sync, which writes regular files and nothing else. Anything else there was
// put there by something else — and following it is how a plan that means to
// rewrite an image rewrites whatever the link points at instead, outside the
// repo entirely.
describe("what the walk refuses to follow", () => {
  it("refuses a symlink where an image should be", async () => {
    await write(image("a", "real.png"), filler(1, 64));
    const outside = path.join(root, "outside.png");
    await fs.writeFile(outside, filler(2, 64));
    await fs.symlink(outside, path.join(root, image("a", "link.png")));

    await expect(inspectImageFiles(root)).rejects.toBeInstanceOf(ImageTreeError);
    await expect(inspectImageFiles(root)).rejects.toThrow(
      /link\.png[\s\S]*(symbolic link|not a regular file)|symbolic link/i,
    );
  });

  it("refuses a symlink pointing nowhere", async () => {
    await write(image("a", "real.png"), filler(1, 64));
    await fs.symlink(
      path.join(root, "gone.png"),
      path.join(root, image("a", "dangling.png")),
    );

    await expect(inspectImageFiles(root)).rejects.toBeInstanceOf(ImageTreeError);
  });

  it("refuses a symlinked post directory rather than walking into it", async () => {
    const outside = path.join(root, "elsewhere");
    await fs.mkdir(outside, { recursive: true });
    await fs.writeFile(path.join(outside, "secret.png"), filler(3, 64));
    await fs.mkdir(path.join(root, "public/images/blog"), { recursive: true });
    await fs.symlink(outside, path.join(root, imageDir("linked")));

    await expect(inspectImageFiles(root)).rejects.toBeInstanceOf(ImageTreeError);
  });

  it("still ignores a stray file sitting where a post directory should be", async () => {
    await write("public/images/blog/loose.png", filler(4, 64));
    expect(await inspectImageFiles(root)).toEqual(new Map());
  });

  it("still ignores a directory sitting where an image should be", async () => {
    await write(image("a", "real.png"), filler(1, 64));
    await fs.mkdir(path.join(root, image("a", "nested")), { recursive: true });

    expect([...(await inspectImageFiles(root)).keys()]).toEqual([
      image("a", "real.png"),
    ]);
  });

  it("refuses to write through a symlink planted after the plan was made", async () => {
    const outside = path.join(root, "target.png");
    await fs.writeFile(outside, filler(5, 64));
    const plan = planImages(
      new Map([[image("a", "img.png"), filler(6, 64)]]),
      new Map() as ExistingImages,
      [imageDir("a")],
    );
    await fs.mkdir(path.join(root, imageDir("a")), { recursive: true });
    await fs.symlink(outside, path.join(root, image("a", "img.png")));

    await expect(
      applyImagePlan(root, plan, new Map([[image("a", "img.png"), filler(6, 64)]])),
    ).rejects.toBeInstanceOf(ImageTreeError);
    // The file the link pointed at is untouched.
    expect(new Uint8Array(await fs.readFile(outside))).toEqual(filler(5, 64));
  });
});

// A file this run cannot read is a file it cannot compare. Treating it as
// absent is the one answer that is certainly wrong: `--check` would report the
// tree in sync while a real run rewrote it, and an orphan nobody can read would
// sit there forever being invisible.
describe("a file the walk cannot read", () => {
  const root0 = typeof process.getuid === "function" && process.getuid() === 0;

  it.skipIf(root0)("stops the run rather than treating it as absent", async () => {
    await write(image("a", "unreadable.png"), filler(9, 64));
    await fs.chmod(path.join(root, image("a", "unreadable.png")), 0o000);

    try {
      await expect(inspectImageFiles(root)).rejects.toBeInstanceOf(
        ImageTreeError,
      );
      await expect(inspectImageFiles(root)).rejects.toThrow(/unreadable\.png/);
    } finally {
      await fs
        .chmod(path.join(root, image("a", "unreadable.png")), 0o600)
        .catch(() => undefined);
    }
  });

  it.skipIf(root0)("stops on a directory it cannot list", async () => {
    await write(image("a", "one.png"), filler(9, 64));
    await fs.chmod(path.join(root, imageDir("a")), 0o000);

    try {
      await expect(inspectImageFiles(root)).rejects.toBeInstanceOf(
        ImageTreeError,
      );
    } finally {
      await fs
        .chmod(path.join(root, imageDir("a")), 0o700)
        .catch(() => undefined);
    }
  });

  it("says nothing about a blog that has no images yet", async () => {
    expect(await inspectImageFiles(root)).toEqual(new Map());
  });
});
