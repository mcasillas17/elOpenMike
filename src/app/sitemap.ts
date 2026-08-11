import type { MetadataRoute } from "next";
import { getAllSlugs } from "@/data/projects";
import { getAllPosts, getAllTags, type PostMeta } from "@/lib/blog";
import { absoluteUrl, routes } from "@/lib/site";

// Fallback used when no blog posts exist yet (or none have a date). Bump
// when you ship a redesign or a content refresh that doesn't include a post.
const SITE_FALLBACK_UPDATED = "2026-05-31";

// A revised post's `updated` is what crawlers should see as <lastmod>; its
// publication date only stands in when the post has never been revised.
function effectiveModified(post: PostMeta): string {
  return post.updated || post.date;
}

function siteLastModified(posts: PostMeta[]): Date {
  const newest = posts
    .map((post) => new Date(effectiveModified(post)).getTime())
    .filter((time) => !Number.isNaN(time))
    .reduce((max, time) => Math.max(max, time), -Infinity);
  return newest === -Infinity
    ? new Date(SITE_FALLBACK_UPDATED)
    : new Date(newest);
}

export default function sitemap(): MetadataRoute.Sitemap {
  const posts = getAllPosts();
  // Posts are sorted by publication date, so a post revised after the newest
  // publication would be missed by posts[0] alone — scan them all.
  const siteUpdated = siteLastModified(posts);

  const staticPaths = [
    routes.home,
    routes.projects,
    routes.comedy,
    routes.blog,
  ];
  const entries: MetadataRoute.Sitemap = staticPaths.map((p) => ({
    url: absoluteUrl(p),
    lastModified: siteUpdated,
  }));
  for (const slug of getAllSlugs()) {
    entries.push({
      url: absoluteUrl(routes.projectDetail(slug)),
      lastModified: siteUpdated,
    });
  }
  for (const tag of getAllTags()) {
    entries.push({
      url: absoluteUrl(routes.blogTag(tag.slug)),
      lastModified: siteUpdated,
    });
  }
  for (const post of posts) {
    const modified = effectiveModified(post);
    entries.push({
      url: absoluteUrl(routes.blogPost(post.slug)),
      lastModified: modified ? new Date(modified) : siteUpdated,
    });
  }
  return entries;
}
