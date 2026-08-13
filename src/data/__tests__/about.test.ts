import { describe, it, expect } from "vitest";
import { about } from "@/data/about";

describe("about data", () => {
  it("is well-formed", () => {
    expect(about.headline).toBeTruthy();
    expect(Array.isArray(about.bio)).toBe(true);
    expect(about.bio.length).toBeGreaterThan(0);
    expect(about.turing.caption).toBeTruthy();
    expect(Array.isArray(about.facts)).toBe(true);
    expect(about.facts.length).toBeGreaterThan(0);
  });

  it("describes Microsoft tenure from its factual start year", () => {
    expect(about.bio.join(" ")).toContain("Since joining Microsoft in 2018");
    expect(about.bio.join(" ")).not.toContain("Over six years at Microsoft");
  });
});
