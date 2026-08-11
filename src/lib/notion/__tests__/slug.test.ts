import { describe, it, expect } from "vitest";
import { slugify, isValidSlug } from "@/lib/notion/slug";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Grounding Agents In Real Data")).toBe("grounding-agents-in-real-data");
  });
  it("strips diacritics", () => {
    expect(slugify("Café Días")).toBe("cafe-dias");
  });
  it("collapses punctuation and repeated separators", () => {
    expect(slugify("What's  new -- in Next.js 16?!")).toBe("what-s-new-in-next-js-16");
  });
  it("trims leading and trailing separators", () => {
    expect(slugify("  ...hello...  ")).toBe("hello");
  });
  it("returns empty string when nothing survives", () => {
    expect(slugify("!!!")).toBe("");
  });
});

describe("isValidSlug", () => {
  it("accepts lowercase hyphenated slugs", () => {
    expect(isValidSlug("a-valid-slug-2")).toBe(true);
  });
  it.each(["", "Has-Caps", "trailing-", "-leading", "double--hyphen", "has space"])(
    "rejects %j",
    (bad) => { expect(isValidSlug(bad)).toBe(false); },
  );
});
