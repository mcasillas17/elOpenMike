import fs, { type FileHandle } from "node:fs/promises";
import { constants, type Stats } from "node:fs";
import path from "node:path";

// Touching a tree inside this repo, one path component at a time.
//
// Both trees this sync owns — `content/blog` and `public/images/blog` — are
// written by nothing but this sync, which writes regular files inside plain
// directories. Anything else found in them was put there by something else, and
// following it is how a run that means to rewrite a post's image rewrites
// whatever a link points at instead: a file outside the repo, holding a post's
// bytes, or somebody else's directory being pruned as though it were an orphan.
//
// The check that used to stand was `O_NOFOLLOW` on the file being opened, plus
// an `lstat` of that same file. Both look at the *last* name in a path and say
// nothing about the rest of it, and `public/images/blog/a-post/x.png` has five.
// A link at `public` sends the whole walk somewhere else before the last
// component is ever considered: every file "found on disk" is then a file
// outside the repo, every write lands there, and every orphan is deleted there.
//
// Node has no `openat(2)`, so a descriptor-relative walk — the only thing that
// closes the window between a check and the operation it justifies — is not
// available here. What is:
//
//   * every component is `lstat`ed immediately before the operation that uses
//     it, and a symbolic link (or a Windows reparse point, which `lstat`
//     reports the same way) at any of them stops the run;
//   * the no-follow flags are used wherever the platform has them, so the open
//     itself refuses a link rather than trusting the check that preceded it;
//   * the resolved path is compared with where it should be, so a tree that
//     resolves outside the repo is refused even if every component looked
//     ordinary;
//   * what was opened is compared with what is at the path afterwards, by
//     device and inode, and a disagreement is refused rather than guessed at.
//
// The remaining window — something swapped and swapped back between two
// syscalls — cannot be closed from Node. Everything here is therefore written
// to fail closed: an answer this module is not sure of is an error, never an
// "absent" and never a "fine".

export type TreeProblem =
  | "not-a-regular-file"
  | "not-a-plain-directory"
  | "unreadable"
  | "escapes-root"
  | "changed-underfoot";

// How a tree names its own refusals. Each tree has its own error type and its
// own words — the image walk and the content walk say different things about
// what they found — but every refusal below comes from exactly one of these, so
// no path in this module can fail silently or fail anonymously.
export type TreeRefusal = {
  // Something that is not a regular file where a file belongs.
  notAFile(file: string): Error;
  // Something that is not a plain directory where a directory belongs.
  notADirectory(dir: string): Error;
  // A path that could not be examined, listed, opened, created or removed.
  unreadable(file: string, what: string): Error;
  // A path that resolves somewhere other than where it is spelled.
  escapes(file: string): Error;
  // A path that changed between the check and the operation it justified.
  raced(file: string): Error;
};

// O_NOFOLLOW makes an open refuse a symbolic link itself, and O_DIRECTORY makes
// it refuse anything that is not a directory. Neither exists on Windows, where
// the lstat checks are what stand.
const NO_FOLLOW = constants.O_NOFOLLOW ?? 0;
const DIRECTORY_ONLY = constants.O_DIRECTORY ?? 0;
const READ_FILE = constants.O_RDONLY | NO_FOLLOW;
const WRITE_FILE =
  constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | NO_FOLLOW;
const READ_DIRECTORY = constants.O_RDONLY | NO_FOLLOW | DIRECTORY_ONLY;

const FILE_MODE = 0o644;

// "Nothing has been written here yet". Every other errno is an answer this
// module does not have, and is reported rather than read as an empty tree.
const ABSENT = new Set(["ENOENT", "ENOTDIR"]);

const errno = (error: unknown): string | undefined =>
  (error as NodeJS.ErrnoException).code;

export type SafeTree = {
  // The names in a directory, or undefined when the directory is not there at
  // all. Never undefined because it could not be read.
  list(relative: string): Promise<string[] | undefined>;
  // What is at a path, without following it, or undefined when nothing is.
  entry(relative: string): Promise<Stats | undefined>;
  // A regular file, opened for reading, proved not to be a link.
  openFile(relative: string): Promise<FileHandle>;
  // A regular file, truncated and opened for writing, with every directory
  // above it created if it is missing and proved if it is not.
  createFile(relative: string): Promise<FileHandle>;
  // Removes a regular file. Never recursive, and never through a link.
  removeFile(relative: string): Promise<void>;
  // Removes a directory only if it is empty. Never recursive, never through a
  // link, and quiet when the directory is not empty or not there.
  removeEmptyDirectory(relative: string): Promise<void>;
};

export function openSafeTree(root: string, refuse: TreeRefusal): SafeTree {
  // What the root resolves to, read once. A checkout can legitimately live
  // under a path that is itself a link — /var is /private/var on macOS — so
  // containment is judged against what the root resolves to rather than how it
  // happens to be spelled.
  let resolvedRoot: string | undefined;

  async function rootPath(relative: string): Promise<string> {
    if (resolvedRoot === undefined) {
      try {
        resolvedRoot = await fs.realpath(root);
      } catch {
        throw refuse.unreadable(relative, "resolved");
      }
    }
    return resolvedRoot;
  }

  // A repo-relative path and nothing else: no absolute path, no `..`, no empty
  // or `.` component, no separator smuggled inside a name. This is the first
  // thing that stands between a key in a plan and a write outside the repo,
  // before a single syscall is made.
  function components(relative: string): string[] {
    if (relative.length === 0 || path.isAbsolute(relative)) {
      throw refuse.escapes(relative);
    }
    const parts = relative.split("/");
    for (const part of parts) {
      if (
        part === "" ||
        part === "." ||
        part === ".." ||
        part.includes("\\") ||
        part.includes("\0")
      ) {
        throw refuse.escapes(relative);
      }
    }
    return parts;
  }

  const absolute = (relative: string): string =>
    path.join(root, ...components(relative));

  // lstat, with "not there" told apart from "could not look". Only ENOENT and
  // ENOTDIR are absence; a permission error is an answer this run does not have.
  async function look(
    full: string,
    relative: string,
  ): Promise<Stats | undefined> {
    try {
      return await fs.lstat(full);
    } catch (error: unknown) {
      if (ABSENT.has(errno(error) ?? "")) return undefined;
      throw refuse.unreadable(relative, "examined");
    }
  }

  // Where a path lands once every link in it is resolved. Every component has
  // already been proved not to be a link, so this can only disagree if
  // something moved underneath the walk — which is exactly what it is here to
  // catch.
  async function assertInsideRoot(
    full: string,
    relative: string,
  ): Promise<void> {
    const expected = path.join(await rootPath(relative), ...components(relative));
    let real: string;
    try {
      real = await fs.realpath(full);
    } catch {
      throw refuse.unreadable(relative, "resolved");
    }
    if (real !== expected) throw refuse.escapes(relative);
  }

  type Directory =
    | { found: true; path: string }
    // Missing, or a file where a directory would be: either way nothing this
    // sync wrote is under it.
    | { found: false; path: string };

  // Every directory from the root down to `relative`, each one examined
  // immediately before it is stepped through. `create` makes the missing ones,
  // one at a time — never `recursive: true`, which follows whatever it finds.
  async function walk(relative: string, create: boolean): Promise<Directory> {
    const parts = components(relative);
    let full = root;
    let walked = "";

    for (const part of parts) {
      walked = walked === "" ? part : `${walked}/${part}`;
      full = path.join(full, part);

      let stats = await look(full, walked);
      if (stats === undefined) {
        if (!create) return { found: false, path: full };
        stats = await makeDirectory(full, walked);
      }

      // Checked before the kind: a link to a perfectly good directory is still
      // something this sync did not put there.
      if (stats.isSymbolicLink()) throw refuse.notADirectory(walked);
      if (!stats.isDirectory()) {
        if (!create) return { found: false, path: full };
        throw refuse.notADirectory(walked);
      }
    }

    await assertInsideRoot(full, relative);
    return { found: true, path: full };
  }

  async function makeDirectory(full: string, relative: string): Promise<Stats> {
    try {
      await fs.mkdir(full);
    } catch (error: unknown) {
      // Something arrived at that path first; whatever it is, the checks below
      // are what decide about it.
      if (errno(error) !== "EEXIST") throw refuse.unreadable(relative, "created");
    }
    const stats = await look(full, relative);
    if (stats === undefined) throw refuse.unreadable(relative, "created");
    return stats;
  }

  const parentOf = (relative: string): string => {
    const parts = components(relative);
    if (parts.length < 2) throw refuse.escapes(relative);
    return parts.slice(0, -1).join("/");
  };

  // The two stats of one path: the file that was opened, and whatever is at
  // that name now. A disagreement means something moved between the two, and
  // this module refuses rather than deciding which one it meant.
  function assertSameInode(
    opened: Stats,
    now: Stats | undefined,
    relative: string,
  ): void {
    if (now === undefined || now.dev !== opened.dev || now.ino !== opened.ino) {
      throw refuse.raced(relative);
    }
  }

  // Holds a directory still for the length of one listing. O_DIRECTORY and
  // O_NOFOLLOW make the open itself refuse anything that is not the plain
  // directory that was just proved; on a platform with neither — Windows, where
  // opening a directory fails anyway — the same question is asked with an
  // lstat, which is the check that stands there in any case.
  async function pinDirectory(
    full: string,
    relative: string,
  ): Promise<{ stats: Stats; release: () => Promise<void> }> {
    if (DIRECTORY_ONLY === 0) {
      const stats = await look(full, relative);
      if (stats === undefined) throw refuse.raced(relative);
      if (!stats.isDirectory() || stats.isSymbolicLink()) {
        throw refuse.notADirectory(relative);
      }
      return { stats, release: async () => undefined };
    }

    let handle: FileHandle;
    try {
      handle = await fs.open(full, READ_DIRECTORY);
    } catch (error: unknown) {
      const code = errno(error);
      if (code === "ELOOP" || code === "ENOTDIR") {
        throw refuse.notADirectory(relative);
      }
      throw refuse.unreadable(relative, "listed");
    }

    const release = () => handle.close().catch(() => undefined);
    try {
      const stats = await handle.stat();
      if (!stats.isDirectory()) throw refuse.notADirectory(relative);
      return { stats, release };
    } catch (error: unknown) {
      await release();
      throw error;
    }
  }

  return {
    async list(relative: string): Promise<string[] | undefined> {
      const directory = await walk(relative, false);
      if (!directory.found) return undefined;

      // Pinned before it is listed and compared with the path afterwards: the
      // listing describes the directory that was proved, or it is not used at
      // all. Where the platform can hold a directory open with the no-follow
      // flags it is held; where it cannot — Windows has neither flag, and
      // opening a directory there fails outright — the same comparison is made
      // with two lstats, which is what stands in that case anyway.
      const pin = await pinDirectory(directory.path, relative);

      try {
        let names: string[];
        try {
          names = await fs.readdir(directory.path);
        } catch (error: unknown) {
          if (ABSENT.has(errno(error) ?? "")) throw refuse.raced(relative);
          throw refuse.unreadable(relative, "listed");
        }

        assertSameInode(pin.stats, await look(directory.path, relative), relative);
        return names;
      } finally {
        await pin.release();
      }
    },

    async entry(relative: string): Promise<Stats | undefined> {
      const parent = await walk(parentOf(relative), false);
      if (!parent.found) return undefined;
      return look(absolute(relative), relative);
    },

    async openFile(relative: string): Promise<FileHandle> {
      const parent = await walk(parentOf(relative), false);
      if (!parent.found) throw refuse.raced(relative);
      const full = absolute(relative);

      let handle: FileHandle;
      try {
        handle = await fs.open(full, READ_FILE);
      } catch (error: unknown) {
        throw errno(error) === "ELOOP"
          ? refuse.notAFile(relative)
          : refuse.unreadable(relative, "opened");
      }

      try {
        const opened = await handle.stat();
        if (!opened.isFile()) throw refuse.notAFile(relative);
        assertSameInode(opened, await look(full, relative), relative);
        return handle;
      } catch (error: unknown) {
        await handle.close().catch(() => undefined);
        throw error;
      }
    },

    async createFile(relative: string): Promise<FileHandle> {
      await walk(parentOf(relative), true);
      const full = absolute(relative);

      // Looked at before it is opened, because O_TRUNC happens at open time: a
      // link is refused by the flags, but a *hard* link is a second name for
      // the same file and no flag can see one. A file this sync wrote has one
      // name; anything with two is somebody else's file as well.
      const before = await look(full, relative);
      if (before !== undefined && (before.isSymbolicLink() || !before.isFile())) {
        throw refuse.notAFile(relative);
      }
      if (before !== undefined && before.nlink > 1) {
        throw refuse.notAFile(relative);
      }

      let handle: FileHandle;
      try {
        handle = await fs.open(full, WRITE_FILE, FILE_MODE);
      } catch (error: unknown) {
        throw errno(error) === "ELOOP"
          ? refuse.notAFile(relative)
          : refuse.unreadable(relative, "written");
      }

      try {
        const opened = await handle.stat();
        if (!opened.isFile() || opened.nlink > 1) throw refuse.notAFile(relative);
        assertSameInode(opened, await look(full, relative), relative);
        return handle;
      } catch (error: unknown) {
        await handle.close().catch(() => undefined);
        throw error;
      }
    },

    async removeFile(relative: string): Promise<void> {
      const parent = await walk(parentOf(relative), false);
      // The directory is gone, so the file under it is too.
      if (!parent.found) return;

      const full = absolute(relative);
      const stats = await look(full, relative);
      // Already gone. A deletion that finds nothing has nothing to do.
      if (stats === undefined) return;
      if (stats.isSymbolicLink() || !stats.isFile()) {
        throw refuse.notAFile(relative);
      }

      try {
        // unlink removes the name, never what a link points at, and is never
        // recursive.
        await fs.unlink(full);
      } catch (error: unknown) {
        if (errno(error) === "ENOENT") return;
        throw refuse.unreadable(relative, "removed");
      }
    },

    async removeEmptyDirectory(relative: string): Promise<void> {
      const directory = await walk(relative, false);
      if (!directory.found) return;
      // rmdir refuses a non-empty directory, refuses a symbolic link, and is
      // never recursive — which is the whole of what tidying up may do.
      await fs.rmdir(directory.path).catch(() => undefined);
    },
  };
}
