import { describe, expect, it } from "vitest";
import { projects } from "@/data/projects";
import { readProjectReferences } from "@/lib/project-references";

describe("readProjectReferences", () => {
  it("accepts absent and empty references", () => {
    expect(readProjectReferences(undefined)).toEqual({ ok: true, projects: [] });
    expect(readProjectReferences([])).toEqual({ ok: true, projects: [] });
  });

  it("resolves every public title and slug with trimmed case-insensitive lookup", () => {
    for (const project of projects) {
      expect(readProjectReferences([` ${project.title.toUpperCase()} `])).toEqual({
        ok: true,
        projects: [project.slug],
      });
      expect(readProjectReferences([` ${project.slug.toUpperCase()} `])).toEqual({
        ok: true,
        projects: [project.slug],
      });
    }
  });

  it("deduplicates title and slug aliases in the author's order", () => {
    expect(readProjectReferences([
      "TURINGAGENT", "Knights of the Round Table", " coding-skills ", "Watchslinger",
      "turingagent",
    ])).toEqual({
      ok: true,
      projects: ["turingagent", "coding-skills", "watchslinger"],
    });
  });

  it.each([null, false, 42, "private-author-value", { private: "value" }])(
    "rejects non-array input without exposing its value",
    (value) => {
      expect(readProjectReferences(value)).toEqual({
        ok: false,
        error: "projects must be an array of project titles or slugs",
      });
    },
  );

  it.each([null, undefined, 42, false, {}, [], "", "   "])(
    "rejects malformed elements rather than dropping them",
    (value) => {
      expect(readProjectReferences(["watchslinger", value])).toEqual({
        ok: false,
        error: "projects must contain only non-empty strings",
      });
    },
  );

  it("rejects unknown references using a fixed redacted error", () => {
    expect(readProjectReferences(["watchslinger", "secret-private-project"])).toEqual({
      ok: false,
      error: "projects contains an unknown public project reference",
    });
    expect(readProjectReferences(["Knights of the Round"])).toEqual({
      ok: false,
      error: "projects contains an unknown public project reference",
    });
  });

  it("bounds the input before deduplication", () => {
    expect(readProjectReferences(Array(100).fill("watchslinger"))).toEqual({
      ok: true,
      projects: ["watchslinger"],
    });
    expect(readProjectReferences(Array(101).fill("watchslinger"))).toEqual({
      ok: false,
      error: "projects must contain at most 100 references",
    });
  });

  it("rejects sparse arrays", () => {
    expect(readProjectReferences(new Array(1))).toEqual({
      ok: false,
      error: "projects must contain only non-empty strings",
    });
  });
});
