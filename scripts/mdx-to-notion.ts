//
// ONE-TIME migration: pushes the hand-written content/blog/*.mdx posts into the
// Notion database so they don't need retyping. Run manually, once. Never wired
// into CI — after migration Notion owns content/blog/ and this script is dead
// weight kept only for the record.
//
// Safe to re-run: it reads the slugs already in the database first and creates
// only what is missing, so a run interrupted halfway is finished by running it
// again rather than duplicated. See src/lib/notion/migrate.ts.
import fs from "node:fs/promises";
import path from "node:path";
import { createNotionClient, queryPages } from "../src/lib/notion/client";
import { pageSlug } from "../src/lib/notion/fetch-post";
import { withRetry } from "../src/lib/notion/retry";
import type { DataSourceSchema } from "../src/lib/notion/properties";
import {
  toLocalPost,
  planMigration,
  migrationRequests,
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

  // Both the title property's name and the Status property's write shape depend
  // on how the database was set up, so read the schema before writing anything.
  const dataSource = await withRetry(() =>
    client.request<{ properties: DataSourceSchema }>({
      path: `data_sources/${dataSourceId}`,
      method: "get",
    }),
  );

  const existing: RemotePage[] = (
    await queryPages(client, dataSourceId)
  ).map((page) => ({
    pageId: page.id,
    slug: pageSlug(page),
    archived: page.archived,
    in_trash: page.in_trash,
  }));

  const plan = planMigration(await readLocalPosts(BLOG_DIR), existing);

  if (plan.errors.length > 0) {
    console.error(
      `\n✗ ${plan.errors.length} problem(s) — nothing created:\n`,
    );
    for (const error of plan.errors) console.error(`  ${error}`);
    process.exit(1);
  }

  for (const { slug } of plan.skip) {
    console.log(`· already in Notion, skipped ${slug}`);
  }

  // Built up front so an unusable Status property or an unknown fence fails
  // before the first page is created rather than partway through.
  const requests = migrationRequests(plan, {
    dataSourceId,
    schema: dataSource.properties,
  });

  for (const [index, body] of requests.entries()) {
    await withRetry(() => client.request({ path: "pages", method: "post", body }));
    console.log(`✓ migrated ${plan.create[index].slug}`);
  }

  console.log(
    `\n✓ ${requests.length} created, ${plan.skip.length} already present`,
  );
}

main().catch((error: unknown) => {
  console.error(`✗ migration failed: ${(error as Error).message}`);
  process.exit(1);
});
