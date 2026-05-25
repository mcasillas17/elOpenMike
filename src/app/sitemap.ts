import type { MetadataRoute } from "next";
import { getAllSlugs } from "@/data/projects";
import { getPostSlugs } from "@/lib/blog";

const BASE = "https://elopenmike.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const staticPaths = ["", "/projects", "/comedy", "/blog", "/contact"];
  const entries: MetadataRoute.Sitemap = staticPaths.map((p) => ({
    url: `${BASE}${p}`,
    lastModified: now,
  }));
  for (const slug of getAllSlugs()) {
    entries.push({ url: `${BASE}/projects/${slug}`, lastModified: now });
  }
  for (const slug of getPostSlugs()) {
    entries.push({ url: `${BASE}/blog/${slug}`, lastModified: now });
  }
  return entries;
}
