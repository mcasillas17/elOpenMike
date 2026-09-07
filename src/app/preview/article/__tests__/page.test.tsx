import { afterEach, describe, expect, it, vi } from "vitest";
import { getPostSlugs } from "@/lib/blog";
import PreviewPage, { metadata } from "../page";

afterEach(() => vi.unstubAllEnvs());

describe("article layout specimen", () => {
  it("is disabled unless explicitly enabled for a local preview build", async () => {
    vi.stubEnv("ARTICLE_PREVIEW", "");
    await expect(PreviewPage()).rejects.toThrow();
  });

  it("is not a published post and carries noindex metadata", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(getPostSlugs()).not.toContain("article-specimen");
  });
});
