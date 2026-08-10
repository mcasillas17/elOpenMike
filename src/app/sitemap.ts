import type { MetadataRoute } from "next";
import { getAllSlugs } from "@/data/projects";
import { getAllPosts, getAllTags } from "@/lib/blog";
import { absoluteUrl, routes } from "@/lib/site";

// Fallback used when no blog posts exist yet (or none have a date). Bump
// when you ship a redesign or a content refresh that doesn't include a post.
const SITE_FALLBACK_UPDATED = "2026-05-31";

function siteLastModified(latestPostDate: string | undefined): Date {
  return new Date(latestPostDate ?? SITE_FALLBACK_UPDATED);
}

export default function sitemap(): MetadataRoute.Sitemap {
  const posts = getAllPosts();
  // getAllPosts sorts newest-first, so posts[0] is the most recent.
  const siteUpdated = siteLastModified(posts[0]?.date);

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
    entries.push({
      url: absoluteUrl(routes.blogPost(post.slug)),
      lastModified: post.date ? new Date(post.date) : siteUpdated,
    });
  }
  return entries;
}
