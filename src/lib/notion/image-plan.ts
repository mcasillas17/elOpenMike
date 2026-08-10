import fs from "node:fs/promises";
import path from "node:path";
import { BLOG_IMAGE_ROOT } from "./images";

export type ImagePlan = {
  write: string[];
  delete: string[];
  unchanged: string[];
};

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// Compares the images this run downloaded against the ones on disk, in the same
// shape planReconcile() uses for MDX. `--check` used to look at MDX alone, so a
// run that would rewrite or prune images reported "in sync"; planning both
// halves and applying the very same plan is what keeps the two honest.
//
// Deletion is confined to `prunableDirs`: an image under any other directory
// belongs to a post this run could not observe (one that failed, was skipped,
// or whose file's deletion was deferred) and is not this run's to remove.
export function planImages(
  desired: Map<string, Uint8Array>,
  existing: Map<string, Uint8Array>,
  prunableDirs: Iterable<string>,
): ImagePlan {
  const write: string[] = [];
  const unchanged: string[] = [];

  for (const [file, bytes] of desired) {
    const onDisk = existing.get(file);
    if (onDisk !== undefined && sameBytes(onDisk, bytes)) unchanged.push(file);
    else write.push(file);
  }

  const prunable = new Set(prunableDirs);
  const remove = [...existing.keys()].filter(
    (file) => !desired.has(file) && prunable.has(path.posix.dirname(file)),
  );

  return {
    write: write.sort(),
    delete: remove.sort(),
    unchanged: unchanged.sort(),
  };
}

// Every image currently under public/images/blog, keyed by repo-relative path
// so the keys match the ones renderPosts() produces.
export async function readImageFiles(
  root: string,
): Promise<Map<string, Uint8Array>> {
  const files = new Map<string, Uint8Array>();
  let slugs: string[];
  try {
    slugs = await fs.readdir(path.join(root, BLOG_IMAGE_ROOT));
  } catch {
    return files;
  }

  for (const slug of slugs.sort()) {
    const dir = `${BLOG_IMAGE_ROOT}/${slug}`;
    let names: string[];
    try {
      names = await fs.readdir(path.join(root, dir));
    } catch {
      continue; // a stray file rather than a directory
    }
    for (const name of names.sort()) {
      const file = `${dir}/${name}`;
      try {
        files.set(file, await fs.readFile(path.join(root, file)));
      } catch {
        continue; // a nested directory: not an image this sync wrote
      }
    }
  }

  return files;
}

// Applies exactly what planImages() described — no directory is walked again
// and no path is recomputed, so what `--check` reported is what happens.
export async function applyImagePlan(
  root: string,
  plan: ImagePlan,
  desired: Map<string, Uint8Array>,
): Promise<void> {
  for (const file of plan.write) {
    const bytes = desired.get(file);
    if (!bytes) continue;
    await fs.mkdir(path.join(root, path.dirname(file)), { recursive: true });
    await fs.writeFile(path.join(root, file), bytes);
  }

  for (const file of plan.delete) {
    await fs.rm(path.join(root, file), { force: true });
  }

  // Tidy up directories the deletions emptied. rmdir fails on a non-empty
  // directory, which is exactly the check that needs making.
  const emptied = new Set(plan.delete.map((file) => path.posix.dirname(file)));
  for (const dir of [...emptied].sort()) {
    await fs.rmdir(path.join(root, dir)).catch(() => undefined);
  }
}
