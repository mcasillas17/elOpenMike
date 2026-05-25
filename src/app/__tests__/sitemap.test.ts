import { describe, it, expect } from "vitest";
import sitemap from "@/app/sitemap";

describe("sitemap", () => {
  it("includes the core static routes, projects, and posts", () => {
    const urls = sitemap().map((e) => e.url);
    expect(urls).toContain("https://elopenmike.com");
    expect(urls).toContain("https://elopenmike.com/contact");
    expect(urls).toContain("https://elopenmike.com/blog");
    expect(urls.some((u) => u.startsWith("https://elopenmike.com/projects/"))).toBe(true);
    expect(urls.some((u) => u.startsWith("https://elopenmike.com/blog/"))).toBe(true);
  });
});
