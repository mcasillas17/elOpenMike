import { projects } from "../data/projects";

export type ProjectReferencesResult =
  | { ok: true; projects: string[] }
  | { ok: false; error: string };

const MAX_PROJECT_REFERENCES = 100;
const projectSlugs = new Map(
  projects.flatMap((project): [string, string][] => [
    [project.slug.toLowerCase(), project.slug],
    [project.title.toLowerCase(), project.slug],
  ]),
);

export function readProjectReferences(value: unknown): ProjectReferencesResult {
  if (value === undefined) return { ok: true, projects: [] };
  if (!Array.isArray(value)) {
    return {
      ok: false,
      error: "projects must be an array of project titles or slugs",
    };
  }
  if (value.length > MAX_PROJECT_REFERENCES) {
    return { ok: false, error: "projects must contain at most 100 references" };
  }

  const resolved = new Set<string>();
  for (const reference of value) {
    if (typeof reference !== "string" || reference.trim() === "") {
      return { ok: false, error: "projects must contain only non-empty strings" };
    }
    const slug = projectSlugs.get(reference.trim().toLowerCase());
    if (slug === undefined) {
      return {
        ok: false,
        error: "projects contains an unknown public project reference",
      };
    }
    resolved.add(slug);
  }
  return { ok: true, projects: [...resolved] };
}
