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

  it("includes WebSnag as the newest portrait case study", () => {
    const project = getProject("websnag");

    expect(project).toBeDefined();
    expect(projects[0]).toBe(project);
    expect(project).toMatchObject({
      title: "WebSnag",
      year: "2026",
      tags: ["Android", "Productivity", "Open source"],
      stack: [
        "Kotlin",
        "Jetpack Compose",
        "NFC",
        "AccessibilityService",
        "DataStore",
      ],
      repoUrl: "https://github.com/mcasillas17/WebSnag",
      mediaLayout: "portrait",
      images: [
        "/images/projects/websnag-dashboard.png",
        "/images/projects/websnag-profiles.png",
        "/images/projects/websnag-nfc-enrollment.png",
        "/images/projects/websnag-blocker.png",
      ],
    });
    expect(project?.liveUrl).toBeUndefined();
    expect(project?.caseStudy).toBeDefined();
  });

  it("keeps Mexican Mom as a source-only project", () => {
    const project = getProject("mexican-mom");

    expect(project).toBeDefined();
    expect(project?.repoUrl).toBe(
      "https://github.com/mcasillas17/mexican-mom",
    );
    expect(project?.images).toEqual([]);
    expect(project?.liveUrl).toBeUndefined();
    expect(project?.caseStudy).toBeUndefined();
  });

  it("getProject returns the matching project or undefined", () => {
    expect(getProject(projects[0].slug)?.slug).toBe(projects[0].slug);
    expect(getProject("definitely-not-a-slug")).toBeUndefined();
  });

  it("getAllSlugs covers every project", () => {
    expect(getAllSlugs().sort()).toEqual(projects.map((p) => p.slug).sort());
  });

  it("gives the flagship case studies complete evidence", () => {
    for (const slug of ["websnag", "turingagent", "thwiply"]) {
      const caseStudy = getProject(slug)?.caseStudy;

      expect(caseStudy).toBeDefined();
      expect(caseStudy?.problem).toBeTruthy();
      expect(caseStudy?.whatIBuilt.length).toBeGreaterThan(0);
      expect(caseStudy?.constraints.length).toBeGreaterThan(0);
      expect(caseStudy?.architecture.nodes.length).toBeGreaterThan(1);
      expect(caseStudy?.decisions.length).toBeGreaterThan(0);
      expect(caseStudy?.verification.length).toBeGreaterThan(0);
      expect(caseStudy?.status).toBeTruthy();
      expect(caseStudy?.lessons.length).toBeGreaterThan(0);
      expect(caseStudy?.evidence.length).toBeGreaterThan(0);
    }
  });
});
