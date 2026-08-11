import { describe, expect, it } from "vitest";
import { richTextToMarkdown } from "../rich-text";
import { rt } from "./fixtures/blocks";

// The MDX/JSX delimiters are escaped by escapeMarkdown now, alongside every
// other literal character Markdown would otherwise claim — see
// literal-markdown.test.tsx.

describe("richTextToMarkdown", () => {
  it("renders a plain run unchanged", () => {
    expect(richTextToMarkdown([rt("ordinary prose")])).toBe("ordinary prose");
  });

  it("renders bold, italic, and strike annotations individually", () => {
    expect(richTextToMarkdown([rt("bold", { bold: true })])).toBe("**bold**");
    expect(richTextToMarkdown([rt("italic", { italic: true })])).toBe("*italic*");
    expect(richTextToMarkdown([rt("strike", { strikethrough: true })])).toBe("~~strike~~");
  });

  it("keeps code raw and wraps styles in code→strike→italic→bold→link order", () => {
    expect(
      richTextToMarkdown([
        rt("useState", {
          code: true,
          bold: true,
          href: "https://react.dev",
        }),
      ]),
    ).toBe("[**`useState`**](https://react.dev)");
  });

  it("does not escape MDX syntax inside inline code", () => {
    expect(richTextToMarkdown([rt("Array<{id: string}>", { code: true })])).toBe("`Array<{id: string}>`");
  });

  it("escapes MDX syntax in plain runs", () => {
    expect(richTextToMarkdown([rt("Array<{id: string}>")])).toBe("Array&lt;&#123;id: string&#125;>");
  });

  it("leaves whitespace-only styled runs unwrapped", () => {
    expect(richTextToMarkdown([rt("   ", { bold: true, href: "https://example.com" })])).toBe("   ");
  });

  it("concatenates multiple runs", () => {
    expect(richTextToMarkdown([rt("Hello"), rt(" "), rt("world")])).toBe("Hello world");
  });

  it("returns an empty string for empty input", () => {
    expect(richTextToMarkdown([])).toBe("");
  });
});
