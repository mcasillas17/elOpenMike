//
// ONE-TIME migration: pushes the hand-written content/blog/*.mdx posts into the
// Notion database so they don't need retyping. Run manually, once. Never wired
// into CI — after migration Notion owns content/blog/ and this script is dead
// weight kept only for the record.
//
// Safe to re-run, and safe to kill: every page is created as a Draft the site
// never shows and promoted to Published only once all of its blocks have
// landed, so a run that dies partway leaves drafts rather than half-published
// posts, and running it again finishes them. See src/lib/notion/migrate.ts.
//
// Pause .github/workflows/sync-content.yml first. That sync runs every ten
// minutes and removes the content/blog/*.mdx of any post Notion has not
// published — which, mid-migration, means the very file a killed run needs in
// order to finish its draft. If one does go missing, restore it from git and
// run this again; the drafts it cannot match to a file are listed at the end.
import fs from "node:fs/promises";
import path from "node:path";
import {
  createNotionClient,
  fetchBlockTree,
  queryPages,
} from "../src/lib/notion/client";
import { pageSlug, pageStatus, pageTitle } from "../src/lib/notion/fetch-post";
import { withRetry } from "../src/lib/notion/retry";
import {
  buildStatusProperty,
  PUBLISHED_STATUS,
  type DataSourceSchema,
} from "../src/lib/notion/properties";
import {
  toLocalPost,
  prepareMigration,
  runMigration,
  type MigrationExecutor,
  type RemotePage,
} from "../src/lib/notion/migrate";

const BLOG_DIR = path.join(process.cwd(), "content", "blog");

async function readLocalPosts(dir: string) {
  const names = (await fs.readdir(dir)).filter((n) => n.endsWith(".mdx")).sort();
  return Promise.all(
    names.map(async (name) =>
      toLocalPost(name, await fs.readFile(path.join(dir, name), "utf8")),
    ),
  );
}

async function main(): Promise<void> {
  const token = process.env.NOTION_TOKEN;
  const dataSourceId = process.env.NOTION_DATA_SOURCE_ID;
  if (!token || !dataSourceId) {
    throw new Error("set NOTION_TOKEN and NOTION_DATA_SOURCE_ID");
  }

  const client = createNotionClient(token);

  // Both the title property's name and the Status property's write shape and
  // options depend on how the database was set up, so read the schema before
  // writing anything.
  const dataSource = await withRetry(() =>
    client.request<{ properties: DataSourceSchema }>({
      path: `data_sources/${dataSourceId}`,
      method: "get",
    }),
  );

  // Every page's slug, title and status: what a re-run needs to tell a post it
  // already finished from a draft it left behind from somebody else's page.
  const existing: RemotePage[] = (
    await queryPages(client, dataSourceId)
  ).map((page) => ({
    pageId: page.id,
    slug: pageSlug(page),
    title: pageTitle(page),
    status: pageStatus(page),
    archived: page.archived,
    in_trash: page.in_trash,
  }));

  // Everything is read and measured before the first write: the database, the
  // posts, every request Notion would have to accept, and the blocks already on
  // any draft this run would resume. One unresolvable page stops the whole run
  // rather than half of it.
  const prepared = await prepareMigration(
    await readLocalPosts(BLOG_DIR),
    existing,
    { dataSourceId, schema: dataSource.properties },
    (pageId) => fetchBlockTree(client, pageId),
  );

  if (prepared.errors.length > 0) {
    console.error(`\n✗ ${prepared.errors.length} problem(s) — nothing written:\n`);
    for (const error of prepared.errors) console.error(`  ${error}`);
    for (const { slug, pageId } of prepared.orphanDrafts) {
      console.error(
        `  note: draft page ${pageId} claims slug "${slug}", which no ` +
          "content/blog file does",
      );
    }
    process.exit(1);
  }

  for (const { slug } of prepared.skip) {
    console.log(`· already published in Notion, skipped ${slug}`);
  }

  const published = buildStatusProperty(dataSource.properties, PUBLISHED_STATUS);

  // Notion takes 100 children per request, so a long post is one create and
  // then a series of appends, and one more request to publish it. Each call
  // retries a 429 the way every other call in this repo does; nothing is run
  // concurrently, because a post's batches are the order of its blocks and the
  // integration gets ~3 requests/second.
  const executor: MigrationExecutor = {
    async createPage(body) {
      const page = await withRetry(() =>
        client.request<{ id: string }>({ path: "pages", method: "post", body }),
      );
      return page.id;
    },
    async appendChildren(pageId, children) {
      await withRetry(() =>
        client.blocks.children.append({ block_id: pageId, children }),
      );
    },
    // The last write a page gets, and the only one that makes it visible to the
    // sync: everything it holds is already there.
    async publishPage(pageId) {
      await withRetry(() =>
        client.pages.update({
          page_id: pageId,
          properties: { Status: published },
        }),
      );
    },
  };

  const written = await runMigration(
    prepared.writes,
    executor,
    ({ slug, batches, resumed }) =>
      console.log(
        `✓ ${resumed ? "finished" : "migrated"} ${slug}` +
          (batches > 0
            ? ` (+${batches} block batch${batches === 1 ? "" : "es"})`
            : ""),
      ),
  );

  const resumed = written.filter((page) => page.resumed).length;
  console.log(
    `\n✓ ${written.length - resumed} created, ${resumed} resumed, ` +
      `${prepared.skip.length} already published`,
  );

  // A draft nothing on disk claims is how a killed run ends up unfinishable:
  // the content sync removes the .mdx of any post Notion has not published, so
  // a draft can outlive its own source file. Saying which file is missing is
  // the difference between "restore it from git and run again" and a post that
  // is simply gone.
  for (const { slug, pageId } of prepared.orphanDrafts) {
    console.warn(
      `! draft page ${pageId} claims slug "${slug}", which no content/blog ` +
        "file does — if a killed run left it, restore " +
        `content/blog/${slug}.mdx from git and run this again`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(`✗ migration failed: ${(error as Error).message}`);
  process.exit(1);
});
