import type { PostFrontmatter } from "./types";
import { isValidSlug } from "./slug";

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
