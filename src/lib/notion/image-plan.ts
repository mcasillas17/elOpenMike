import fs, { type FileHandle } from "node:fs/promises";
import { constants, type Stats } from "node:fs";
import path from "node:path";
import {
  digestBytes,
  digestHandle,
  IMAGE_DIGEST_CHUNK_BYTES,
} from "./image-digest";
import { BLOG_IMAGE_ROOT } from "./images";

export type ImagePlan = {
  write: string[];
  delete: string[];
  unchanged: string[];
};

// What a file already on disk is worth remembering. Not its bytes: the plan
// only ever asks whether a file already holds the bytes this run has in hand,
// and a length and a digest answer that without keeping a single body.
export type ExistingImage = { size: number; digest: string };
export type ExistingImages = Map<string, ExistingImage>;

export function imageMetadata(bytes: Uint8Array): ExistingImage {
  return { size: bytes.byteLength, digest: digestBytes(bytes) };
}

function sameImage(onDisk: ExistingImage, bytes: Uint8Array): boolean {
  // Length first: it is free, and it settles nearly every real difference
  // without hashing anything.
  return (
    onDisk.size === bytes.byteLength && onDisk.digest === digestBytes(bytes)
  );
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
  existing: ExistingImages,
  prunableDirs: Iterable<string>,
): ImagePlan {
  const write: string[] = [];
  const unchanged: string[] = [];

  for (const [file, bytes] of desired) {
    const onDisk = existing.get(file);
    if (onDisk !== undefined && sameImage(onDisk, bytes)) unchanged.push(file);
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

type ImageTreeProblem = "not-a-regular-file" | "unreadable";

export class ImageTreeError extends Error {
  constructor(
    readonly reason: ImageTreeProblem,
    detail: string,
  ) {
    super(`image tree refused: ${detail}`);
    this.name = "ImageTreeError";
  }
}

// Everything under public/images/blog was written by a previous run of this
// sync, which writes regular files and nothing else. Anything else there was
// put there by something else, and following it is how a plan that means to
// rewrite an image rewrites whatever a link points at instead — a file outside
// the repo, holding a post's bytes. On Windows the same check catches a reparse
// point, which `lstat` reports as a symbolic link.
function refuseKind(file: string): ImageTreeError {
  return new ImageTreeError(
    "not-a-regular-file",
    `${file} is not a regular file — this sync writes nothing but regular ` +
      "files there, so something else put it there and following it could " +
      "write a post's bytes outside the repo; nothing was read, planned, " +
      "written or deleted this run",
  );
}

// A file this run cannot read is a file it cannot compare, and "absent" is the
// one answer that is certainly wrong: `--check` would call the tree in sync
// while a real run rewrote it, and an orphan nobody can read would sit there
// being invisible. Named by repo-relative path — every path here is one a
// previous run wrote and committed — and never by the errno message, which
// quotes the absolute path of somebody's checkout.
function refuseUnreadable(file: string, what: string): ImageTreeError {
  return new ImageTreeError(
    "unreadable",
    `${file} could not be ${what} — an image this run cannot read is one it ` +
      "cannot compare, so nothing was read, planned, written or deleted this " +
      "run",
  );
}

// O_NOFOLLOW makes the open itself refuse a symlink, which closes the window
// between the check and the read. It does not exist on Windows, where the
// lstat check is what stands.
const NO_FOLLOW = constants.O_NOFOLLOW ?? 0;
const READ_ONLY = constants.O_RDONLY | NO_FOLLOW;
const OVERWRITE =
  constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | NO_FOLLOW;

async function lstatOrRefuse(root: string, file: string): Promise<Stats> {
  try {
    return await fs.lstat(path.join(root, file));
  } catch {
    throw refuseUnreadable(file, "examined");
  }
}

// One file, read through the caller's buffer and reduced to what the plan
// needs. The open handle is stat'd rather than the path: that answer describes
// the file this run is actually holding, not whatever was at that path a moment
// ago.
async function inspectFile(
  root: string,
  file: string,
  buffer: Buffer,
): Promise<ExistingImage> {
  let handle: FileHandle;
  try {
    handle = await fs.open(path.join(root, file), READ_ONLY);
  } catch (error: unknown) {
    throw (error as NodeJS.ErrnoException).code === "ELOOP"
      ? refuseKind(file)
      : refuseUnreadable(file, "opened");
  }

  try {
    const stats = await handle.stat();
    if (!stats.isFile()) throw refuseKind(file);
    return await digestHandle(handle, buffer);
  } catch (error: unknown) {
    throw error instanceof ImageTreeError
      ? error
      : refuseUnreadable(file, "read");
  } finally {
    await handle.close().catch(() => undefined);
  }
}

// Every image currently under public/images/blog, keyed by repo-relative path
// so the keys match the ones renderPosts() produces — and described rather than
// held: a size and a digest each, read one file at a time through a single
// buffer, so what this costs does not depend on what the blog's images weigh.
//
// Reading them into a `Map<string, Uint8Array>` was the alternative, and it
// made the run's peak the images it downloaded *plus the whole of that
// directory*. A blog whose images weigh 300 MB spent 300 MB proving that none
// of them had changed, on a runner that has a few, and the way that ends is a
// killed process rather than a message. image-budget.ts put a ceiling on the
// half of the memory a run downloads; this is the other half.
//
// The traversal is sorted at both levels, so two runs over one tree produce one
// order — which is what makes the plan, the log and any diff reproducible.
export async function inspectImageFiles(root: string): Promise<ExistingImages> {
  const files: ExistingImages = new Map();
  let slugs: string[];
  try {
    slugs = await fs.readdir(path.join(root, BLOG_IMAGE_ROOT));
  } catch (error: unknown) {
    // "Nothing has been written here yet" and "I was not allowed to look" are
    // the same answer only if nobody asks which one it is — and the second one
    // plans every image as missing, every orphan as absent, and reports a tree
    // it never saw as being in sync.
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return files;
    throw refuseUnreadable(BLOG_IMAGE_ROOT, "listed");
  }

  // One buffer for the whole walk: this, and nothing per file, is what the run
  // holds while it reads a tree of any size.
  const buffer = Buffer.allocUnsafe(IMAGE_DIGEST_CHUNK_BYTES);

  for (const slug of [...slugs].sort()) {
    const dir = `${BLOG_IMAGE_ROOT}/${slug}`;
    const entry = await lstatOrRefuse(root, dir);
    // A stray file where a post's directory should be: not this sync's, and
    // never was — it claims no image and holds no post.
    if (entry.isFile()) continue;
    if (!entry.isDirectory()) throw refuseKind(dir);

    let names: string[];
    try {
      names = await fs.readdir(path.join(root, dir));
    } catch {
      throw refuseUnreadable(dir, "listed");
    }

    for (const name of [...names].sort()) {
      const file = `${dir}/${name}`;
      const found = await lstatOrRefuse(root, file);
      // A nested directory is not an image this sync wrote, and holds none.
      if (found.isDirectory()) continue;
      if (!found.isFile()) throw refuseKind(file);
      files.set(file, await inspectFile(root, file, buffer));
    }
  }

  return files;
}

// Applies exactly what planImages() described — no directory is walked again
// and no path is recomputed, so what `--check` reported is what happens.
//
// Every write opens the path itself rather than writing through whatever is
// there: a symlink planted between the plan and the write would otherwise send
// a post's bytes wherever it points, and a walk that refused one at plan time
// cannot speak for the moment the write happens.
export async function applyImagePlan(
  root: string,
  plan: ImagePlan,
  desired: Map<string, Uint8Array>,
): Promise<void> {
  for (const file of plan.write) {
    const bytes = desired.get(file);
    if (!bytes) continue;
    await fs.mkdir(path.join(root, path.dirname(file)), { recursive: true });

    let handle: FileHandle;
    try {
      handle = await fs.open(path.join(root, file), OVERWRITE, 0o644);
    } catch (error: unknown) {
      throw (error as NodeJS.ErrnoException).code === "ELOOP"
        ? refuseKind(file)
        : refuseUnreadable(file, "written");
    }
    try {
      await handle.writeFile(bytes);
    } finally {
      await handle.close().catch(() => undefined);
    }
  }

  // rm unlinks a symlink itself rather than following it, so a link that
  // somehow reached the plan is removed rather than resolved.
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
