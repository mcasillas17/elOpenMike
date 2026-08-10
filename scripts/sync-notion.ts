import fs from "node:fs/promises";
import path from "node:path";
import {
  createNotionClient,
  resolveDataSourceId,
  queryPublishedPages,
  fetchBlockTree,
} from "../src/lib/notion/client";
import { toPostSource, isPublished } from "../src/lib/notion/fetch-post";
import { blocksToMarkdown } from "../src/lib/notion/blocks-to-md";
import {
  serializePost,
  contentProjection,
  resolveUpdated,
} from "../src/lib/notion/serialize";
import { validatePosts, type ValidatablePost } from "../src/lib/notion/validate";
import { planReconcile } from "../src/lib/notion/reconcile";
import {
  downloadImage,
  imageFileName,
  imageDir,
} from "../src/lib/notion/images";
import type { MdBlock, PostSource } from "../src/lib/notion/types";

const ROOT = process.cwd();
const BLOG_DIR = path.join(ROOT, "content", "blog");
const CHECK_ONLY = process.argv.includes("--check");

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing required environment variable ${name}`);
  return value;
}

// Walks a post's block tree, downloads every image while its signed URL is
// still valid (they expire after one hour), and returns a blockId → path map.
async function captureImages(
  post: PostSource,
): Promise<{ paths: Map<string, string>; files: Map<string, Uint8Array> }> {
  const paths = new Map<string, string>();
  const files = new Map<string, Uint8Array>();

  const walk = async (blocks: MdBlock[]): Promise<void> => {
    for (const block of blocks) {
      if (block.type === "image") {
        const payload = block.image as {
          type?: string;
          file?: { url: string };
          external?: { url: string };
        };
        const url = payload.file?.url ?? payload.external?.url;
        if (url) {
          const { bytes, contentType } = await downloadImage(url);
          const name = imageFileName(bytes, contentType);
          files.set(path.join(imageDir(post.slug), name), bytes);
          paths.set(block.id, `/images/blog/${post.slug}/${name}`);
        }
      }
      await walk(block.children);
    }
  };

  await walk(post.blocks);
  return { paths, files };
}

async function readExisting(dir: string): Promise<Map<string, string>> {
  const existing = new Map<string, string>();
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch {
    return existing;
  }
  for (const name of names) {
    if (name.endsWith(".mdx")) {
      existing.set(
        path.join("content", "blog", name),
        await fs.readFile(path.join(dir, name), "utf8"),
      );
    }
  }
  return existing;
}

function existingUpdated(mdx: string | undefined): string | undefined {
  const line = mdx?.split("\n").find((l) => l.startsWith("updated: "));
  return line?.slice('updated: "'.length, -1);
}

async function main(): Promise<void> {
  const client = createNotionClient(requireEnv("NOTION_TOKEN"));
  const dataSourceId = await resolveDataSourceId(
    client,
    requireEnv("NOTION_DATABASE_ID"),
  );

  const pages = await queryPublishedPages(client, dataSourceId, isPublished);
  const warnings: string[] = [];
  const desired = new Map<string, string>();
  const imageFiles = new Map<string, Uint8Array>();
  const validatable: ValidatablePost[] = [];

  const existing = await readExisting(BLOG_DIR);

  // Stable ordering keeps logs and any downstream diff deterministic.
  const sources = (
    await Promise.all(
      pages.map(async (page) =>
        toPostSource(page, await fetchBlockTree(client, page.id)),
      ),
    )
  ).sort((a, b) =>
    a.frontmatter.date === b.frontmatter.date
      ? a.slug.localeCompare(b.slug)
      : b.frontmatter.date.localeCompare(a.frontmatter.date),
  );

  for (const post of sources) {
    const { paths, files } = await captureImages(post);
    for (const [file, bytes] of files) imageFiles.set(file, bytes);

    const body = blocksToMarkdown(post.blocks, {
      imagePath: (id) => paths.get(id) ?? "",
      onWarning: (message) => warnings.push(`${post.slug}: ${message}`),
    });

    const filePath = path.join("content", "blog", `${post.slug}.mdx`);
    const onDisk = existing.get(filePath);
    const candidate = serializePost(post.frontmatter, body);

    // Notion's last_edited_time moves whenever a page is opened. Only adopt the
    // new value when the content itself changed (spec §7).
    const unchanged =
      onDisk !== undefined &&
      contentProjection(candidate) === contentProjection(onDisk);
    const updated = unchanged
      ? resolveUpdated(post.frontmatter.updated, existingUpdated(onDisk))
      : post.frontmatter.updated;

    desired.set(filePath, serializePost({ ...post.frontmatter, updated }, body));
    validatable.push({ slug: post.slug, frontmatter: post.frontmatter, body });
  }

  const errors = validatePosts(validatable);
  if (errors.length > 0) {
    console.error(
      `\n✗ ${errors.length} validation error(s) — nothing written:\n`,
    );
    for (const error of errors) console.error(`  ${error}`);
    process.exit(1);
  }

  for (const warning of warnings) console.warn(`  warning: ${warning}`);

  const plan = planReconcile(desired, existing);

  if (CHECK_ONLY) {
    const dirty = plan.write.length + plan.delete.length;
    console.log(
      dirty === 0
        ? "✓ in sync"
        : `✗ ${dirty} file(s) would change: ${[...plan.write, ...plan.delete].join(", ")}`,
    );
    process.exit(dirty === 0 ? 0 : 1);
  }

  await fs.mkdir(BLOG_DIR, { recursive: true });
  for (const file of plan.write) {
    await fs.writeFile(path.join(ROOT, file), desired.get(file)!, "utf8");
  }
  for (const file of plan.delete) {
    await fs.rm(path.join(ROOT, file), { force: true });
    await fs.rm(path.join(ROOT, imageDir(path.basename(file, ".mdx"))), {
      recursive: true,
      force: true,
    });
  }

  // Write images, then prune any that no post references any more.
  for (const [file, bytes] of imageFiles) {
    await fs.mkdir(path.join(ROOT, path.dirname(file)), { recursive: true });
    await fs.writeFile(path.join(ROOT, file), bytes);
  }
  for (const post of sources) {
    const dir = path.join(ROOT, imageDir(post.slug));
    const kept = new Set(
      [...imageFiles.keys()]
        .filter((file) => file.startsWith(imageDir(post.slug)))
        .map((file) => path.basename(file)),
    );
    let present: string[] = [];
    try {
      present = await fs.readdir(dir);
    } catch {
      continue;
    }
    for (const name of present) {
      if (!kept.has(name)) await fs.rm(path.join(dir, name), { force: true });
    }
  }

  console.log(
    `✓ ${plan.unchanged.length} unchanged, ${plan.write.length} written, ${plan.delete.length} removed`,
  );
}

main().catch((error: unknown) => {
  console.error(`✗ sync failed: ${(error as Error).message}`);
  process.exit(1);
});
