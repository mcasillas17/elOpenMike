import { describe, it, expect } from "vitest";
import { projects, getProject, getAllSlugs } from "@/data/projects";

describe("projects data", () => {
  it("has well-formed entries", () => {
    expect(projects.length).toBeGreaterThan(0);
    for (const p of projects) {
      expect(p.slug).toBeTruthy();
      expect(p.title).toBeTruthy();
      expect(p.summary).toBeTruthy();
      expect(p.year).toBeTruthy();
      expect(Array.isArray(p.tags)).toBe(true);
      expect(Array.isArray(p.stack)).toBe(true);
      expect(Array.isArray(p.highlights)).toBe(true);
      expect(Array.isArray(p.images)).toBe(true);
    }
  });

  it("has unique slugs", () => {
    const slugs = projects.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("getProject returns the matching project or undefined", () => {
    expect(getProject(projects[0].slug)?.slug).toBe(projects[0].slug);
    expect(getProject("definitely-not-a-slug")).toBeUndefined();
  });

  it("getAllSlugs covers every project", () => {
    expect(getAllSlugs().sort()).toEqual(projects.map((p) => p.slug).sort());
  });
});
