import { describe, it, expect } from "vitest";
import { clips, photos } from "@/data/comedy";

describe("comedy data", () => {
  it("clips are well-formed", () => {
    expect(Array.isArray(clips)).toBe(true);
    for (const c of clips) {
      expect(c.youtubeId).toBeTruthy();
      expect(c.title).toBeTruthy();
    }
  });
  it("photos are well-formed", () => {
    expect(Array.isArray(photos)).toBe(true);
    for (const p of photos) {
      expect(p.src).toBeTruthy();
      expect(p.alt).toBeTruthy();
    }
  });
});
