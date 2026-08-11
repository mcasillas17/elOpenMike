import fs from "node:fs/promises";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import {
  BLOG_CONTENT_ROOT,
  ContentTreeError,
  applyContentPlan,
  readExistingPosts,
} from "@/lib/notion/content-files";
import { planReconcile } from "@/lib/notion/reconcile";
import { postPath } from "@/lib/notion/plan";

// The MDX half of the sync lived in `scripts/sync-notion.ts`, where nothing
// tested it — and it showed. `readExisting` was:
//
//     try { names = await fs.readdir(dir) } catch { return existing }
//
// which reads "I was not allowed to look" as "there are no posts". Every post
// is then planned as missing, every file on disk as an orphan, and `--check`
// says the tree is in sync with a Notion it compared against nothing. The same
// swallow covered a file it could not read, a `content` that had become a
// symlink, and a post file replaced by a link to something outside the repo,
// which the writing half would then have written a post's bytes through.
//
// So it moved here, in front of tests, and it fails closed: only ENOENT and
// ENOTDIR mean "nothing has been written yet", every other errno stops the run,
// and every directory between the repo and a post is proved before it is
// stepped through (see safe-fs.ts).

const SCRATCH = path.join(process.cwd(), ".tmp-tests");

let root: string;
let outside: string;

const post = (slug: string) => postPath(slug);

const body = (slug: string) =>
  `---\ntitle: "Title ${slug}"\n---\n\nBody of ${slug}.\n`;

async function seed(files: Record<string, string>): Promise<void> {
  for (const [file, contents] of Object.entries(files)) {
    await fs.mkdir(path.join(root, path.dirname(file)), { recursive: true });
    await fs.writeFile(path.join(root, file), contents, "utf8");
  }
}

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

const asRoot = typeof process.getuid === "function" && process.getuid() === 0;

beforeEach(async () => {
  const id = `content-files-${process.pid}-${Math.random().toString(36).slice(2)}`;
  root = path.join(SCRATCH, id, "repo");
  outside = path.join(SCRATCH, id, "outside");
  await fs.mkdir(root, { recursive: true });
  await fs.mkdir(outside, { recursive: true });
});

afterEach(async () => {
  await fs.chmod(path.join(root, BLOG_CONTENT_ROOT), 0o700).catch(() => undefined);
  await fs.rm(path.dirname(root), { recursive: true, force: true });
});

afterAll(async () => {
  await fs.rmdir(SCRATCH).catch(() => undefined);
});

describe("reading the posts already on disk", () => {
  it("says nothing when the blog has no posts yet", async () => {
    expect(await readExistingPosts(root)).toEqual(new Map());
  });

  it("reads every post, keyed exactly as the planner names it", async () => {
    await seed({
      [post("b")]: body("b"),
      [post("a")]: body("a"),
      [`${BLOG_CONTENT_ROOT}/notes.txt`]: "not a post",
    });

    const existing = await readExistingPosts(root);

    expect([...existing.keys()]).toEqual([post("a"), post("b")]);
    expect(existing.get(post("a"))).toBe(body("a"));
  });

  // "No posts yet" and "I was not allowed to look" are the same answer only if
  // nobody asks which one it is.
  it.skipIf(asRoot)("stops rather than reading a tree it may not open", async () => {
    await seed({ [post("a")]: body("a") });
    await fs.chmod(path.join(root, BLOG_CONTENT_ROOT), 0o000);

    await expect(readExistingPosts(root)).rejects.toBeInstanceOf(
      ContentTreeError,
    );
  });

  it.skipIf(asRoot)("stops rather than reading a post it may not open", async () => {
    await seed({ [post("a")]: body("a") });
    await fs.chmod(path.join(root, post("a")), 0o000);

    try {
      await expect(readExistingPosts(root)).rejects.toBeInstanceOf(
        ContentTreeError,
      );
      await expect(readExistingPosts(root)).rejects.toThrow(/a\.mdx/);
    } finally {
      await fs.chmod(path.join(root, post("a")), 0o600).catch(() => undefined);
    }
  });

  it.each(["content", BLOG_CONTENT_ROOT])(
    "refuses to walk into %s when it is a symlink",
    async (parent) => {
      const planted = path.join(outside, "posts");
      await fs.mkdir(path.join(planted, "blog"), { recursive: true });
      await fs.writeFile(path.join(planted, "blog/a.mdx"), body("a"), "utf8");
      await fs.writeFile(path.join(planted, "a.mdx"), body("a"), "utf8");
      await linkAt(parent, parent === "content" ? planted : path.join(planted, "blog"));

      await expect(readExistingPosts(root)).rejects.toBeInstanceOf(
        ContentTreeError,
      );
    },
  );

  it("refuses a post that is a symlink rather than reading through it", async () => {
    const target = path.join(outside, "secrets.mdx");
    await fs.writeFile(target, "OUTSIDE", "utf8");
    await seed({ [post("real")]: body("real") });
    await linkAt(post("linked"), target);

    await expect(readExistingPosts(root)).rejects.toBeInstanceOf(
      ContentTreeError,
    );
  });

  it("refuses a post that is a dangling symlink", async () => {
    await seed({ [post("real")]: body("real") });
    await linkAt(post("linked"), path.join(outside, "gone.mdx"));

    await expect(readExistingPosts(root)).rejects.toBeInstanceOf(
      ContentTreeError,
    );
  });

  it("ignores a directory that happens to be named like a post", async () => {
    await seed({ [post("a")]: body("a") });
    await fs.mkdir(path.join(root, post("dir")), { recursive: true });

    expect([...(await readExistingPosts(root)).keys()]).toEqual([post("a")]);
  });
});

describe("writing what the plan asked for", () => {
  it("creates the blog directory and writes the posts", async () => {
    const desired = new Map([
      [post("a"), body("a")],
      [post("b"), body("b")],
    ]);

    await applyContentPlan(root, planReconcile(desired, new Map()), desired);

    expect(await read(path.join(root, post("a")))).toBe(body("a"));
    expect(await read(path.join(root, post("b")))).toBe(body("b"));
    const stats = await fs.lstat(path.join(root, BLOG_CONTENT_ROOT));
    expect(stats.isDirectory()).toBe(true);
    expect(stats.isSymbolicLink()).toBe(false);
  });

  it("rewrites, removes and leaves alone exactly what the plan named", async () => {
    await seed({
      [post("keep")]: body("keep"),
      [post("change")]: "stale\n",
      [post("gone")]: body("gone"),
    });

    const existing = await readExistingPosts(root);
    const desired = new Map([
      [post("keep"), body("keep")],
      [post("change"), body("change")],
    ]);
    const plan = planReconcile(desired, existing);
    expect(plan).toEqual({
      write: [post("change")],
      delete: [post("gone")],
      unchanged: [post("keep")],
    });

    await applyContentPlan(root, plan, desired);

    expect(await readExistingPosts(root)).toEqual(desired);
    // And a second pass has nothing left to do.
    expect(
      planReconcile(desired, await readExistingPosts(root)),
    ).toEqual({ write: [], delete: [], unchanged: [post("change"), post("keep")] });
  });

  it("refuses to write through a post that became a symlink", async () => {
    const target = path.join(outside, "victim.mdx");
    await fs.writeFile(target, "OUTSIDE", "utf8");
    await seed({ [post("a")]: "stale\n" });

    const desired = new Map([[post("a"), body("a")]]);
    const plan = planReconcile(desired, await readExistingPosts(root));
    await linkAt(post("a"), target);

    await expect(
      applyContentPlan(root, plan, desired),
    ).rejects.toBeInstanceOf(ContentTreeError);
    expect(await read(target)).toBe("OUTSIDE");
  });

  it.each(["content", BLOG_CONTENT_ROOT])(
    "refuses to write when %s is swapped for a symlink after the plan",
    async (parent) => {
      await seed({ [post("a")]: "stale\n" });
      const desired = new Map([[post("a"), body("a")]]);
      const plan = planReconcile(desired, await readExistingPosts(root));

      const planted = path.join(outside, "posts");
      await fs.mkdir(path.join(planted, "blog"), { recursive: true });
      await linkAt(parent, parent === "content" ? planted : path.join(planted, "blog"));

      await expect(
        applyContentPlan(root, plan, desired),
      ).rejects.toBeInstanceOf(ContentTreeError);
      expect(await exists(path.join(planted, "blog/a.mdx"))).toBe(false);
      expect(await exists(path.join(planted, "a.mdx"))).toBe(false);
    },
  );

  it("refuses to delete a post that became a symlink", async () => {
    await seed({ [post("gone")]: body("gone") });
    const plan = planReconcile(new Map(), await readExistingPosts(root));
    expect(plan.delete).toEqual([post("gone")]);

    const target = path.join(outside, "victim.mdx");
    await fs.writeFile(target, "OUTSIDE", "utf8");
    await linkAt(post("gone"), target);

    await expect(
      applyContentPlan(root, plan, new Map()),
    ).rejects.toBeInstanceOf(ContentTreeError);
    expect(await read(target)).toBe("OUTSIDE");
  });

  it("refuses a path that climbs out of the blog directory", async () => {
    const target = path.join(outside, "victim.mdx");
    await fs.writeFile(target, "OUTSIDE", "utf8");
    const escaping = `${BLOG_CONTENT_ROOT}/../../outside/victim.mdx`;

    await expect(
      applyContentPlan(
        root,
        { write: [escaping], delete: [], unchanged: [] },
        new Map([[escaping, "INSIDE"]]),
      ),
    ).rejects.toBeInstanceOf(ContentTreeError);
    expect(await read(target)).toBe("OUTSIDE");
  });
});

// The module only matters if the script is the thing using it.
describe("what the sync script is wired to", () => {
  const script = fs
    .readFile(path.join(process.cwd(), "scripts", "sync-notion.ts"), "utf8")
    .then((text) => text);

  it("reads the posts on disk through this module", async () => {
    expect(await script).toMatch(/readExistingPosts\(/);
  });

  it("writes and deletes them through this module", async () => {
    expect(await script).toMatch(/applyContentPlan\(/);
  });

  it("no longer touches the content tree by hand", async () => {
    const text = await script;
    expect(text).not.toMatch(/fs\.readdir/);
    expect(text).not.toMatch(/fs\.readFile/);
    expect(text).not.toMatch(/fs\.writeFile/);
    expect(text).not.toMatch(/fs\.rm\(/);
    expect(text).not.toMatch(/fs\.mkdir/);
  });

  // A tree the run could not read must fail the check rather than pass it: the
  // read happens before --check decides anything, and main()'s rejection is
  // what exits nonzero.
  it("reads the tree before --check reaches its verdict", async () => {
    const text = await script;
    expect(text.indexOf("readExistingPosts(")).toBeLessThan(
      text.indexOf("checkVerdict("),
    );
  });
});
