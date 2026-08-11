import type { FileHandle } from "node:fs/promises";
import { postPath } from "./plan";
import type { ReconcilePlan } from "./reconcile";
import { POST_FILE_EXTENSION } from "./slug";
import { openSafeTree, type SafeTree, type TreeRefusal } from "./safe-fs";

// The MDX half of the sync: what is on disk, and what the plan does to it.
//
// This lived in `scripts/sync-notion.ts`, where nothing tested it — and it
// showed. Reading the posts already on disk was:
//
//     try { names = await fs.readdir(dir) } catch { return existing }
//
// which answers "I was not allowed to look" with "there are no posts". Every
// post is then planned as missing, every file on disk as an orphan, and — worst
// — `--check` reports a tree in sync that it compared against nothing, because
// the desired set and the empty existing set agree about a blog neither of them
// read. The same swallow covered a file whose read failed, a `content`
// directory that had become a symlink, and a post replaced by a link to
// somewhere outside the repo, which the writing half then wrote through.
//
// So it is here, in front of tests, and it fails closed. Only ENOENT and
// ENOTDIR — "nothing has been written here yet" — are absence; every other
// errno stops the run. And every directory between the repo and a post is
// examined before it is stepped through, because `content/blog/a-post.mdx` is
// three names and checking the last one says nothing about the first two. See
// safe-fs.ts for what that costs and what it cannot promise.

export const BLOG_CONTENT_ROOT = "content/blog";

type ContentTreeProblem =
  | "not-a-regular-file"
  | "not-a-plain-directory"
  | "unreadable"
  | "escapes-root"
  | "changed-underfoot";

export class ContentTreeError extends Error {
  constructor(
    readonly reason: ContentTreeProblem,
    detail: string,
  ) {
    super(`content tree refused: ${detail}`);
    this.name = "ContentTreeError";
  }
}

// Every path named here is repo-relative and committed — never the errno
// message, which quotes the absolute path of somebody's checkout.
const NOTHING_HAPPENED = "nothing was read, planned, written or deleted this run";

function refuseKind(file: string): ContentTreeError {
  return new ContentTreeError(
    "not-a-regular-file",
    `${file} is not a regular file — this sync writes nothing but regular ` +
      "files there, so something else put it there and following it could read " +
      `or write a post outside the repo; ${NOTHING_HAPPENED}`,
  );
}

function refuseDirectory(dir: string): ContentTreeError {
  return new ContentTreeError(
    "not-a-plain-directory",
    `${dir} is not a plain directory — every directory between the repo and a ` +
      "post is one this sync made, so a link there would move the whole walk " +
      `out of the repo; ${NOTHING_HAPPENED}`,
  );
}

// A post this run cannot read is a post it cannot compare, and "absent" is the
// one answer that is certainly wrong: it plans every file as an orphan, and
// `--check` calls a blog in sync that it never looked at.
function refuseUnreadable(file: string, what: string): ContentTreeError {
  return new ContentTreeError(
    "unreadable",
    `${file} could not be ${what} — a post this run cannot read is one it ` +
      `cannot compare, so ${NOTHING_HAPPENED}`,
  );
}

function refuseEscape(file: string): ContentTreeError {
  return new ContentTreeError(
    "escapes-root",
    `${file} does not resolve to where it is written — a path under this repo ` +
      `that lands outside it is one nothing here may follow; ${NOTHING_HAPPENED}`,
  );
}

function refuseRace(file: string): ContentTreeError {
  return new ContentTreeError(
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

const contentTree = (root: string): SafeTree => openSafeTree(root, REFUSAL);

async function readPost(tree: SafeTree, file: string): Promise<string> {
  const handle: FileHandle = await tree.openFile(file);
  try {
    return await handle.readFile("utf8");
  } catch (error: unknown) {
    throw error instanceof ContentTreeError
      ? error
      : refuseUnreadable(file, "read");
  } finally {
    await handle.close().catch(() => undefined);
  }
}

// Every post currently in content/blog, keyed by the path the planner names it
// by, so the two sets compare directly.
//
// Sorted, because a plan, a log and a diff that depend on directory order are
// three things that differ between two runs over one tree for no reason.
export async function readExistingPosts(
  root: string,
): Promise<Map<string, string>> {
  const tree = contentTree(root);
  const existing = new Map<string, string>();

  const names = await tree.list(BLOG_CONTENT_ROOT);
  if (names === undefined) return existing;

  for (const name of [...names].sort()) {
    if (!name.endsWith(POST_FILE_EXTENSION)) continue;
    const file = `${BLOG_CONTENT_ROOT}/${name}`;

    const entry = await tree.entry(file);
    // Gone between the listing and the look: nothing to read, nothing to
    // refuse.
    if (entry === undefined) continue;
    // A directory named like a post is not one, and holds none.
    if (entry.isDirectory()) continue;
    if (entry.isSymbolicLink() || !entry.isFile()) throw refuseKind(file);

    const slug = name.slice(0, -POST_FILE_EXTENSION.length);
    existing.set(postPath(slug), await readPost(tree, file));
  }

  return existing;
}

// Applies exactly what planReconcile() described. The directory is created if
// it is missing, one component at a time; every write proves the whole path
// again first, because the plan was built against the tree as it was when it
// was read.
export async function applyContentPlan(
  root: string,
  plan: ReconcilePlan,
  desired: Map<string, string>,
): Promise<void> {
  const tree = contentTree(root);

  for (const file of plan.write) {
    const contents = desired.get(file);
    if (contents === undefined) continue;
    const handle = await tree.createFile(file);
    try {
      await handle.writeFile(contents, "utf8");
    } finally {
      await handle.close().catch(() => undefined);
    }
  }

  // Never recursive, and never through a link.
  for (const file of plan.delete) {
    await tree.removeFile(file);
  }
}
