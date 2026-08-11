import {
  createNotionClient,
  queryPublishedPages,
  fetchBlockTree,
  retrievePage,
  retrieveDataSourceSchema,
} from "../src/lib/notion/client";
import { resolveConfiguredDataSourceId } from "../src/lib/notion/data-source";
import { isPublished, pageSlug } from "../src/lib/notion/fetch-post";
import { schemaProblems } from "../src/lib/notion/properties";
import { validatePosts, validateSourceSlugs } from "../src/lib/notion/validate";
import { postPath, massDeleteError } from "../src/lib/notion/plan";
import {
  readExistingPosts,
  applyContentPlan,
} from "../src/lib/notion/content-files";
import { downloadImage } from "../src/lib/notion/images";
import {
  planImages,
  inspectImageFiles,
  applyImagePlan,
} from "../src/lib/notion/image-plan";
import { collectSources } from "../src/lib/notion/collect";
import {
  renderPosts,
  planSync,
  prunableImageDirs,
  pendingOperations,
  checkVerdict,
  type PostFailure,
} from "../src/lib/notion/sync";

const ROOT = process.cwd();
const CHECK_ONLY = process.argv.includes("--check");
const ALLOW_MASS_DELETE = process.argv.includes("--allow-mass-delete");

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing required environment variable ${name}`);
  return value;
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
    // The page id, not the slug: a post that never reached disk has a slug
    // nothing else has published, and this log is public. A file that was
    // preserved is already committed, so naming it says nothing new.
    const fate = preserved.includes(failure.slug)
      ? `kept ${postPath(failure.slug)}`
      : "not published";
    console.error(`  ${annotate}page ${failure.pageId}: ${failure.message} (${fate})`);
  }
  if (skipped.length > 0) {
    console.error(
      `  ${skipped.length} of them have nothing on disk and were never published`,
    );
  }
}

async function main(): Promise<void> {
  const client = createNotionClient(requireEnv("NOTION_TOKEN"));
  // One resolver, shared with the migration, so both halves of the repo read
  // and write the same rows: NOTION_DATA_SOURCE_ID when it is set and proved to
  // belong to the database, and otherwise the database's single data source.
  const dataSourceId = await resolveConfiguredDataSourceId(client);

  // A renamed or retyped property otherwise reads as empty metadata and can
  // turn every row into an invalid post. Check the selected source itself before
  // querying a page or looking at the filesystem, using the migration's same
  // schema contract so the two directions cannot drift.
  const schema = await retrieveDataSourceSchema(client, dataSourceId);
  const schemaErrors = schemaProblems(schema);
  if (schemaErrors.length > 0) {
    throw new Error(
      `data source schema has ${schemaErrors.length} problem(s); nothing was read:\n` +
        schemaErrors.map((problem) => `  ${problem}`).join("\n"),
    );
  }

  const pages = await queryPublishedPages(client, dataSourceId, isPublished);
  // Read through the same module the writing half uses, which fails closed:
  // a tree this run may not open is not an empty one, and reading it as empty
  // plans every post as missing and reports a blog it never saw as in sync.
  // See content-files.ts.
  const existing = await readExistingPosts(ROOT);

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
  // The tree on disk is described, not held: a size and a digest per file, read
  // one file at a time (see inspectImageFiles). Reading every image into memory
  // to compare it made a run's peak the images it downloaded plus the whole of
  // public/images/blog.
  const imagePlan = planImages(
    outcome.images,
    await inspectImageFiles(ROOT),
    prunableImageDirs(outcome, syncPlan),
  );
  const pending = pendingOperations(plan, imagePlan);

  if (CHECK_ONLY) {
    // A failed post makes this fail whether or not a file would change: the run
    // could not read that post, so nothing on disk was verified against it, and
    // "in sync" would be an answer CI acts on. See checkVerdict.
    const verdict = checkVerdict(pending, outcome.failures);
    for (const line of verdict.lines) {
      if (verdict.ok) console.log(line);
      else console.error(line);
    }
    process.exit(verdict.exitCode);
  }

  await applyContentPlan(ROOT, plan, desired);
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
