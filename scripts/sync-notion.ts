import fs from "node:fs/promises";
import path from "node:path";
import {
  createNotionClient,
  resolveDataSourceId,
  queryPublishedPages,
  fetchBlockTree,
} from "../src/lib/notion/client";
import { toPostSource, isPublished, pageSlug } from "../src/lib/notion/fetch-post";
import { validatePosts, validateSourceSlugs } from "../src/lib/notion/validate";
import { postPath, massDeleteError } from "../src/lib/notion/plan";
import { downloadImage, imageDir } from "../src/lib/notion/images";
import { mapWithConcurrency } from "../src/lib/notion/pool";
import {
  renderPosts,
  planSync,
  protectedImageDirs,
  type PostFailure,
} from "../src/lib/notion/sync";
import { isValidSlug } from "../src/lib/notion/slug";

const ROOT = process.cwd();
const BLOG_DIR = path.join(ROOT, "content", "blog");
const CHECK_ONLY = process.argv.includes("--check");
const ALLOW_MASS_DELETE = process.argv.includes("--allow-mass-delete");

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing required environment variable ${name}`);
  return value;
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
        postPath(name.replace(/\.mdx$/, "")),
        await fs.readFile(path.join(dir, name), "utf8"),
      );
    }
  }
  return existing;
}

// A post that failed keeps whatever is already on disk, so the run is not a
// failure for the rest of the blog — but it must be loud. Under Actions the
// ::error:: prefix surfaces it as an annotation on the run without failing the
// job, which would otherwise skip the commit step and discard the posts that
// did sync.
function reportFailures(
  failures: PostFailure[],
  preserved: string[],
  skipped: string[],
  deferred: string[],
): void {
  if (deferred.length > 0) {
    console.warn(
      `  ${deferred.length} file(s) left in place until every post syncs: ` +
        `${deferred.join(", ")}`,
    );
  }
  if (failures.length === 0) return;

  const annotate = process.env.GITHUB_ACTIONS === "true" ? "::error::" : "";
  console.error(`\n\u2717 ${failures.length} post(s) failed to sync:`);
  for (const failure of failures) {
    const fate = preserved.includes(failure.slug)
      ? "kept the existing file"
      : "not published";
    console.error(`  ${annotate}${failure.slug}: ${failure.message} (${fate})`);
  }
  if (skipped.length > 0) {
    console.error(`  never published: ${skipped.join(", ")}`);
  }
}

async function main(): Promise<void> {
  const client = createNotionClient(requireEnv("NOTION_TOKEN"));
  const dataSourceId = await resolveDataSourceId(
    client,
    requireEnv("NOTION_DATABASE_ID"),
  );

  const pages = await queryPublishedPages(client, dataSourceId, isPublished);
  const existing = await readExisting(BLOG_DIR);

  // Two pages claiming one slug are one file on disk, and nothing on disk says
  // which page wrote it — so a run where one of them fails silently republishes
  // the other page's content under the same url. Caught here, on metadata
  // alone, before a single block is fetched.
  const slugErrors = validateSourceSlugs(
    pages.map((page) => ({ pageId: page.id, slug: pageSlug(page) })),
  );
  if (slugErrors.length > 0) {
    console.error(
      `\n✗ ${slugErrors.length} slug collision(s) — nothing written:\n`,
    );
    for (const error of slugErrors) console.error(`  ${error}`);
    process.exit(1);
  }

  // Bounded fan-out: Notion allows ~3 requests/second per integration, so a
  // Promise.all over every page would burst straight into 429s (see pool.ts).
  // Stable ordering keeps logs and any downstream diff deterministic.
  const sources = (
    await mapWithConcurrency(pages, async (page) =>
      toPostSource(page, await fetchBlockTree(client, page.id)),
    )
  ).sort((a, b) =>
    a.frontmatter.date === b.frontmatter.date
      ? a.slug.localeCompare(b.slug)
      : b.frontmatter.date.localeCompare(a.frontmatter.date),
  );

  const outcome = await renderPosts(sources, (url) => downloadImage(url));

  const errors = validatePosts(outcome.rendered);
  if (errors.length > 0) {
    console.error(
      `\n✗ ${errors.length} validation error(s) — nothing written:\n`,
    );
    for (const error of errors) console.error(`  ${error}`);
    process.exit(1);
  }

  for (const warning of outcome.warnings) console.warn(`  warning: ${warning}`);

  const syncPlan = planSync(outcome, existing);
  const { desired, plan, preserved, skipped, deferred } = syncPlan;
  // Reported before the early exits so a failure is visible even when the run
  // stops at the mass-delete guard or in --check mode.
  reportFailures(outcome.failures, preserved, skipped, deferred);

  // Fail closed on a run that would remove most of the blog — see plan.ts.
  const massDelete = ALLOW_MASS_DELETE
    ? undefined
    : massDeleteError(plan, existing.size);
  if (massDelete) {
    console.error(`\n\u2717 ${massDelete}`);
    process.exit(1);
  }

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
    // Only a real slug may reach a recursive delete: path.basename turns
    // "..mdx" into "." and "...mdx" into "..", which would resolve to
    // public/images/blog or public/images and remove every site image.
    const slug = path.basename(file, ".mdx");
    if (!isValidSlug(slug)) continue;
    await fs.rm(path.join(ROOT, imageDir(slug)), {
      recursive: true,
      force: true,
    });
  }

  // Write images, then prune any that no post references any more. Only posts
  // that rendered are pruned, and never a directory this run could not observe:
  // a preserved post's images are still referenced by the file left on disk, a
  // skipped post's directory may be a half-written earlier attempt, and a
  // deferred file may belong to a live post whose slug moved.
  const protectedDirs = new Set(protectedImageDirs(syncPlan));
  for (const [file, bytes] of outcome.images) {
    await fs.mkdir(path.join(ROOT, path.dirname(file)), { recursive: true });
    await fs.writeFile(path.join(ROOT, file), bytes);
  }
  for (const post of outcome.rendered) {
    const dir = imageDir(post.slug);
    if (protectedDirs.has(dir)) continue;
    const kept = new Set(
      [...outcome.images.keys()]
        .filter((file) => file.startsWith(dir))
        .map((file) => path.basename(file)),
    );
    let present: string[] = [];
    try {
      present = await fs.readdir(path.join(ROOT, dir));
    } catch {
      continue;
    }
    for (const name of present) {
      if (!kept.has(name)) {
        await fs.rm(path.join(ROOT, dir, name), { force: true });
      }
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
