import matter from "gray-matter";
import type { BlockObjectRequest } from "@notionhq/client";
import { slugify, isValidSlug } from "./slug";
import {
  titlePropertyName,
  buildStatusProperty,
  type DataSourceSchema,
} from "./properties";
import { markdownToBlocks, plainRichText as text } from "./md-to-blocks";
import type { RichTextInput } from "./md-to-rich-text";
import {
  batchChildren,
  blockProblems,
  normalizeBlocks,
  normalizeRichText,
  richTextProblems,
} from "./limits";

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
//
// A post too long for one request takes several (see limits.ts), which opens
// the one window this design cannot close by itself: between creating the page
// and appending the last of its blocks, the page exists and holds its slug
// while the post is incomplete. Every failure the script can observe is rolled
// back — runMigration trashes the page, so the slug is free again — but a
// process killed outright observes nothing. That leaves a live, half-written
// page which a re-run then skips as "already there". It is reported here, in
// the README, and in the failure message, because the recovery is a human one:
// trash the page in Notion and run again.

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

// One post, as the requests it takes to write it: the create-page request and
// then the block batches that did not fit in it. See limits.ts.
export type MigrationWrite = {
  slug: string;
  file: string;
  page: CreatePageRequest;
  appends: BlockObjectRequest[][];
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
    date: frontmatterDate(data.date),
    excerpt: String(data.excerpt ?? ""),
    tags: (Array.isArray(data.tags) ? data.tags : []).map(String),
    content,
  };
}

// YAML parses an unquoted 2026-05-20 into a Date, and String()ing that yields
// "Tue May 19 2026 17:00:00 GMT-0700" — a value Notion rejects, and one that has
// already slipped a day into the local timezone. The parsed date is UTC
// midnight, so the ISO day is the day that was written.
function frontmatterDate(value: unknown): string {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? ""
      : value.toISOString().slice(0, 10);
  }
  return String(value ?? "").trim();
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
    // A blank database row — one Enter press away in any Notion view — has no
    // usable slug, cannot collide with a local post, and must not be read as
    // colliding with the next blank row either.
    if (!isValidSlug(page.slug)) continue;
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

// The requests for exactly the posts the plan wants created, one entry per
// entry of `plan.create` and in the same order. Pure, so the whole run can be
// inspected before a single request goes out — including the Status shape,
// every fence language, and every one of Notion's size limits, all of which the
// API rejects the entire page for.
//
// Every post is measured, and every problem across every post is reported
// together: a run that stops on the first bad file has already created pages
// for the ones before it.
export function migrationRequests(
  plan: MigrationPlan,
  { dataSourceId, schema }: MigrationOptions,
): MigrationWrite[] {
  if (plan.create.length === 0) return [];

  const titleProperty = titlePropertyName(schema);
  const status = buildStatusProperty(schema);

  const problems: string[] = [];
  const writes: MigrationWrite[] = [];

  for (const post of plan.create) {
    let blocks: BlockObjectRequest[];
    try {
      blocks = normalizeBlocks(markdownToBlocks(post.content));
    } catch (error: unknown) {
      problems.push(
        `${post.file}: ${error instanceof Error ? error.message : String(error)}`,
      );
      continue;
    }

    const properties: Record<string, unknown> = {
      [titleProperty]: { title: normalizeRichText(text(post.title)) },
      Slug: { rich_text: normalizeRichText(text(post.slug)) },
      Excerpt: { rich_text: normalizeRichText(text(post.excerpt)) },
      Tags: { multi_select: post.tags.map((tag) => ({ name: tag })) },
      Status: status,
      Published: { date: { start: post.date } },
    };

    problems.push(...blockProblems(blocks, post.file));
    problems.push(...propertyProblems(properties, post.file));

    const { children, appends } = batchChildren(blocks);
    writes.push({
      slug: post.slug,
      file: post.file,
      page: {
        parent: { type: "data_source_id" as const, data_source_id: dataSourceId },
        properties,
        children,
      },
      appends,
    });
  }

  if (problems.length > 0) {
    throw new Error(
      `${problems.length} problem(s) Notion would reject — nothing created:\n` +
        problems.map((problem) => `  ${problem}`).join("\n"),
    );
  }

  return writes;
}

// A property value holds rich text under a key named after its own type, and
// the same element and character limits apply to it as to a block's.
function propertyProblems(
  properties: Record<string, unknown>,
  file: string,
): string[] {
  const problems: string[] = [];

  for (const [name, value] of Object.entries(properties)) {
    if (typeof value !== "object" || value === null) continue;
    for (const key of ["title", "rich_text"] as const) {
      const rich = (value as Record<string, unknown>)[key];
      if (Array.isArray(rich)) {
        problems.push(
          ...richTextProblems(rich as RichTextInput, `${file}: ${name}`),
        );
      }
    }
  }

  return problems;
}

// What one page takes to write, and what to do when only part of it lands.
export type MigrationExecutor = {
  // Creates the page and answers with its id.
  createPage(page: CreatePageRequest): Promise<string>;
  appendChildren(pageId: string, children: BlockObjectRequest[]): Promise<void>;
  archivePage(pageId: string): Promise<void>;
};

export type MigrationProgress = {
  slug: string;
  pageId: string;
  batches: number;
};

// Writes the planned pages, in order. A post's batches are strictly sequential
// because they are the order of its blocks, and the posts themselves are too,
// so the run stays inside the ~3 requests/second Notion allows an integration.
//
// A page whose remaining blocks fail to land is the case this exists for. Half
// a post under a live slug is worse than no post at all: the sync would publish
// it, and the next migration run would see the slug taken and skip the file
// forever. So the new page is moved to the trash, where it holds no slug and
// counts as no duplicate — which makes re-running the migration the recovery,
// exactly as it is for a run that never started the post. If even the trash
// call fails, the id is in the message, because the one thing that must not
// happen is a half-written page nobody knows about.
export async function runMigration(
  writes: readonly MigrationWrite[],
  executor: MigrationExecutor,
  onPage?: (progress: MigrationProgress) => void,
): Promise<MigrationProgress[]> {
  const written: MigrationProgress[] = [];

  for (const write of writes) {
    const pageId = await executor.createPage(write.page);

    for (const [index, batch] of write.appends.entries()) {
      try {
        await executor.appendChildren(pageId, batch);
      } catch (error: unknown) {
        throw await rollback(executor, write, pageId, index, error);
      }
    }

    const progress = {
      slug: write.slug,
      pageId,
      batches: write.appends.length,
    };
    written.push(progress);
    onPage?.(progress);
  }

  return written;
}

function reasonFor(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function rollback(
  executor: MigrationExecutor,
  write: MigrationWrite,
  pageId: string,
  index: number,
  cause: unknown,
): Promise<Error> {
  const failed =
    `${write.file}: the page was created, but block batch ${index + 1} of ` +
    `${write.appends.length} could not be appended (${reasonFor(cause)})`;

  try {
    await executor.archivePage(pageId);
  } catch (error: unknown) {
    return new Error(
      `${failed}, and the half-written page ${pageId} could not be moved to ` +
        `the trash either (${reasonFor(error)}) — delete it in Notion by hand ` +
        `before re-running, or two pages will claim the slug "${write.slug}"`,
    );
  }

  return new Error(
    `${failed} — the half-written page ${pageId} was moved to the Notion ` +
      "trash, so it holds no slug and re-running the migration is safe",
  );
}
