import { describe, it, expect } from "vitest";
import {
  hashSlug,
  getTint,
  getMark,
  MARKS,
  type Tint,
} from "@/lib/projectVisuals";
import type { Project } from "@/data/projects";

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    slug: "demo",
    title: "Demo",
    summary: "demo summary",
    year: "2026",
    tags: [],
    stack: [],
    highlights: [],
    images: [],
    ...overrides,
  };
}

describe("hashSlug", () => {
  it("is deterministic for the same input", () => {
    expect(hashSlug("turingagent")).toBe(hashSlug("turingagent"));
  });

  it("differs for different inputs (collision-resistant in our small set)", () => {
    const a = hashSlug("turingagent");
    const b = hashSlug("turingcare");
    const c = hashSlug("light-master");
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it("returns a non-negative integer", () => {
    expect(hashSlug("zzz")).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(hashSlug("zzz"))).toBe(true);
  });
});

describe("getTint", () => {
  it("always returns 'cover' for the first project (index 0)", () => {
    const p = makeProject({ tags: ["Game"] });
    expect(getTint(p, 0)).toBe<Tint>("cover");
  });

  it("maps AI/Full-stack tags to blue", () => {
    expect(getTint(makeProject({ tags: ["AI"] }), 1)).toBe("blue");
    expect(getTint(makeProject({ tags: ["Full-stack"] }), 2)).toBe("blue");
  });

  it("maps Web app to red", () => {
    expect(getTint(makeProject({ tags: ["Web app"] }), 1)).toBe("red");
  });

  it("maps Game/Unity to green", () => {
    expect(getTint(makeProject({ tags: ["Game"] }), 1)).toBe("green");
    expect(getTint(makeProject({ tags: ["Unity"] }), 1)).toBe("green");
  });

  it("maps Open source (only) to purple", () => {
    expect(getTint(makeProject({ tags: ["Open source"] }), 1)).toBe("purple");
  });

  it("prefers AI over Open source when both present", () => {
    expect(
      getTint(makeProject({ tags: ["AI", "Open source"] }), 1),
    ).toBe("blue");
  });

  it("falls back to a deterministic non-cover tint when no tags match", () => {
    const p = makeProject({ slug: "fallback-slug", tags: ["Other"] });
    const t = getTint(p, 1);
    expect(["blue", "red", "green", "purple"]).toContain(t);
    // Determinism: calling again returns the same tint.
    expect(getTint(p, 1)).toBe(t);
  });
});

describe("getMark", () => {
  it("always returns a mark for the first project (index 0)", () => {
    expect(getMark(makeProject(), 0)).not.toBeNull();
  });

  it("is deterministic — same slug yields same result on repeated calls", () => {
    const p = makeProject({ slug: "stable-slug" });
    expect(getMark(p, 5)).toBe(getMark(p, 5));
  });

  it("returns null when hash falls outside the threshold (non-featured only)", () => {
    // hashSlug % 100 < 35 is the gate. Walk a few slugs and assert that at
    // least one returns null (the threshold gate is honored for non-index-0
    // projects).
    const slugs = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const nonFeatured = slugs.map((s) => getMark(makeProject({ slug: s }), 1));
    expect(nonFeatured.some((m) => m === null)).toBe(true);
  });

  it("returns a value from the MARKS pool when not null", () => {
    const m = getMark(makeProject({ slug: "z" }), 0);
    expect(MARKS).toContain(m as (typeof MARKS)[number]);
  });
});
