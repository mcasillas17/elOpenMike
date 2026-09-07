import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { projects, projectCategories, featuredProjects, getProject, getAllSlugs } from "@/data/projects";

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

  it("curates six featured projects in the approved order", () => {
    expect(featuredProjects.map((project) => project.slug)).toEqual([
      "scorearc", "wallcrawl", "turingcare", "websnag", "turingagent", "watchslinger",
    ]);
  });

  it("adds five curated entries without changing existing archive issue numbers", () => {
    expect(projects).toHaveLength(13);
    expect(Object.fromEntries(projects.map((project, index) => [
      project.slug, String(projects.length - index).padStart(2, "0"),
    ]))).toEqual({
      watchslinger: "13",
      "webslinger-cli": "12",
      "coding-skills": "11",
      "panda-path": "10",
      prehispanicapp: "09",
      scorearc: "08",
      wallcrawl: "07",
      websnag: "06",
      "mexican-mom": "05",
      thwiply: "04",
      turingagent: "03",
      turingcare: "02",
      "light-master": "01",
    });
  });

  it("assigns every project to exactly one public archive category", () => {
    expect(projectCategories).toEqual([
      { id: "products", label: "Products" },
      { id: "developer-tools", label: "Developer tools" },
      { id: "games", label: "Games" },
    ]);
    for (const project of projects) {
      expect(projectCategories.map((category) => category.id)).toContain(project.category);
    }
    expect(projects.filter((project) => project.category === "games").map((project) => project.slug)).toEqual([
      "panda-path", "prehispanicapp", "light-master",
    ]);
  });

  it.each([
    ["watchslinger", "Watchslinger", "2026"],
    ["webslinger-cli", "WebSlinger-CLI", "2026"],
    ["coding-skills", "coding-skills", "2026"],
    ["panda-path", "Panda_Path", "2018"],
    ["prehispanicapp", "PrehispanicApp", "2018"],
  ])("gives %s a source-backed year and an explicitly conceptual preview", (slug, repo, year) => {
    const project = getProject(slug);
    expect(project).toMatchObject({
      year, repoUrl: `https://github.com/mcasillas17/${repo}`,
      images: [], preview: { kind: "flow", label: expect.stringMatching(/concept/i) },
    });
    expect(project?.liveUrl).toBeUndefined();
    expect(project?.vision).toBeTruthy();
    expect(project?.cardSummary?.length).toBeLessThan(180);
  });

  it("credits Watchy's foundation rather than claiming a wholly original wearable", () => {
    expect(getProject("watchslinger")?.summary).toMatch(/built on Watchy/);
    expect(getProject("watchslinger")?.stack).toEqual([
      "C++", "Arduino", "PlatformIO", "ESP32-S3", "E-paper",
    ]);
  });

  it("introduces ScoreArc through football features and a separate vision", () => {
    const project = getProject("scorearc");
    expect(project).toMatchObject({
      title: "ScoreArc",
      liveUrl: "https://www.scorearc.futbol/en/c/world-cup/2026",
      repoUrl: "https://github.com/mcasillas17/ScoreArc",
      images: ["/images/projects/scorearc-world-cup.webp"],
      imageFit: "contain",
    });
    expect(project?.vision).toMatch(/football/i);
    expect(project?.caseStudy).toBeUndefined();
  });

  it("introduces WallCrawl through training features and a separate vision", () => {
    const project = getProject("wallcrawl");
    expect(project).toMatchObject({
      title: "WallCrawl",
      repoUrl: "https://github.com/mcasillas17/WallCrawl",
      mediaLayout: "portrait",
      images: [
        "/images/projects/wallcrawl-today.webp",
        "/images/projects/wallcrawl-active-workout.webp",
        "/images/projects/wallcrawl-progress.webp",
      ],
    });
    expect(project?.liveUrl).toBeUndefined();
    expect(project?.vision).toMatch(/private.*on-device.*companion/i);
    expect(project?.caseStudy).toBeUndefined();
  });

  it("keeps public project copy about purpose, features, and vision", () => {
    for (const project of projects) {
      expect(project.vision).toBeTruthy();
      const publicCopy = [
        project.summary, project.cardSummary, ...project.highlights, project.vision,
      ].join(" ");
      expect(publicCopy).not.toMatch(/v1 scaffold|currently a scaffold|source revision|snapshot reviewed|cutover|FakeWorkoutPlanner|no production|public roadmap/i);
    }
  });

  it("shows TuringCare's public website and accurate web stack", () => {
    const project = getProject("turingcare");
    expect(project).toMatchObject({
      liveUrl: "https://turingcare.dog/",
      repoUrl: "https://github.com/mcasillas17/TuringCare",
      images: [
        "/images/projects/turingcare-website.webp",
        "/images/projects/turingcare-behavior-brief.webp",
      ],
      imageFit: "contain",
      mediaCredit: { href: "/images/projects/CREDITS.md" },
    });
    expect(project?.stack).toEqual([
      "TypeScript", "React", "Vite", "React Router", "TanStack Query",
      "Hono", "Drizzle", "PostgreSQL", "Better Auth", "i18next",
    ]);
    const features = project?.highlights.join(" ");
    expect(features).toMatch(/journal/i);
    expect(features).toMatch(/goals.*skills.*weekly/i);
    expect(features).toMatch(/trainers.*courses/i);
    expect(features).toMatch(/Behavior Brief.*PDF/i);
    expect(features).toMatch(/English.*Spanish/i);
    expect(project?.mediaCredit?.label).toMatch(/public.*Behavior Brief.*explanation/i);
  });

  it("describes Thwiply's persistent manual tasks and current on-device providers", () => {
    const project = getProject("thwiply");
    expect(project?.summary).toMatch(/Today tasks/);
    expect(project?.stack).toEqual([
      "Kotlin", "Jetpack Compose", "Room", "Hilt", "Coroutines", "LiteRT-LM", "ML Kit",
    ]);
    const features = project?.highlights.join(" ");
    expect(features).toMatch(/create.*complete.*delete.*persist/i);
    expect(features).toMatch(/Qwen 2\.5.*LiteRT-LM.*Gemini Nano.*ML Kit\/AICore/);
    expect(features).toMatch(/optional model setup/i);
    expect(features).toMatch(/preferences.*restarts/i);
    expect(features).not.toMatch(/notification|screenshot|automatic.*extract/i);
    expect(project?.vision).toBe(
      "Turn everyday notifications and captured text into useful, organized tasks through a private assistant that lives on your device.",
    );
  });

  it.each(["scorearc", "wallcrawl", "turingcare"])("ships optimized local screenshot media for %s", (slug) => {
    const project = getProject(slug);
    expect(project?.images.length).toBeGreaterThan(0);
    for (const image of project!.images) {
      expect(image).toMatch(/^\/images\/projects\/[\w-]+\.webp$/);
      const path = join(process.cwd(), "public", image);
      expect(existsSync(path)).toBe(true);
      expect(readFileSync(path).subarray(8, 12).toString()).toBe("WEBP");
      expect(statSync(path).size).toBeLessThan(400_000);
    }
    expect(project?.cardSummary?.length).toBeLessThan(180);
  });

  it("preserves WebSnag's portrait case study", () => {
    const project = getProject("websnag");

    expect(project).toBeDefined();
    expect(project).toMatchObject({
      title: "WebSnag",
      summary:
        "A local-first Android focus app that combines NFC locks, recurring schedules, allowlist profiles, and deliberate unlock friction to make distractions harder to reach.",
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
        "/images/projects/websnag-schedules.png",
        "/images/projects/websnag-activity.png",
        "/images/projects/websnag-nfc-enrollment.png",
      ],
    });
    expect(project?.liveUrl).toBeUndefined();
    expect(project?.caseStudy).toBeDefined();
    expect(project?.caseStudy?.status).toContain("db40858");
    expect(project?.caseStudy?.status).toContain(
      "scheduled profile activation",
    );
    expect(
      project?.highlights.some((highlight) =>
        highlight.includes("Recurring schedules"),
      ),
    ).toBe(true);
    expect(project?.caseStudy?.status).not.toMatch(/roadmap|strict mode/i);
    expect(project?.caseStudy?.status).not.toMatch(/companion integrations/i);
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
