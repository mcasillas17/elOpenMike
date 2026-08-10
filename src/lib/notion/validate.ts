import type { PostFrontmatter } from "./types";
import { isValidSlug, slugify } from "./slug";

export type ValidatablePost = {
  slug: string;
  frontmatter: PostFrontmatter;
  body: string;
};

export const MAX_EXCERPT = 200;
// Notion stores a multi-select option's name; a comma is how it separates one
// option from the next, so a name carrying one cannot be stored at all, and a
// very long name is refused outright.
export const MAX_TAG_NAME = 100;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// A date is valid only if it round-trips: `2026-02-31` parses in JS but rolls
// over to March, which would silently mis-date a post.
export function isValidDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
  );
}

// A post's metadata in the one shape both directions can be measured in: what
// the sync publishes off a Notion page, and what the migration reads out of a
// content/blog/*.mdx file. `updated` is optional because a local file need not
// carry one — the sync derives it from the page's last_edited_time.
export type PostMetadata = {
  title: string;
  date: string;
  excerpt: string;
  tags: readonly string[];
  updated?: string;
};

// Every invariant one post's metadata has to satisfy, whichever direction it is
// travelling in. Messages carry no identifier: the caller knows whether this
// post is a slug or a file name, and says so.
//
// Sharing this is the whole point of the module. The sync refuses to write a
// post that breaks any of these, so a post the *migration* pushes into Notion
// carrying one is a post that never comes back out: it sits in the database,
// invisible on the site, while every sync from then on refuses the entire blog
// because of it. One function, called from both ends, is what keeps the two
// from drifting apart again.
export function metadataProblems(meta: PostMetadata): string[] {
  const problems: string[] = [];
  const { title, date, excerpt, updated } = meta;

  if (title.trim() === "") problems.push("title is empty");

  if (!isValidDate(date)) {
    problems.push(
      `date must be a valid YYYY-MM-DD value (got ${JSON.stringify(date)})`,
    );
  }

  if (excerpt.trim() === "") problems.push("excerpt is empty");
  else if (excerpt.length > MAX_EXCERPT) {
    problems.push(`excerpt is ${excerpt.length} chars (max ${MAX_EXCERPT})`);
  }

  // `updated` reaches the sitemap as <lastmod> and the article JSON-LD as
  // dateModified, both of which are dates to a crawler. A value that is not one
  // is published to them anyway — and, because a file whose content has not
  // changed keeps whatever `updated` it already had, it is then preserved
  // forever.
  //
  // Only its shape is checked. Ordering against `date` is not an invariant: a
  // post scheduled with a Published date in the future is edited before that
  // day arrives, so `updated` legitimately precedes `date`.
  if (updated !== undefined && updated !== "" && !isValidDate(updated)) {
    problems.push(
      `updated must be a valid YYYY-MM-DD value (got ${JSON.stringify(updated)})`,
    );
  }

  problems.push(...tagProblems(meta.tags));

  return problems;
}

// Tag names become both /blog/tag/<slug> urls and Notion multi-select options,
// so they have to survive both.
function tagProblems(tags: readonly string[]): string[] {
  const problems: string[] = [];

  for (const tag of tags) {
    if (tag.trim() === "") {
      problems.push("a tag is blank");
      continue;
    }
    if (tag.includes(",")) {
      problems.push(
        `tag ${JSON.stringify(tag)} contains a comma, which Notion uses to ` +
          "separate multi-select options and cannot store inside one",
      );
    }
    if (tag.length > MAX_TAG_NAME) {
      problems.push(
        `tag ${JSON.stringify(tag)} is ${tag.length} chars (max ${MAX_TAG_NAME})`,
      );
    }
    // A name with no alphanumerics slugifies to "" and renders a link to
    // /blog/tag/ — a 404 on every card that carries it, and a 404 url in the
    // sitemap.
    if (slugify(tag) === "") {
      problems.push(`tag ${JSON.stringify(tag)} has no url-safe characters`);
    }
  }

  return problems;
}

// Distinct names collapsing onto one slug (e.g. "C++" and "C#" both -> "c")
// would silently merge two tags onto a single page under one of the names.
// Only meaningful across a whole set of posts, so it is a pass of its own.
export function tagSlugCollisions(
  tagLists: readonly (readonly string[])[],
): string[] {
  const namesBySlug = new Map<string, Set<string>>();

  for (const tags of tagLists) {
    for (const tag of tags) {
      const slug = slugify(tag);
      if (slug === "") continue;
      const names = namesBySlug.get(slug) ?? new Set<string>();
      names.add(tag);
      namesBySlug.set(slug, names);
    }
  }

  return [...namesBySlug]
    .filter(([, names]) => names.size > 1)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([slug, names]) =>
        `tag slug "${slug}" is shared by ${[...names]
          .sort()
          .map((name) => JSON.stringify(name))
          .join(", ")}`,
    );
}

// Collects every problem across every post. The sync writes nothing unless this
// returns an empty array, so a malformed post can never reach production.
export function validatePosts(posts: ValidatablePost[]): string[] {
  const errors: string[] = [];

  for (const post of posts) {
    const at = (message: string) => `${post.slug}: ${message}`;

    errors.push(...metadataProblems(post.frontmatter).map(at));

    if (!isValidSlug(post.slug)) {
      errors.push(at("slug must be lowercase alphanumeric with single hyphens"));
    }
    if (post.body.trim() === "") errors.push(at("body is empty after conversion"));
  }

  errors.push(...tagSlugCollisions(posts.map((post) => post.frontmatter.tags)));

  const counts = new Map<string, number>();
  for (const post of posts) {
    counts.set(post.slug, (counts.get(post.slug) ?? 0) + 1);
  }
  for (const [slug, count] of counts) {
    if (count > 1) errors.push(`${slug}: duplicate slug (${count} posts share it)`);
  }

  return errors;
}

// A post as it is read off disk on the way *into* Notion. Structural rather
// than imported from migrate.ts, which imports this module.
export type MigratablePost = PostMetadata & { file: string; content: string };

// The same invariants, keyed by the file they came from rather than by a slug.
// Slug validity and two files claiming one slug are left to planMigration,
// which also knows what the database already holds and can say which page a
// slug is taken by.
export function validateLocalPosts(posts: readonly MigratablePost[]): string[] {
  const errors: string[] = [];

  for (const post of posts) {
    const at = (message: string) => `${post.file}: ${message}`;
    errors.push(...metadataProblems(post).map(at));
    if (post.content.trim() === "") errors.push(at("body is empty"));
  }

  errors.push(...tagSlugCollisions(posts.map((post) => post.tags)));

  return errors;
}

export type PublishedSource = { pageId: string; slug: string };

// A post's only identity on disk is its file name, so two Notion pages that
// claim the same slug are the same post as far as every later stage is
// concerned. validatePosts() cannot see the collision — it only receives the
// posts that rendered, so a run where one of the two fails looks perfectly
// ordinary while the survivor overwrites the other page's file (and, next run,
// the roles can swap). Run this over the published page metadata *before any
// block is fetched* so a collision costs nothing and changes nothing.
//
// The same page id twice is a query artifact, not a collision: it is one post.
export function validateSourceSlugs(sources: PublishedSource[]): string[] {
  const pageIdsBySlug = new Map<string, Set<string>>();

  for (const { pageId, slug } of sources) {
    const ids = pageIdsBySlug.get(slug) ?? new Set<string>();
    ids.add(pageId);
    pageIdsBySlug.set(slug, ids);
  }

  return [...pageIdsBySlug]
    .filter(([, ids]) => ids.size > 1)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([slug, ids]) =>
        `slug "${slug}" is claimed by ${ids.size} different Notion pages ` +
        `(${[...ids].sort().join(", ")}) — give each page its own Slug`,
    );
}
