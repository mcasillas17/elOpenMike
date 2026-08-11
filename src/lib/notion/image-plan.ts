import { type FileHandle } from "node:fs/promises";
import path from "node:path";
import {
  digestBytes,
  digestHandle,
  IMAGE_DIGEST_CHUNK_BYTES,
} from "./image-digest";
import { BLOG_IMAGE_ROOT } from "./images";
import { openSafeTree, type SafeTree, type TreeRefusal } from "./safe-fs";

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

type ImageTreeProblem =
  | "not-a-regular-file"
  | "not-a-plain-directory"
  | "unreadable"
  | "escapes-root"
  | "changed-underfoot";

export class ImageTreeError extends Error {
  constructor(
    readonly reason: ImageTreeProblem,
    detail: string,
  ) {
    super(`image tree refused: ${detail}`);
    this.name = "ImageTreeError";
  }
}

// Every path here is one a previous run of this sync wrote and committed, so it
// is named in full and repo-relative — and never by the errno message, which
// quotes the absolute path of somebody's checkout.
const NOTHING_HAPPENED =
  "nothing was read, planned, written or deleted this run";

// Everything under public/images/blog was written by a previous run of this
// sync, which writes regular files inside plain directories and nothing else.
// Anything else there was put there by something else, and following it is how a
// plan that means to rewrite an image rewrites whatever a link points at
// instead — a file outside the repo, holding a post's bytes. On Windows the same
// check catches a reparse point, which `lstat` reports as a symbolic link.
function refuseKind(file: string): ImageTreeError {
  return new ImageTreeError(
    "not-a-regular-file",
    `${file} is not a regular file — this sync writes nothing but regular ` +
      "files there, so something else put it there and following it could " +
      `write a post's bytes outside the repo; ${NOTHING_HAPPENED}`,
  );
}

// The same refusal one level up, and the one that was missing: a link at
// `public`, at `public/images` or at the blog root itself moves the entire walk
// somewhere else before a single file name is considered, so every image the run
// then reads, writes or prunes is one outside the repo.
function refuseDirectory(dir: string): ImageTreeError {
  return new ImageTreeError(
    "not-a-plain-directory",
    `${dir} is not a plain directory — every directory between the repo and a ` +
      "post's images is one this sync made, so a link there would move the " +
      `whole walk out of the repo; ${NOTHING_HAPPENED}`,
  );
}

// A file this run cannot read is a file it cannot compare, and "absent" is the
// one answer that is certainly wrong: `--check` would call the tree in sync
// while a real run rewrote it, and an orphan nobody can read would sit there
// being invisible.
function refuseUnreadable(file: string, what: string): ImageTreeError {
  return new ImageTreeError(
    "unreadable",
    `${file} could not be ${what} — an image this run cannot read is one it ` +
      `cannot compare, so ${NOTHING_HAPPENED}`,
  );
}

// A path that lands somewhere other than where it is spelled, with no link
// anywhere in it that would explain how.
function refuseEscape(file: string): ImageTreeError {
  return new ImageTreeError(
    "escapes-root",
    `${file} does not resolve to where it is written — a path under this repo ` +
      `that lands outside it is one nothing here may follow; ${NOTHING_HAPPENED}`,
  );
}

// Something moved between the check and the operation it justified. Node has no
// openat(2), so the window cannot be closed from here — but it can be looked at
// from both sides, and a disagreement is refused rather than guessed at.
function refuseRace(file: string): ImageTreeError {
  return new ImageTreeError(
    "changed-underfoot",
    `${file} changed while this run was looking at it — a tree being rewritten ` +
      `underneath a sync is not one it can plan against; ${NOTHING_HAPPENED}`,
  );
}

const REFUSAL: TreeRefusal = {
  notAFile: refuseKind,
  notADirectory: refuseDirectory,
  unreadable: refuseUnreadable,
  escapes: refuseEscape,
  raced: refuseRace,
};

const imageTree = (root: string): SafeTree => openSafeTree(root, REFUSAL);

// One file, read through the caller's buffer and reduced to what the plan
// needs. The open handle is stat'd rather than the path: that answer describes
// the file this run is actually holding, not whatever was at that path a moment
// ago.
async function inspectFile(
  tree: SafeTree,
  file: string,
  buffer: Buffer,
): Promise<ExistingImage> {
  const handle: FileHandle = await tree.openFile(file);
  try {
    return await digestHandle(handle, buffer);
  } catch (error: unknown) {
    throw error instanceof ImageTreeError ? error : refuseUnreadable(file, "read");
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
// Every directory on the way down is examined before it is stepped through —
// `public`, `public/images`, the blog root, then each post's — because a link at
// any of them is a walk that reads a tree outside the repo and reports it as
// this blog's. See safe-fs.ts.
//
// The traversal is sorted at both levels, so two runs over one tree produce one
// order — which is what makes the plan, the log and any diff reproducible.
export async function inspectImageFiles(root: string): Promise<ExistingImages> {
  const tree = imageTree(root);
  const files: ExistingImages = new Map();

  // "Nothing has been written here yet" and "I was not allowed to look" are the
  // same answer only if nobody asks which one it is — and the second one plans
  // every image as missing, every orphan as absent, and reports a tree it never
  // saw as being in sync.
  const slugs = await tree.list(BLOG_IMAGE_ROOT);
  if (slugs === undefined) return files;

  // One buffer for the whole walk: this, and nothing per file, is what the run
  // holds while it reads a tree of any size.
  const buffer = Buffer.allocUnsafe(IMAGE_DIGEST_CHUNK_BYTES);

  for (const slug of [...slugs].sort()) {
    const dir = `${BLOG_IMAGE_ROOT}/${slug}`;
    const entry = await tree.entry(dir);
    // Gone since the listing: nothing to read, and nothing to refuse.
    if (entry === undefined) continue;
    // A stray file where a post's directory should be: not this sync's, and
    // never was — it claims no image and holds no post.
    if (entry.isFile()) continue;
    if (entry.isSymbolicLink() || !entry.isDirectory()) throw refuseDirectory(dir);

    const names = await tree.list(dir);
    if (names === undefined) continue;

    for (const name of [...names].sort()) {
      const file = `${dir}/${name}`;
      const found = await tree.entry(file);
      if (found === undefined) continue;
      // A nested directory is not an image this sync wrote, and holds none.
      if (found.isDirectory()) continue;
      if (found.isSymbolicLink() || !found.isFile()) throw refuseKind(file);
      files.set(file, await inspectFile(tree, file, buffer));
    }
  }

  return files;
}

// Applies exactly what planImages() described — no directory is walked again
// and no path is recomputed, so what `--check` reported is what happens.
//
// Every write proves the whole path again first, component by component: a plan
// is built against a tree as it was when it was walked, and a link planted
// anywhere above a post's images between then and now would send that post's
// bytes wherever it points. The file itself is opened with O_NOFOLLOW and
// compared with what is at its name afterwards, so the last step is not trusted
// to the check that preceded it either.
export async function applyImagePlan(
  root: string,
  plan: ImagePlan,
  desired: Map<string, Uint8Array>,
): Promise<void> {
  const tree = imageTree(root);

  for (const file of plan.write) {
    const bytes = desired.get(file);
    if (!bytes) continue;
    const handle = await tree.createFile(file);
    try {
      await handle.writeFile(bytes);
    } finally {
      await handle.close().catch(() => undefined);
    }
  }

  // Never recursive, and never through a link: a deletion removes a name this
  // run proved is a regular file inside a directory it proved is this repo's.
  for (const file of plan.delete) {
    await tree.removeFile(file);
  }

  // Tidy up directories the deletions emptied. rmdir fails on a non-empty
  // directory, which is exactly the check that needs making.
  const emptied = new Set(plan.delete.map((file) => path.posix.dirname(file)));
  for (const dir of [...emptied].sort()) {
    await tree.removeEmptyDirectory(dir);
  }
}
