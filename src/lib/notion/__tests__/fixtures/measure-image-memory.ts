import fs from "node:fs/promises";
import path from "node:path";
import { inspectImageFiles, planImages } from "../../image-plan";
import { BLOG_IMAGE_ROOT, imageDir } from "../../images";

// Measures what a run actually holds while it plans a tree of images, in a
// process of its own so the numbers mean something.
//
// `process.memoryUsage()` inside a vitest worker does not see a Buffer the way
// a plain Node process does — an experiment that reads 64 MiB into a live Map
// there reports under two megabytes of `arrayBuffers`, which would make any
// budget assertion vacuous. So the measurement runs here, under
// `node --expose-gc`, where a forced collection makes "still held" mean
// something.
//
// One process measures one thing, from its own clean baseline, because freed
// external memory is not necessarily handed back before the next measurement.
// Two modes are measured against one tree:
//
//   * `naive` — the implementation this replaced: every file read whole into a
//     Map. It is the control. If the instrument could not see retention at all,
//     this would read low too, and the test reading this output says so.
//   * `run` — what the sync does now: the images it downloaded held because it
//     just downloaded them, and the tree it plans against described rather than
//     held.
//
// Usage: node --expose-gc --import tsx measure-image-memory.ts <root> <mode> <bytes>
// Prints one line of JSON.

function live(): number {
  const collect = (globalThis as { gc?: () => void }).gc;
  collect?.();
  collect?.();
  const usage = process.memoryUsage();
  return usage.heapUsed + usage.external;
}

function filler(seed: number, size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.fill(seed % 251);
  bytes[0] = seed & 0xff;
  bytes[1] = (seed >> 8) & 0xff;
  return bytes;
}

// The implementation this replaced, kept here and nowhere else: it is the
// control the measurement is calibrated against.
async function readEveryByte(root: string): Promise<Map<string, Uint8Array>> {
  const files = new Map<string, Uint8Array>();
  const slugs = await fs.readdir(path.join(root, BLOG_IMAGE_ROOT));
  for (const slug of slugs.sort()) {
    const dir = `${BLOG_IMAGE_ROOT}/${slug}`;
    const names = await fs.readdir(path.join(root, dir));
    for (const name of names.sort()) {
      const file = `${dir}/${name}`;
      files.set(file, await fs.readFile(path.join(root, file)));
    }
  }
  return files;
}

async function main(): Promise<void> {
  const [root, mode, size] = process.argv.slice(2);
  const imageBytes = Number(size);

  if (mode === "naive") {
    const before = live();
    const held = await readEveryByte(root);
    const retained = live() - before;
    process.stdout.write(
      JSON.stringify({
        mode,
        retained,
        files: held.size,
        bytes: [...held.values()].reduce(
          (total, bytes) => total + bytes.byteLength,
          0,
        ),
      }),
    );
    return;
  }

  const before = live();
  // Two images this run downloaded: one that matches what is on disk, one that
  // does not. They are the only bytes it is entitled to be holding.
  const desired = new Map<string, Uint8Array>([
    [`${imageDir("post-000")}/big.png`, filler(0, imageBytes)],
    [`${imageDir("post-001")}/big.png`, filler(999, imageBytes)],
  ]);
  const existing = await inspectImageFiles(root);
  const plan = planImages(desired, existing, [
    imageDir("post-000"),
    imageDir("post-001"),
  ]);
  const retained = live() - before;

  process.stdout.write(
    JSON.stringify({
      mode: "run",
      retained,
      files: existing.size,
      bytes: [...desired.values()].reduce(
        (total, bytes) => total + bytes.byteLength,
        0,
      ),
      unchanged: plan.unchanged.length,
      write: plan.write.length,
      delete: plan.delete.length,
    }),
  );
}

void main();
