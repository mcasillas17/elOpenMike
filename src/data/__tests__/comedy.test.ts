import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { clips, photos } from "@/data/comedy";

describe("comedy data", () => {
  it("clips are well-formed", () => {
    expect(Array.isArray(clips)).toBe(true);
    for (const c of clips) {
      expect(c.youtubeId).toBeTruthy();
      expect(c.title).toBeTruthy();
    }
  });

  it("preserves the two original video IDs, venue titles, and dates", () => {
    expect(clips.map(({ youtubeId, title }) => ({ youtubeId, title }))).toEqual([
      { youtubeId: "n-AgoNbE7Ms", title: "Laughs Comedy Club, Seattle (Jul 2023)" },
      { youtubeId: "aVqjFdhp5a8", title: "Comedy/Bar, Seattle (Jul 2023)" },
    ]);
  });

  it("provides a real local JPEG poster for each clip", () => {
    for (const clip of clips) {
      const posterSrc = `/images/comedy/${clip.youtubeId}.jpg`;
      expect(clip).toHaveProperty("posterSrc", posterSrc);
      const image = readFileSync(join(process.cwd(), "public", posterSrc));
      expect([...image.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
      expect(image.byteLength).toBeGreaterThan(10_000);
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
