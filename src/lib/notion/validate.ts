import type { PostFrontmatter } from "./types";
import { isValidSlug, slugFilenameProblems, slugify } from "./slug";

export type ValidatablePost = {
  // Notion's own id for the page this post came off. Opaque, stable, and the
  // one identifier for a post that is not itself something an author typed —
  // which is what makes it the one safe thing to put in front of a message. See
  // the note above validatePosts.
  pageId: string;
  slug: string;
  frontmatter: PostFrontmatter;
  body: string;
};

export const MAX_EXCERPT = 200;
// Notion stores a multi-select option's name; a comma is how it separates one
// option from the next, so a name carrying one cannot be stored at all, and a
// very long name is refused outright.
export const MAX_TAG_NAME = 100;
export const MAX_TAG_OPTIONS = 100;

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
  // `unknown` for the same reason `tags` is: on the way *into* Notion these are
  // whatever YAML parsed out of a file anyone can edit, and the one thing this
  // module must never do is coerce one into a plausible string. The sync's own
  // direction always passes real strings.
  title: unknown;
  date: unknown;
  excerpt: unknown;
  tags: unknown;
  updated?: unknown;
};

// Nothing below ever repeats a value.
//
// Every message here is printed into a public GitHub Actions log, and every
// value it could quote came out of a Notion page or a frontmatter block that
// anyone with edit access can write: a slug is a url someone pasted before it
// was tidied, a title is whatever was typed, an excerpt is a paste out of a
// document, a tag is a word from a picker. The ones that reach a refusal are by
// definition the odd ones — the date that will not parse because a query string
// is still stuck to it, the tag with a comma in it because it came out of a
// config file — so quoting them published exactly the values worth not
// publishing.
//
// What a message may carry is what identifies the problem rather than what it
// holds: the field's name, the page id or file it is on, an index into a list,
// a length, a count, and a category of what is wrong. Everything a person needs
// in order to open the right page and look at the right line, and nothing they
// could not already see there.

// What a value is, without repeating what it says.
function describeType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "a list";
  return typeof value === "object" ? "a mapping" : `a ${typeof value}`;
}

// Text the author wrote, or the reason it is not text. A title or an excerpt
// that YAML parsed as a sequence, a mapping, a number, a boolean or a null is
// refused here rather than being turned into "A,B", "[object Object]", "42" or
// "true" — each of which would be written into Notion as the post's own title
// and published to the site as though somebody had typed it.
function textProblems(value: unknown, name: string): string[] {
  if (typeof value !== "string") {
    return [
      `${name} must be text written as a string (the frontmatter holds ` +
        `${describeType(value)})`,
    ];
  }
  return value.trim() === "" ? [`${name} is empty`] : [];
}

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

  problems.push(...textProblems(title, "title"));
  problems.push(...dateProblems(date, "date"));

  problems.push(...textProblems(excerpt, "excerpt"));
  if (typeof excerpt === "string" && excerpt.length > MAX_EXCERPT) {
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
  if (updated !== undefined && updated !== "") {
    problems.push(...dateProblems(updated, "updated"));
  }

  problems.push(...tagProblems(meta.tags));

  return problems;
}

// A day, or the reason this is not one. A value that is not text at all cannot
// be narrowed to a day and must never be stringified into something that looks
// like one — `["2026-05-20"]` stringifies to exactly the day it is not.
//
// The value itself is never repeated: a date that will not parse is very often
// one with something else stuck to it, which is precisely the case where what
// is stuck to it should not be published. Saying which of the two ways it is
// wrong is what fixing it needs, and it is more than quoting ever said.
function dateProblems(value: unknown, name: string): string[] {
  if (typeof value !== "string") {
    return [
      `${name} must be a YYYY-MM-DD value written as a string (the ` +
        `frontmatter holds ${describeType(value)})`,
    ];
  }
  if (isValidDate(value)) return [];

  const shaped = ISO_DATE.test(value);
  return [
    `${name} must be a valid YYYY-MM-DD value (` +
      (shaped
        ? "it is written as YYYY-MM-DD but names a day that does not exist"
        : `the frontmatter holds a ${value.length}-character string that is ` +
          "not a YYYY-MM-DD day") +
      ")",
  ];
}

// Tag names become both /blog/tag/<slug> urls and Notion multi-select options,
// so they have to survive both. Each one is named by its position in the list —
// a name is a value like any other, and a tag that reaches a refusal is the one
// somebody pasted.
function tagProblems(tags: unknown): string[] {
  const problems: string[] = [];
  if (!Array.isArray(tags)) {
    return ["tags must be an array of strings"];
  }
  if (tags.length > MAX_TAG_OPTIONS) {
    problems.push(
      `tags has ${tags.length} options (max ${MAX_TAG_OPTIONS} per Notion multi-select request)`,
    );
  }

  const seen = new Set<string>();

  for (const [index, tag] of tags.entries()) {
    const at = `tag #${index + 1}`;
    if (typeof tag !== "string") {
      problems.push(`${at} must be a string`);
      continue;
    }
    if (seen.has(tag)) {
      problems.push(`${at} repeats a tag already on this post`);
      continue;
    }
    seen.add(tag);

    if (tag.trim() === "") {
      problems.push(`${at} is blank`);
      continue;
    }
    if (tag.includes(",")) {
      problems.push(
        `${at} contains a comma, which Notion uses to separate multi-select ` +
          "options and cannot store inside one",
      );
    }
    if (tag.length > MAX_TAG_NAME) {
      problems.push(`${at} is ${tag.length} chars (max ${MAX_TAG_NAME})`);
    }
    // A name with no alphanumerics slugifies to "" and renders a link to
    // /blog/tag/ — a 404 on every card that carries it, and a 404 url in the
    // sitemap.
    if (slugify(tag) === "") {
      problems.push(`${at} has no url-safe characters`);
    }
  }

  return problems;
}

// One post's tags, named by whatever the caller identifies a post with: a page
// id on the way out of Notion, a file name on the way in.
export type TaggedSource = { id: string; tags: unknown };

// Distinct names collapsing onto one slug (e.g. "C++" and "C#" both -> "c")
// would silently merge two tags onto a single page under one of the names.
// Only meaningful across a whole set of posts, so it is a pass of its own.
//
// The colliding names are what a person has to change, and they are exactly
// what this may not print — so it names the posts carrying them instead, which
// is where those names can be read and edited anyway.
export function tagSlugCollisions(sources: readonly TaggedSource[]): string[] {
  const bySlug = new Map<string, { names: Set<string>; ids: Set<string> }>();

  for (const { id, tags } of sources) {
    if (!Array.isArray(tags)) continue;
    for (const tag of tags) {
      if (typeof tag !== "string") continue;
      const slug = slugify(tag);
      if (slug === "") continue;
      const entry = bySlug.get(slug) ?? { names: new Set(), ids: new Set() };
      entry.names.add(tag);
      entry.ids.add(id);
      bySlug.set(slug, entry);
    }
  }

  return [...bySlug]
    .filter(([, entry]) => entry.names.size > 1)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([, entry]) =>
        `${entry.names.size} different tag names collapse onto one tag slug ` +
        `(on ${[...entry.ids].sort().join(", ")}) — /blog/tag/ has one page ` +
        "for them all, so rename all but one",
    );
}

// Collects every problem across every post. The sync writes nothing unless this
// returns an empty array, so a malformed post can never reach production.
//
// Keyed by the page's Notion id rather than by its slug: a slug is a value
// somebody typed into the page, and this is the one message that has to name a
// post whose metadata is the thing being refused.
export function validatePosts(posts: ValidatablePost[]): string[] {
  const errors: string[] = [];

  for (const post of posts) {
    const at = (message: string) => `page ${post.pageId}: ${message}`;

    errors.push(...metadataProblems(post.frontmatter).map(at));

    if (!isValidSlug(post.slug)) {
      errors.push(at("slug must be lowercase alphanumeric with single hyphens"));
    }
    // Measured before a single path is planned: the write that would fail is
    // one of many, and the ones before it have already landed by then.
    errors.push(...slugFilenameProblems(post.slug).map(at));
    if (post.body.trim() === "") errors.push(at("body is empty after conversion"));
  }

  errors.push(
    ...tagSlugCollisions(
      posts.map((post) => ({ id: `page ${post.pageId}`, tags: post.frontmatter.tags })),
    ),
  );

  const pagesBySlug = new Map<string, Set<string>>();
  for (const post of posts) {
    const ids = pagesBySlug.get(post.slug) ?? new Set<string>();
    ids.add(post.pageId);
    pagesBySlug.set(post.slug, ids);
  }
  for (const [, ids] of [...pagesBySlug].sort(([a], [b]) => a.localeCompare(b))) {
    if (ids.size > 1) {
      errors.push(
        `${ids.size} posts share one slug (pages ${[...ids].sort().join(", ")})`,
      );
    }
  }

  return errors;
}

// A post as it is read off disk on the way *into* Notion. Structural rather
// than imported from migrate.ts, which imports this module.
export type MigratablePost = PostMetadata & {
  file: string;
  content: string;
  rawTags?: { value: unknown };
  rawTitle?: { value: unknown };
  rawExcerpt?: { value: unknown };
  rawDate?: { value: unknown };
  rawUpdated?: { value: unknown };
};

function localTagInput(post: MigratablePost): unknown {
  return post.rawTags === undefined ? post.tags : post.rawTags.value;
}

// The value the file itself carries. A key the file does not have at all is
// answered by what toLocalPost fell back to — the file name for a title, ""
// for an excerpt — because a post with no `title:` line still has a title,
// while a `title:` holding a sequence is a different thing entirely.
function authoredInput(
  raw: { value: unknown } | undefined,
  fallback: unknown,
): unknown {
  return raw === undefined || raw.value === undefined ? fallback : raw.value;
}

// A date reaches this already narrowed to the day the file names (see
// migrate.ts), so the narrowed value is the one to check — a valid timestamp
// must not be refused for being a timestamp. The raw value is only consulted
// when it is not text at all, which is the one case narrowing cannot express
// and the one case a message has to describe rather than quote.
function authoredDateInput(
  raw: { value: unknown } | undefined,
  narrowed: unknown,
): unknown {
  const value = raw?.value;
  return value === undefined || typeof value === "string" ? narrowed : value;
}

// The same invariants, keyed by the file they came from rather than by a slug.
// Slug validity and two files claiming one slug are left to planMigration,
// which also knows what the database already holds and can say which page a
// slug is taken by.
export function validateLocalPosts(posts: readonly MigratablePost[]): string[] {
  const errors: string[] = [];

  for (const post of posts) {
    const at = (message: string) => `${post.file}: ${message}`;
    errors.push(
      ...metadataProblems({
        ...post,
        title: authoredInput(post.rawTitle, post.title),
        excerpt: authoredInput(post.rawExcerpt, post.excerpt),
        date: authoredDateInput(post.rawDate, post.date),
        ...(post.updated === undefined
          ? {}
          : { updated: authoredDateInput(post.rawUpdated, post.updated) }),
        tags: localTagInput(post),
      }).map(at),
    );
    if (post.content.trim() === "") errors.push(at("body is empty"));
  }

  errors.push(
    ...tagSlugCollisions(
      posts.map((post) => ({ id: post.file, tags: localTagInput(post) })),
    ),
  );

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
//
// The pages are named and the slug they are fighting over is not: it is a value
// somebody typed into a property, and the pages are where it can be read.
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
      ([, ids]) =>
        `${ids.size} different Notion pages claim one slug ` +
        `(${[...ids].sort().join(", ")}) — give each page its own Slug`,
    );
}
