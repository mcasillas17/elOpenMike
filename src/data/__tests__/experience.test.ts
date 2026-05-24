import { describe, it, expect } from "vitest";
import { experience } from "@/data/experience";

describe("experience data", () => {
  it("has at least one role with required fields", () => {
    expect(experience.length).toBeGreaterThan(0);
    for (const role of experience) {
      expect(role.company).toBeTruthy();
      expect(role.title).toBeTruthy();
      expect(role.start).toBeTruthy();
      expect(Array.isArray(role.highlights)).toBe(true);
    }
  });
});
