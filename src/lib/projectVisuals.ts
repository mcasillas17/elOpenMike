import type { Project } from "@/data/projects";

export const MARKS = [
  "THWIP!",
  "BAMF!",
  "ZAP!",
  "BOOM!",
  "KAPOW!",
  "SNIKT!",
] as const;

export type Tint = "cover" | "blue" | "red" | "green" | "purple";

const FALLBACK_TINTS: ReadonlyArray<Exclude<Tint, "cover">> = [
  "blue",
  "red",
  "green",
  "purple",
];

// Small stable string hash (DJB2). Same input → same output. Not crypto.
export function hashSlug(slug: string): number {
  let h = 5381;
  for (let i = 0; i < slug.length; i++) {
    h = ((h << 5) + h + slug.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function getTint(project: Project, index: number): Tint {
  if (index === 0) return "cover";
  const tags = new Set(project.tags);
  if (tags.has("AI") || tags.has("Full-stack")) return "blue";
  if (tags.has("Web app")) return "red";
  if (tags.has("Game") || tags.has("Unity")) return "green";
  if (tags.has("Open source")) return "purple";
  return FALLBACK_TINTS[hashSlug(project.slug) % FALLBACK_TINTS.length];
}

export function getMark(project: Project, index: number): string | null {
  const idx = hashSlug(project.slug) % MARKS.length;
  if (index === 0) return MARKS[idx];
  if (hashSlug(project.slug) % 100 >= 35) return null;
  return MARKS[idx];
}
