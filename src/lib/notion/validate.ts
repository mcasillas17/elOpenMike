import type { PostFrontmatter } from "./types";
import { isValidSlug, slugify } from "./slug";

export type ValidatablePost = {
  slug: string;
  frontmatter: PostFrontmatter;
  body: string;
};

const MAX_EXCERPT = 200;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// A date is valid only if it round-trips: `2026-02-31` parses in JS but rolls
// over to March, which would silently mis-date a post.
function isValidDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
  );
}

// Collects every problem across every post. The sync writes nothing unless this
// returns an empty array, so a malformed post can never reach production.
export function validatePosts(posts: ValidatablePost[]): string[] {
  const errors: string[] = [];
  // Tag slug → the distinct names that produced it, so a collision can name both.
  const tagNamesBySlug = new Map<string, Set<string>>();

  for (const post of posts) {
    const at = (message: string) => `${post.slug}: ${message}`;
    const { title, date, excerpt } = post.frontmatter;

    if (title.trim() === "") errors.push(at("title is empty"));
    if (!isValidDate(date)) {
      errors.push(
        at(
          `date must be a valid YYYY-MM-DD value (got ${JSON.stringify(date)})`,
        ),
      );
    }
    if (excerpt.trim() === "") errors.push(at("excerpt is empty"));
    else if (excerpt.length > MAX_EXCERPT) {
      errors.push(at(`excerpt is ${excerpt.length} chars (max ${MAX_EXCERPT})`));
    }
    if (!isValidSlug(post.slug)) {
      errors.push(at("slug must be lowercase alphanumeric with single hyphens"));
    }
    if (post.body.trim() === "") errors.push(at("body is empty after conversion"));

    // Tag names become /blog/tag/<slug> urls. A name with no alphanumerics
    // slugifies to "" and renders a link to /blog/tag/ — a 404 on every card
    // that carries it, and a 404 url in the sitemap.
    for (const tag of post.frontmatter.tags) {
      const slug = slugify(tag);
      if (slug === "") {
        errors.push(
          at(`tag ${JSON.stringify(tag)} has no url-safe characters`),
        );
        continue;
      }
      const names = tagNamesBySlug.get(slug) ?? new Set<string>();
      names.add(tag);
      tagNamesBySlug.set(slug, names);
    }
  }

  // Distinct names collapsing onto one slug (e.g. "C++" and "C#" both -> "c")
  // would silently merge two tags onto a single page under one of the names.
  for (const [slug, names] of tagNamesBySlug) {
    if (names.size > 1) {
      errors.push(
        `tag slug "${slug}" is shared by ${[...names]
          .sort()
          .map((name) => JSON.stringify(name))
          .join(", ")}`,
      );
    }
  }

  const counts = new Map<string, number>();
  for (const post of posts) {
    counts.set(post.slug, (counts.get(post.slug) ?? 0) + 1);
  }
  for (const [slug, count] of counts) {
    if (count > 1) errors.push(`${slug}: duplicate slug (${count} posts share it)`);
  }

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
