import fs from "node:fs/promises";
import path from "node:path";
import {
  createNotionClient,
  resolveDataSourceId,
  queryPublishedPages,
  fetchBlockTree,
  retrievePage,
} from "../src/lib/notion/client";
import { isPublished, pageSlug } from "../src/lib/notion/fetch-post";
import { validatePosts, validateSourceSlugs } from "../src/lib/notion/validate";
import { postPath, massDeleteError } from "../src/lib/notion/plan";
import { downloadImage } from "../src/lib/notion/images";
import {
  planImages,
  readImageFiles,
  applyImagePlan,
} from "../src/lib/notion/image-plan";
import { collectSources } from "../src/lib/notion/collect";
import {
  renderPosts,
  planSync,
  prunableImageDirs,
  pendingOperations,
  type PostFailure,
} from "../src/lib/notion/sync";

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
  // Each page's metadata is read again once its blocks are in hand, because the
  // page could have been unpublished or rewritten in between (see collect.ts).
  // Stable ordering keeps logs and any downstream diff deterministic.
  const collected = await collectSources(pages, {
    fetchBlocks: (pageId) => fetchBlockTree(client, pageId),
    retrievePage: (pageId) => retrievePage(client, pageId),
  });

  const sources = collected.sources.sort((a, b) =>
    a.frontmatter.date === b.frontmatter.date
      ? a.slug.localeCompare(b.slug)
      : b.frontmatter.date.localeCompare(a.frontmatter.date),
  );

  const outcome = await renderPosts(
    sources,
    (url) => downloadImage(url),
    collected.failures,
  );

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

  // Images are reconciled exactly like the MDX files: one plan, computed
  // before anything is touched, that both `--check` and the writing path use.
  // Planning MDX alone let `--check` report "in sync" while a real run went on
  // to rewrite and prune images.
  const imagePlan = planImages(
    outcome.images,
    await readImageFiles(ROOT),
    prunableImageDirs(outcome, syncPlan),
  );
  const pending = pendingOperations(plan, imagePlan);

  if (CHECK_ONLY) {
    console.log(
      pending.length === 0
        ? "✓ in sync"
        : `✗ ${pending.length} file(s) would change: ${pending.join(", ")}`,
    );
    process.exit(pending.length === 0 ? 0 : 1);
  }

  await fs.mkdir(BLOG_DIR, { recursive: true });
  for (const file of plan.write) {
    await fs.writeFile(path.join(ROOT, file), desired.get(file)!, "utf8");
  }
  for (const file of plan.delete) {
    await fs.rm(path.join(ROOT, file), { force: true });
  }
  await applyImagePlan(ROOT, imagePlan, outcome.images);

  console.log(
    `✓ ${plan.unchanged.length} unchanged, ${plan.write.length} written, ` +
      `${plan.delete.length} removed, ${imagePlan.write.length} image(s) written, ` +
      `${imagePlan.delete.length} pruned`,
  );
}

main().catch((error: unknown) => {
  console.error(`✗ sync failed: ${(error as Error).message}`);
  process.exit(1);
});
