import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
// The class is imported dynamically below, after the mock is in place; this is
// the same name taken as a type, which is erased and so cannot defeat it.
import type { ContentTreeError as ContentTreeRefusal } from "@/lib/notion/content-files";

// The migration reads content/blog/*.mdx off the disk and sends what it finds
// to Notion. That is an *upload*, and it was reading the tree by hand:
//
//     const names = (await fs.readdir(dir)).filter((n) => n.endsWith(".mdx"));
//     ... toLocalPost(name, await fs.readFile(path.join(dir, name), "utf8"))
//
// `readdir` walks whatever `content` and `content/blog` resolve to, and
// `readFile` reads through whatever the last name resolves to — so a link at
// any of the three turns "migrate my blog" into "read that, and publish it".
// Nor is a symbolic link the only way to spell it: a *hard* link is a second
// name for a file that no flag refuses and no `lstat` can see, and one under
// content/blog is somebody else's file wearing a post's name.
//
// So the migration reads the tree the sync does, through the same safe walk:
// every directory proved before it is stepped through, every post proved to be
// a regular file with one name, and every answer this run is unsure of an error
// rather than a post — or, worse, a missing one.

// The swap this cannot close by checking is the one that happens *between* a
// check and the read it justified, so the test makes it happen: a hook that
// fires after each lstat, which is exactly the window a race lives in.
type LstatHook = ((target: string) => Promise<void>) | undefined;
const hooks: { afterLstat: LstatHook } = { afterLstat: undefined };

vi.mock("node:fs/promises", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs/promises")>();
  const patched: typeof real = {
    ...real,
    async lstat(target: Parameters<typeof real.lstat>[0], options?: never) {
      const stats = await real.lstat(target, options);
      await hooks.afterLstat?.(String(target));
      return stats;
    },
  } as typeof real;
  return { ...patched, default: patched };
});

const fs = (await import("node:fs/promises")).default;
const { readLocalPostFiles, ContentTreeError, BLOG_CONTENT_ROOT } = await import(
  "@/lib/notion/content-files"
);

const SCRATCH = path.join(process.cwd(), ".tmp-tests");

let root: string;
let outside: string;

const post = (slug: string) => `${BLOG_CONTENT_ROOT}/${slug}.mdx`;
const body = (slug: string) =>
  `---\ntitle: "Title ${slug}"\n---\n\nBody of ${slug}.\n`;

const SECRET = "PRIVATE KEY\n";

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

async function plantSecret(name: string): Promise<string> {
  const full = path.join(outside, name);
  await fs.writeFile(full, SECRET, "utf8");
  return full;
}

const asRoot = typeof process.getuid === "function" && process.getuid() === 0;

// The refusal itself, so a test can say which check stopped the run rather than
// only that something did.
async function refusalOf(
  promise: Promise<unknown>,
): Promise<ContentTreeRefusal> {
  try {
    await promise;
  } catch (error: unknown) {
    if (error instanceof ContentTreeError) return error;
    throw error;
  }
  throw new Error("expected the tree to be refused");
}

beforeEach(async () => {
  hooks.afterLstat = undefined;
  const id = `migration-posts-${process.pid}-${Math.random().toString(36).slice(2)}`;
  root = path.join(SCRATCH, id, "repo");
  outside = path.join(SCRATCH, id, "outside");
  await fs.mkdir(root, { recursive: true });
  await fs.mkdir(outside, { recursive: true });
});

afterEach(async () => {
  hooks.afterLstat = undefined;
  await fs.chmod(path.join(root, BLOG_CONTENT_ROOT), 0o700).catch(() => undefined);
  await fs.rm(path.dirname(root), { recursive: true, force: true });
});

afterAll(async () => {
  await fs.rmdir(SCRATCH).catch(() => undefined);
});

describe("the posts a migration reads off the disk", () => {
  it("reads every .mdx, in name order, with its file name", async () => {
    await seed({
      [post("b")]: body("b"),
      [post("a")]: body("a"),
      [post("c")]: body("c"),
      [`${BLOG_CONTENT_ROOT}/notes.txt`]: "not a post",
      [`${BLOG_CONTENT_ROOT}/.keep`]: "",
    });

    expect(await readLocalPostFiles(root)).toEqual([
      { name: "a.mdx", contents: body("a") },
      { name: "b.mdx", contents: body("b") },
      { name: "c.mdx", contents: body("c") },
    ]);
  });

  it("ignores a directory that happens to be named like a post", async () => {
    await seed({ [post("a")]: body("a") });
    await fs.mkdir(path.join(root, post("dir")), { recursive: true });

    expect((await readLocalPostFiles(root)).map((file) => file.name)).toEqual([
      "a.mdx",
    ]);
  });

  it("reads an empty blog directory as no posts", async () => {
    await fs.mkdir(path.join(root, BLOG_CONTENT_ROOT), { recursive: true });
    expect(await readLocalPostFiles(root)).toEqual([]);
  });

  // A migration is *about* content/blog. "There is no such directory" is a
  // checkout or a working directory that is not the one this was meant to be
  // run in, and answering it with "nothing to migrate" is how a run that should
  // have stopped reports success having pushed nothing.
  it("stops rather than treating a missing blog directory as an empty one", async () => {
    const refusal = await refusalOf(readLocalPostFiles(root));
    expect(refusal.reason).toBe("no-posts-directory");
    expect(refusal.message).toMatch(/content\/blog/);
  });
});

describe("a link where a post should be", () => {
  it.each(["content", BLOG_CONTENT_ROOT])(
    "refuses to walk into %s when it is a symlink",
    async (parent) => {
      const planted = path.join(outside, "posts");
      await fs.mkdir(path.join(planted, "blog"), { recursive: true });
      await fs.writeFile(path.join(planted, "blog/a.mdx"), SECRET, "utf8");
      await fs.writeFile(path.join(planted, "a.mdx"), SECRET, "utf8");
      await linkAt(parent, parent === "content" ? planted : path.join(planted, "blog"));

      await expect(readLocalPostFiles(root)).rejects.toBeInstanceOf(
        ContentTreeError,
      );
    },
  );

  it("refuses a post that is a symlink rather than reading through it", async () => {
    const secret = await plantSecret("secrets.mdx");
    await seed({ [post("real")]: body("real") });
    await linkAt(post("linked"), secret);

    await expect(readLocalPostFiles(root)).rejects.toBeInstanceOf(
      ContentTreeError,
    );
  });

  it("refuses a post that is a dangling symlink", async () => {
    await seed({ [post("real")]: body("real") });
    await linkAt(post("linked"), path.join(outside, "gone.mdx"));

    await expect(readLocalPostFiles(root)).rejects.toBeInstanceOf(
      ContentTreeError,
    );
  });

  // A hard link is not a link anything can refuse by flag: `O_NOFOLLOW` does
  // not see one and `lstat` calls it an ordinary regular file. What it is, is a
  // second name for a file outside the repo — and reading it is uploading it.
  it("refuses a post that is a second name for a file outside the repo", async () => {
    const secret = await plantSecret("id_rsa");
    await seed({ [post("real")]: body("real") });
    await fs.link(secret, path.join(root, post("linked")));

    const refusal = await refusalOf(readLocalPostFiles(root));
    expect(refusal.reason).toBe("not-a-regular-file");
    // And the secret is still only its own file's business.
    expect(refusal.message).not.toContain(SECRET.trim());
  });
});

// Every one of the above is a check, and a check is a moment. This is the
// moment after it.
describe("a tree rewritten underneath the run", () => {
  // Fires the swap the `nth` time the walk looks at a matching path, and then
  // gets out of the way, so what is under test is one moment rather than a tree
  // that keeps moving. Which moment matters: a directory is examined before it
  // is listed and again afterwards, and only the second of those is a window
  // between the listing and the files it named.
  function swapOn(
    nth: number,
    matches: (target: string) => boolean,
    swap: (target: string) => Promise<void>,
  ): void {
    let seen = 0;
    hooks.afterLstat = async (target: string) => {
      if (!matches(target)) return;
      seen += 1;
      if (seen < nth) return;
      hooks.afterLstat = undefined;
      await swap(target);
    };
  }

  it("refuses a post swapped for a link after it was examined", async () => {
    const secret = await plantSecret("secrets.mdx");
    await seed({ [post("a")]: body("a") });

    swapOn(
      1,
      (target) => target.endsWith(`${path.sep}a.mdx`),
      async (target) => {
        await fs.rm(target);
        await fs.symlink(secret, target);
      },
    );

    // The open refuses the link where the platform has O_NOFOLLOW; where it
    // does not, the file that was opened no longer matches the name it was
    // opened by.
    const refusal = await refusalOf(readLocalPostFiles(root));
    expect(["not-a-regular-file", "changed-underfoot"]).toContain(
      refusal.reason,
    );
  });

  it("refuses a post that vanished after it was listed", async () => {
    await seed({ [post("a")]: body("a"), [post("b")]: body("b") });

    swapOn(
      2,
      (target) => target.endsWith(`${path.sep}blog`),
      async () => {
        await fs.rm(path.join(root, post("a")));
      },
    );

    expect((await refusalOf(readLocalPostFiles(root))).reason).toBe(
      "changed-underfoot",
    );
  });
});

describe("a tree this run cannot read", () => {
  it.skipIf(asRoot)("stops rather than reading a directory it may not open", async () => {
    await seed({ [post("a")]: body("a") });
    await fs.chmod(path.join(root, BLOG_CONTENT_ROOT), 0o000);

    await expect(readLocalPostFiles(root)).rejects.toBeInstanceOf(
      ContentTreeError,
    );
  });

  it.skipIf(asRoot)("stops rather than skipping a post it may not open", async () => {
    await seed({ [post("a")]: body("a"), [post("b")]: body("b") });
    await fs.chmod(path.join(root, post("a")), 0o000);

    try {
      await expect(readLocalPostFiles(root)).rejects.toBeInstanceOf(
        ContentTreeError,
      );
      await expect(readLocalPostFiles(root)).rejects.toThrow(/a\.mdx/);
    } finally {
      await fs.chmod(path.join(root, post("a")), 0o600).catch(() => undefined);
    }
  });
});

// A checkout is allowed to live under a link — /var is /private/var on macOS —
// so the root is judged by what it resolves to rather than by how it is spelled.
describe("a repo that is itself reached through a link", () => {
  it("reads the checkout the link resolves to", async () => {
    await seed({ [post("a")]: body("a") });
    const alias = path.join(path.dirname(root), "alias");
    await fs.symlink(root, alias);

    expect(await readLocalPostFiles(alias)).toEqual([
      { name: "a.mdx", contents: body("a") },
    ]);
  });
});

// The module only matters if the script is the thing using it.
describe("what the migration script is wired to", () => {
  const script = fs.readFile(
    path.join(process.cwd(), "scripts", "mdx-to-notion.ts"),
    "utf8",
  );

  it("reads the posts on disk through this module", async () => {
    expect(await script).toMatch(/readLocalPostFiles\(/);
  });

  it("no longer touches the content tree by hand", async () => {
    const text = await script;
    expect(text).not.toMatch(/fs\.readdir/);
    expect(text).not.toMatch(/fs\.readFile/);
    expect(text).not.toMatch(/node:fs/);
  });

  // The read happens before the first request, so a tree the run could not read
  // is a run that wrote nothing rather than one that migrated half a blog.
  it("reads the tree before anything is prepared", async () => {
    const text = await script;
    expect(text.indexOf("readLocalPostFiles(")).toBeLessThan(
      text.indexOf("prepareMigration("),
    );
  });
});
