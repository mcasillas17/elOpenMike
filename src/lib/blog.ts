import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

export type PostMeta = {
  slug: string;
  title: string;
  date: string; // ISO
  excerpt: string;
  tags: string[];
  readingMinutes: number;
  updated?: string; // ISO; absent on posts that have never been revised
};

const BLOG_DIR = path.join(process.cwd(), "content", "blog");

function readingMinutes(body: string): number {
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

export function getPostSlugs(): string[] {
  if (!fs.existsSync(BLOG_DIR)) return [];
  return fs
    .readdirSync(BLOG_DIR)
    .filter((f) => f.endsWith(".mdx"))
    .map((f) => f.replace(/\.mdx$/, ""));
}

export function getPost(
  slug: string,
): { meta: PostMeta; body: string } | undefined {
  const file = path.join(BLOG_DIR, `${slug}.mdx`);
  // Guard against path traversal (e.g. slug "../../.env") — stay inside BLOG_DIR.
  if (!file.startsWith(BLOG_DIR + path.sep)) return undefined;
  if (!fs.existsSync(file)) return undefined;
  const { data, content } = matter(fs.readFileSync(file, "utf8"));
  const meta: PostMeta = {
    slug,
    title: String(data.title ?? slug),
    date: String(data.date ?? ""),
    excerpt: String(data.excerpt ?? ""),
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    updated: data.updated ? String(data.updated) : undefined,
    readingMinutes: readingMinutes(content),
  };
  return { meta, body: content };
}

// Invalid dates sort last rather than throwing. Synced posts are validated
// upstream, but the loader must not depend on that.
function timestamp(date: string): number {
  const value = new Date(date).getTime();
  return Number.isNaN(value) ? -Infinity : value;
}

// Newest first. Posts sharing a date are ordered by slug: the sequence comes
// from readdir, whose order is filesystem-dependent, so without a tie-breaker
// two posts published the same day could swap places between machines — and
// with them the feed, the tag pages, and every prev/next link.
export function getAllPosts(): PostMeta[] {
  return getPostSlugs()
    .map((slug) => getPost(slug)?.meta)
    .filter((m): m is PostMeta => m !== undefined)
    .sort(
      (a, b) =>
        timestamp(b.date) - timestamp(a.date) || a.slug.localeCompare(b.slug),
    );
}

// URL-safe form of a tag name. Kept here so routes and listings agree.
export function tagSlug(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getAllTags(): { name: string; slug: string; count: number }[] {
  const seen = new Map<string, { name: string; slug: string; count: number }>();
  for (const post of getAllPosts()) {
    for (const name of post.tags) {
      const slug = tagSlug(name);
      const existing = seen.get(slug);
      if (existing) existing.count += 1;
      else seen.set(slug, { name, slug, count: 1 });
    }
  }
  return [...seen.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}

export function getPostsByTag(slug: string): PostMeta[] {
  return getAllPosts().filter((post) => post.tags.map(tagSlug).includes(slug));
}

export function getRelatedPosts(slug: string, limit = 3): PostMeta[] {
  if (limit <= 0) return [];

  const posts = getAllPosts();
  const current = posts.find((post) => post.slug === slug);
  if (!current) return [];

  const currentTags = new Set(current.tags.map(tagSlug));
  return posts
    .filter((post) => post.slug !== slug)
    .map((post) => ({
      post,
      shared: post.tags
        .map(tagSlug)
        .filter((tag) => currentTags.has(tag)).length,
    }))
    .filter(({ shared }) => shared > 0)
    .sort(
      (a, b) =>
        b.shared - a.shared ||
        timestamp(b.post.date) - timestamp(a.post.date) ||
        a.post.slug.localeCompare(b.post.slug),
    )
    .slice(0, Math.floor(limit))
    .map(({ post }) => post);
}

// Posts are newest-first, so `prev` is the newer neighbour and `next` the older.
export function getAdjacentPosts(slug: string): {
  prev?: PostMeta;
  next?: PostMeta;
} {
  const posts = getAllPosts();
  const index = posts.findIndex((post) => post.slug === slug);
  if (index === -1) return {};
  return { prev: posts[index - 1], next: posts[index + 1] };
}
