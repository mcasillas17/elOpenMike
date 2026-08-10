import matter from "gray-matter";
import type { BlockObjectRequest } from "@notionhq/client";
import { slugify, isValidSlug } from "./slug";
import {
  titlePropertyName,
  buildStatusProperty,
  type DataSourceSchema,
} from "./properties";
import { markdownToBlocks, plainRichText as text } from "./md-to-blocks";

// The migration is a one-shot script that talks to a network API over dozens of
// requests, so "it either finishes or it did nothing" was never true: a 429, a
// dropped connection or one bad fence leaves the database half full. Re-running
// used to create a second page for everything that had already landed, and two
// Notion pages claiming one slug is exactly what the sync refuses to publish —
// so a retry broke the blog until someone tidied the database by hand.
//
// So the run is planned against what is already in the database: existing slugs
// are read first, posts that are already there are skipped, and anything
// ambiguous stops the run before a single page is created. Re-running is then
// safe by construction, and a complete re-run does nothing at all.
//
// Trash: a trashed page is invisible to the sync and to a data source query, so
// it does not hold its slug. Trashing a page and re-running is how one post is
// redone, and a trashed page never counts as a duplicate of a live one.

export type LocalPost = {
  file: string;
  slug: string;
  title: string;
  date: string;
  excerpt: string;
  tags: string[];
  content: string;
};

export type RemotePage = {
  pageId: string;
  slug: string;
  archived?: boolean;
  in_trash?: boolean;
};

export type MigrationMatch = { slug: string; pageId: string };

export type MigrationPlan = {
  // Only ever non-empty when `errors` is empty: a plan that found a problem
  // cannot be half-acted on.
  create: LocalPost[];
  skip: MigrationMatch[];
  archived: MigrationMatch[];
  errors: string[];
};

export type MigrationOptions = {
  dataSourceId: string;
  schema: DataSourceSchema;
};

export type CreatePageRequest = {
  parent: { type: "data_source_id"; data_source_id: string };
  properties: Record<string, unknown>;
  children: BlockObjectRequest[];
};

// Reads one content/blog/*.mdx file into the shape the migration writes. The
// slug is normalized the same way fetch-post.ts reads it back, so a re-run
// compares like with like.
export function toLocalPost(file: string, raw: string): LocalPost {
  const stem = file.replace(/\.mdx$/, "");
  const { data, content } = matter(raw);

  return {
    file,
    slug: slugify(stem),
    title: String(data.title ?? stem),
    date: String(data.date ?? ""),
    excerpt: String(data.excerpt ?? ""),
    tags: (Array.isArray(data.tags) ? data.tags : []).map(String),
    content,
  };
}

function isTrashed(page: RemotePage): boolean {
  return page.archived === true || page.in_trash === true;
}

export function planMigration(
  posts: LocalPost[],
  pages: RemotePage[],
): MigrationPlan {
  const errors: string[] = [];

  const live = pages.filter((page) => !isTrashed(page));
  const bySlug = new Map<string, RemotePage[]>();
  for (const page of live) {
    bySlug.set(page.slug, [...(bySlug.get(page.slug) ?? []), page]);
  }

  // A slug held by two live pages is the wreckage of an earlier duplicated run.
  // Matching against either one would bless it, so the run stops instead.
  for (const [slug, claimants] of [...bySlug].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (claimants.length > 1) {
      errors.push(
        `slug "${slug}" is already claimed by ${claimants.length} pages in the ` +
          `database (${claimants
            .map((page) => page.pageId)
            .sort()
            .join(", ")}) — delete the duplicates before migrating`,
      );
    }
  }

  const filesBySlug = new Map<string, string[]>();
  for (const post of posts) {
    if (!isValidSlug(post.slug)) {
      errors.push(
        `${post.file} has no url-safe characters to build a slug from`,
      );
      continue;
    }
    filesBySlug.set(post.slug, [...(filesBySlug.get(post.slug) ?? []), post.file]);
  }

  // Two files on one slug would migrate to two pages the sync then refuses.
  for (const [slug, files] of [...filesBySlug].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (files.length > 1) {
      errors.push(
        `${files.sort().join(" and ")} both map to slug "${slug}" — ` +
          "rename one before migrating",
      );
    }
  }

  const skip: MigrationMatch[] = [];
  const create: LocalPost[] = [];
  for (const post of posts) {
    const existing = bySlug.get(post.slug)?.[0];
    if (existing) skip.push({ slug: post.slug, pageId: existing.pageId });
    else create.push(post);
  }

  const archived = pages
    .filter((page) => isTrashed(page))
    .map((page) => ({ slug: page.slug, pageId: page.pageId }));

  return {
    create: errors.length > 0 ? [] : create,
    skip: errors.length > 0 ? [] : skip,
    archived,
    errors,
  };
}

// The create-page bodies for exactly the posts the plan wants created, one per
// entry of `plan.create` and in the same order. Pure, so the whole run can be
// inspected before a single request goes out — including the Status shape and
// every fence language, both of which the API rejects the entire page for when
// they are wrong.
export function migrationRequests(
  plan: MigrationPlan,
  { dataSourceId, schema }: MigrationOptions,
): CreatePageRequest[] {
  if (plan.create.length === 0) return [];

  const titleProperty = titlePropertyName(schema);
  const status = buildStatusProperty(schema);

  return plan.create.map((post) => ({
    parent: { type: "data_source_id" as const, data_source_id: dataSourceId },
    properties: {
      [titleProperty]: { title: text(post.title) },
      Slug: { rich_text: text(post.slug) },
      Excerpt: { rich_text: text(post.excerpt) },
      Tags: { multi_select: post.tags.map((tag) => ({ name: tag })) },
      Status: status,
      Published: { date: { start: post.date } },
    },
    children: markdownToBlocks(post.content),
  }));
}
