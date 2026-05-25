import { describe, it, expect } from "vitest";
import robots from "@/app/robots";

describe("robots", () => {
  it("allows all and references the sitemap", () => {
    const r = robots();
    expect(r.sitemap).toBe("https://elopenmike.com/sitemap.xml");
    expect(r.rules).toMatchObject({ userAgent: "*", allow: "/" });
  });
});
