import matter from "gray-matter";
import type { BlockObjectRequest } from "@notionhq/client";
import { slugify, isValidSlug } from "./slug";
import {
  titlePropertyName,
  buildStatusProperty,
  DRAFT_STATUS,
  PUBLISHED_STATUS,
  type DataSourceSchema,
} from "./properties";
import { markdownToBlocks, plainRichText as text } from "./md-to-blocks";
import type { RichTextInput } from "./md-to-rich-text";
import type { MdBlock } from "./types";
import { matchBlockPrefix } from "./block-equality";
import { mapWithConcurrency } from "./pool";
import {
  batchBlocks,
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
// ambiguous stops the run before a single page is created.
//
// That leaves the window a try/catch cannot cover. A post longer than one
// request is a create and then a series of appends, and the process can be
// killed between any two of them — SIGKILL, a dropped VPN, a closed laptop.
// Nothing runs at that point: no rollback, no message, no trash call. Whatever
// recovery the script performs on a *caught* failure is simply not reached.
//
// The fix is therefore in what the database holds rather than in what the
// script does on the way down:
//
//   * a page is created as a DRAFT, which the sync never publishes, and is
//     promoted to Published in one request only after every one of its blocks
//     has landed. Published means finished, so nothing half-migrated is ever
//     visible on the site — however the run ended;
//   * a re-run reads every draft it finds and finishes it. Appending to a page
//     somebody else may have written is only safe if the blocks already there
//     are exactly the blocks this migration would have written first, so that
//     is the gate: same slug, same title, still a draft, and the page's blocks
//     an exact prefix of the post's (see block-equality.ts). Everything that
//     passes is appended to and promoted; anything that does not is reported
//     and left untouched, because a draft that is not ours is somebody's
//     writing.
//
// There is no marker property to lean on — the database schema is the one
// documented in docs/authoring.md and this script does not get to add columns —
// so the prefix, the title, the slug and the draft status together are the
// safety gate, and the cost of them being too strict is a message rather than
// an overwrite.
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
  // Both are load-bearing: a page is only resumed if it is still a draft and
  // still carries this post's title, so neither may be inferred.
  title: string;
  status: string;
  archived?: boolean;
  in_trash?: boolean;
};

export type MigrationMatch = { slug: string; pageId: string };

// A draft page this run is going to finish rather than create.
export type MigrationResume = { post: LocalPost; pageId: string };

export type MigrationPlan = {
  // Only ever non-empty when `errors` is empty: a plan that found a problem
  // cannot be half-acted on.
  create: LocalPost[];
  resume: MigrationResume[];
  skip: MigrationMatch[];
  archived: MigrationMatch[];
  // Live drafts no local file claims. Not a problem in itself — an author is
  // free to have drafts — but it is the signature of the one way this recovery
  // can still be lost: the content sync removes the .mdx of any post Notion has
  // not published, so a draft a killed run left behind outlives its own source
  // file if a sync runs before the migration does. Reported so a re-run says
  // which file to restore rather than silently having nothing to migrate.
  orphanDrafts: MigrationMatch[];
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

// One post, as the requests it takes to write it: the create-page request, the
// block batches that did not fit in it, and the blocks in full — which is what
// a resumed page is measured against. See limits.ts.
export type MigrationWrite = {
  slug: string;
  file: string;
  title: string;
  blocks: BlockObjectRequest[];
  page: CreatePageRequest;
  appends: BlockObjectRequest[][];
  // Set once a same-slug draft has been found and proved to be an unfinished
  // copy of this post: the page already exists, and `appends` holds only what
  // is missing from it.
  resume?: { pageId: string };
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
  // Matching against either one would bless it, so the run stops instead — and
  // that holds whether they are drafts, published, or one of each, because
  // nothing here can tell which of them the post is supposed to become.
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
  const resume: MigrationResume[] = [];

  for (const post of posts) {
    const claimants = bySlug.get(post.slug) ?? [];
    // Already reported above; classifying against one of two pages would pick
    // a winner nobody asked for.
    if (claimants.length > 1) continue;

    const existing = claimants[0];
    if (!existing) {
      create.push(post);
      continue;
    }

    if (existing.status === PUBLISHED_STATUS) {
      skip.push({ slug: post.slug, pageId: existing.pageId });
      continue;
    }

    if (existing.status !== DRAFT_STATUS) {
      errors.push(
        `${post.file}: page ${existing.pageId} claims slug "${post.slug}" and ` +
          `is ${existing.status === "" ? "in no status at all" : `"${existing.status}"`} — ` +
          `the migration only finishes its own "${DRAFT_STATUS}" pages and only ` +
          `skips "${PUBLISHED_STATUS}" ones, so this page is left alone; publish ` +
          "it, change its slug, or move it to the trash and run again",
      );
      continue;
    }

    // A draft under this slug is only this post's if it is also under this
    // post's title. The blocks are checked separately, once they have been
    // read (see planResumes).
    if (existing.title !== post.title) {
      errors.push(
        `${post.file}: draft page ${existing.pageId} claims slug "${post.slug}" ` +
          `under the title "${existing.title}", not "${post.title}" — it is not ` +
          "an unfinished copy of this post, so it was left alone",
      );
      continue;
    }

    resume.push({ post, pageId: existing.pageId });
  }

  const archived = pages
    .filter((page) => isTrashed(page))
    .map((page) => ({ slug: page.slug, pageId: page.pageId }));

  const claimed = new Set(posts.map((post) => post.slug));
  const orphanDrafts = live
    .filter(
      (page) =>
        page.status === DRAFT_STATUS &&
        isValidSlug(page.slug) &&
        !claimed.has(page.slug),
    )
    .map((page) => ({ slug: page.slug, pageId: page.pageId }));

  const clean = errors.length === 0;
  return {
    create: clean ? create : [],
    resume: clean ? resume : [],
    skip: clean ? skip : [],
    archived,
    orphanDrafts,
    errors,
  };
}

// The requests for exactly the posts the plan wants written — the ones to
// create and the drafts to finish, creates first and each group in plan order.
// Pure, so the whole run can be inspected before a single request goes out —
// including the Status shape, every fence language, and every one of Notion's
// size limits, all of which the API rejects the entire page for.
//
// Every post is measured, and every problem across every post is reported
// together: a run that stops on the first bad file has already created pages
// for the ones before it.
export function migrationRequests(
  plan: MigrationPlan,
  { dataSourceId, schema }: MigrationOptions,
): MigrationWrite[] {
  const work: MigrationResume[] = [
    ...plan.create.map((post) => ({ post, pageId: "" })),
    ...plan.resume,
  ];
  if (work.length === 0) return [];

  const titleProperty = titlePropertyName(schema);
  // Both values are built here, before anything is written: a database missing
  // the Published option would otherwise strand every draft this run creates.
  const draft = buildStatusProperty(schema, DRAFT_STATUS);
  buildStatusProperty(schema, PUBLISHED_STATUS);

  const problems: string[] = [];
  const writes: MigrationWrite[] = [];

  for (const { post, pageId } of work) {
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
      Status: draft,
      Published: { date: { start: post.date } },
    };

    problems.push(...blockProblems(blocks, post.file));
    problems.push(...propertyProblems(properties, post.file));

    const { children, appends } = batchChildren(blocks);
    writes.push({
      slug: post.slug,
      file: post.file,
      title: post.title,
      blocks,
      page: {
        parent: { type: "data_source_id" as const, data_source_id: dataSourceId },
        properties,
        children,
      },
      // A page that already exists is assumed to hold nothing until its blocks
      // have actually been read: planResumes narrows this to whatever turns out
      // to be missing, and assuming the least in the meantime is the assumption
      // that cannot lose a block.
      appends: pageId === "" ? appends : batchBlocks(blocks),
      ...(pageId === "" ? {} : { resume: { pageId } }),
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

export type ResumePlan = { writes: MigrationWrite[]; errors: string[] };

// Reads every draft the plan wants to finish and works out what is missing from
// it. A page is only resumable if what it already holds is an exact prefix of
// the post — same blocks, same order, same nested children — so a run that dies
// mid-post is finished by appending the rest, and a page somebody else wrote is
// reported instead.
//
// Reads only, and all of them before the first write, so one unresolvable draft
// stops the whole run rather than half of it. They are independent, so they go
// through the same bounded pool as the sync's rather than one at a time or all
// at once.
export async function planResumes(
  writes: readonly MigrationWrite[],
  readBlocks: (pageId: string) => Promise<MdBlock[]>,
): Promise<ResumePlan> {
  const resolved = await mapWithConcurrency(writes, async (write) => {
    if (!write.resume) return { write };

    const remote = await readBlocks(write.resume.pageId);
    const match = matchBlockPrefix(write.blocks, remote);

    if (match.kind === "diverged") {
      return {
        write,
        error:
          `${write.file}: draft page ${write.resume.pageId} claims slug ` +
          `"${write.slug}" but is not an unfinished copy of this post ` +
          `(${match.reason}) — it was left exactly as it is; publish it, change ` +
          "its slug, or move it to the trash, then run again",
      };
    }

    return {
      write: { ...write, appends: batchBlocks(write.blocks.slice(match.matched)) },
    };
  });

  const errors = resolved
    .map((entry) => entry.error)
    .filter((error): error is string => error !== undefined);

  return {
    writes: errors.length > 0 ? [] : resolved.map((entry) => entry.write),
    errors,
  };
}

export type PreparedMigration = {
  writes: MigrationWrite[];
  skip: MigrationMatch[];
  orphanDrafts: MigrationMatch[];
  errors: string[];
};

// Everything that happens before the first write, in the order it has to: the
// database is read, the posts are planned against it, every request is built
// and measured, and every draft that would be resumed is read and proved to be
// an unfinished copy of its post. Nothing here writes, so a run that reports
// errors has changed nothing at all.
//
// Content Notion would reject throws rather than being returned, because it is
// a problem with the files rather than with the state of the database.
export async function prepareMigration(
  posts: LocalPost[],
  pages: RemotePage[],
  options: MigrationOptions,
  readBlocks: (pageId: string) => Promise<MdBlock[]>,
): Promise<PreparedMigration> {
  const plan = planMigration(posts, pages);
  if (plan.errors.length > 0) {
    return {
      writes: [],
      skip: [],
      orphanDrafts: plan.orphanDrafts,
      errors: plan.errors,
    };
  }

  const resumed = await planResumes(migrationRequests(plan, options), readBlocks);
  return {
    writes: resumed.writes,
    skip: plan.skip,
    orphanDrafts: plan.orphanDrafts,
    errors: resumed.errors,
  };
}

// What one page takes to write.
export type MigrationExecutor = {
  // Creates the page — as a draft, because that is what the request says — and
  // answers with its id.
  createPage(page: CreatePageRequest): Promise<string>;
  appendChildren(pageId: string, children: BlockObjectRequest[]): Promise<void>;
  // Promotes a finished page to Published. The one write that makes a post
  // visible to the sync, and the last one made for it.
  publishPage(pageId: string): Promise<void>;
};

export type MigrationProgress = {
  slug: string;
  pageId: string;
  batches: number;
  resumed: boolean;
};

// Writes the planned pages, in order. A post's batches are strictly sequential
// because they are the order of its blocks, and the posts themselves are too,
// so the run stays inside the ~3 requests/second Notion allows an integration.
//
// Every page goes through the same three phases — exist, fill, publish — and a
// resumed page simply starts partway through the second. Nothing is published
// until it is whole, so a run that stops anywhere leaves drafts: invisible to
// the site, and finished by running the migration again.
//
// There is deliberately no rollback. Trashing a half-written page would throw
// away the blocks that did land, which the next run would otherwise pick up and
// carry on from — and it could never run at all for the failure that motivates
// all of this, a process that is killed rather than one that throws.
export async function runMigration(
  writes: readonly MigrationWrite[],
  executor: MigrationExecutor,
  onPage?: (progress: MigrationProgress) => void,
): Promise<MigrationProgress[]> {
  const written: MigrationProgress[] = [];

  for (const write of writes) {
    const resumed = write.resume !== undefined;
    const pageId = write.resume?.pageId ?? (await executor.createPage(write.page));

    try {
      for (const batch of write.appends) {
        await executor.appendChildren(pageId, batch);
      }
      await executor.publishPage(pageId);
    } catch (error: unknown) {
      throw unfinished(write, pageId, resumed, error);
    }

    const progress = {
      slug: write.slug,
      pageId,
      batches: write.appends.length,
      resumed,
    };
    written.push(progress);
    onPage?.(progress);
  }

  return written;
}

function reasonFor(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function unfinished(
  write: MigrationWrite,
  pageId: string,
  resumed: boolean,
  cause: unknown,
): Error {
  return new Error(
    `${write.file}: the ${resumed ? "draft" : "newly created"} page ${pageId} ` +
      `could not be finished (${reasonFor(cause)}) — it is still a ` +
      `"${DRAFT_STATUS}", so nothing on the site changed and no published post ` +
      `claims the slug "${write.slug}"; run the migration again to finish it`,
  );
}
