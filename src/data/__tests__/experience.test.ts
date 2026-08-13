import { describe, it, expect } from "vitest";
import { experience } from "@/data/experience";

describe("experience data", () => {
  it("has at least one role with required fields", () => {
    expect(experience.length).toBeGreaterThan(0);
    for (const role of experience) {
      expect(role.company).toBeTruthy();
      expect(role.title).toBeTruthy();
      expect(role.focus).toBeTruthy();
      expect(role.start).toBeTruthy();
      expect(Array.isArray(role.highlights)).toBe(true);
    }
  });

  it("describes the Outlook scheduling work without claiming ownership of the API", () => {
    const outlookScheduling = experience.find(
      (role) => role.focus === "Outlook Scheduling",
    );

    expect(outlookScheduling?.highlights).toContain(
      "Improved algorithms in a time-suggestions API used by Outlook Mobile on iOS and web, and added flexible working-hours support to the Find Meeting Times API.",
    );
  });
});
