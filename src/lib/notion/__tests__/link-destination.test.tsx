import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { compileMDX } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import type { ReactElement } from "react";
import { blocksToMarkdown, type BlocksToMarkdownContext } from "../blocks-to-md";
import { markdownDestination } from "../link-destination";
import { block, rt } from "./fixtures/blocks";

// A Notion link is a URL the author pasted, and Markdown reads the text between
// `](` and `)` as syntax rather than as a URL: a space ends the destination and
// starts a title, an unmatched `)` closes the link early, a backslash escapes
// whatever follows it, and `&amp;` is decoded back to an ampersand. Writing the
// URL in verbatim therefore produced a link to somewhere else — or no link at
// all, with the rest of the paragraph swallowed as a title.

const warnings: string[] = [];
const ctx: BlocksToMarkdownContext = {
  imagePath: (id: string) => `/images/${id}.png`,
  onWarning: (message) => warnings.push(message),
};

async function renderMdx(markdown: string): Promise<HTMLElement> {
  const { content } = await compileMDX({
    source: markdown,
    options: { mdxOptions: { remarkPlugins: [remarkGfm] } },
  });
  return render(content as ReactElement).container;
}

const linked = (url: string, label = "link") =>
  blocksToMarkdown(
    [block("paragraph", { rich_text: [rt(label, { href: url })] })],
    ctx,
  ).trimEnd();

const bookmark = (url: string) =>
  blocksToMarkdown([block("bookmark", { url, caption: [] })], ctx).trimEnd();

async function hrefOf(markdown: string): Promise<string | null | undefined> {
  const container = await renderMdx(markdown);
  return container.querySelector("a")?.getAttribute("href");
}

describe("markdownDestination", () => {
  it("leaves an ordinary url alone", () => {
    expect(markdownDestination("https://example.com/a/b?c=1&d=2#e")).toBe(
      "https://example.com/a/b?c=1&d=2#e",
    );
    expect(markdownDestination("/blog/a-post")).toBe("/blog/a-post");
    expect(markdownDestination("#section")).toBe("#section");
    expect(markdownDestination("../sibling/page")).toBe("../sibling/page");
  });

  it("percent-encodes whitespace and control characters", () => {
    expect(markdownDestination("https://example.com/a b")).toBe(
      "https://example.com/a%20b",
    );
    expect(markdownDestination("https://example.com/a\tb\nc")).toBe(
      "https://example.com/a%09b%0Ac",
    );
    expect(markdownDestination("https://example.com/a\u00a0b")).toBe(
      "https://example.com/a%C2%A0b",
    );
    expect(markdownDestination("https://example.com/a\u0000b")).toBe(
      "https://example.com/a%00b",
    );
  });

  it("keeps balanced parentheses and escapes unbalanced ones", () => {
    expect(markdownDestination("https://example.com/a(b)c")).toBe(
      "https://example.com/a(b)c",
    );
    expect(markdownDestination("https://example.com/a)c")).toBe(
      "https://example.com/a\\)c",
    );
    expect(markdownDestination("https://example.com/a(c")).toBe(
      "https://example.com/a\\(c",
    );
    // Deeper than the nesting micromark will track, so none of them can stand.
    const deep = `https://example.com/${"(".repeat(40)}x${")".repeat(40)}`;
    expect(markdownDestination(deep)).toBe(
      `https://example.com/${"\\(".repeat(40)}x${"\\)".repeat(40)}`,
    );
  });

  it("escapes a backslash rather than letting it escape the next character", () => {
    expect(markdownDestination("https://example.com/a\\)b")).toBe(
      "https://example.com/a\\\\\\)b",
    );
  });

  it("percent-encodes the angle brackets MDX would read as JSX", () => {
    expect(markdownDestination("https://example.com/<b>")).toBe(
      "https://example.com/%3Cb%3E",
    );
  });

  it("keeps an ampersand that markdown would decode", () => {
    expect(markdownDestination("https://example.com/?a=1&b=2")).toBe(
      "https://example.com/?a=1&b=2",
    );
    expect(markdownDestination("https://example.com/?a=1&amp;b=2")).toBe(
      "https://example.com/?a=1&amp;amp;b=2",
    );
    expect(markdownDestination("https://example.com/?q=&copy;")).toBe(
      "https://example.com/?q=&amp;copy;",
    );
  });

  it("does not encode a url that is already percent-encoded", () => {
    expect(markdownDestination("https://example.com/a%20b%2Fc")).toBe(
      "https://example.com/a%20b%2Fc",
    );
  });

  it("leaves unicode in a url as the characters it is", () => {
    expect(markdownDestination("https://example.com/café/日本")).toBe(
      "https://example.com/café/日本",
    );
  });

  it("refuses a scheme that is not a link to a document", () => {
    expect(markdownDestination("javascript:alert(1)")).toBeUndefined();
    expect(markdownDestination("JavaScript:alert(1)")).toBeUndefined();
    expect(markdownDestination("data:text/html,<script>")).toBeUndefined();
    expect(markdownDestination("vbscript:msgbox")).toBeUndefined();
    // Browsers strip control characters out of an href before reading the
    // scheme, so the scheme has to be read the same way.
    expect(markdownDestination("java\nscript:alert(1)")).toBeUndefined();
    expect(markdownDestination("\u0001javascript:alert(1)")).toBeUndefined();
  });

  it("keeps the schemes a post actually links with", () => {
    for (const url of [
      "https://example.com",
      "http://example.com",
      "mailto:someone@example.com",
      "tel:+15551234567",
    ]) {
      expect(markdownDestination(url)).toBe(url);
    }
  });
});

describe("a link destination compiled through the MDX pipeline", () => {
  const CASES: Array<[string, string]> = [
    ["a space", "https://example.com/a b"],
    ["an unmatched closing paren", "https://example.com/a)b"],
    ["an unmatched opening paren", "https://example.com/a(b"],
    ["balanced parens", "https://example.com/a(b)c"],
    ["a backslash", "https://example.com/a\\b"],
    ["unicode", "https://example.com/café"],
    ["an entity", "https://example.com/?a=1&amp;b=2"],
    ["an already-encoded space", "https://example.com/a%20b"],
  ];

  // The href a browser is handed is the destination markdown read, percent-
  // encoded for an attribute by mdast-util-to-hast. Comparing the two decoded
  // says the URL survived without saying which of them chose to encode a
  // character — and it still catches encoding one twice, since "%2520" decodes
  // to "%20" rather than to a space.
  const sameUrl = (href: string | null | undefined, url: string) => {
    expect(href).toBeTruthy();
    expect(decodeURIComponent(href as string)).toBe(decodeURIComponent(url));
  };

  for (const [name, url] of CASES) {
    it(`arrives intact through an inline link with ${name}`, async () => {
      const container = await renderMdx(linked(url));
      const anchor = container.querySelector("a");
      expect(anchor?.textContent).toBe("link");
      sameUrl(anchor?.getAttribute("href"), url);
      expect(container.textContent).toBe("link");
    });

    it(`arrives intact through a bookmark with ${name}`, async () => {
      sameUrl(await hrefOf(bookmark(url)), url);
    });
  }

  it("keeps the parentheses and the ampersand a url really carries", async () => {
    expect(await hrefOf(linked("https://example.com/a(b)c"))).toBe(
      "https://example.com/a(b)c",
    );
    expect(await hrefOf(linked("https://example.com/?a=1&amp;b=2"))).toBe(
      "https://example.com/?a=1&amp;b=2",
    );
    expect(await hrefOf(linked("https://example.com/a%20b"))).toBe(
      "https://example.com/a%20b",
    );
  });

  it("keeps the paragraph after a link with a space in its url", async () => {
    const markdown = blocksToMarkdown(
      [
        block("paragraph", {
          rich_text: [
            rt("see ", {}),
            rt("here", { href: "https://example.com/a b" }),
            rt(" for more"),
          ],
        }),
      ],
      ctx,
    );
    const container = await renderMdx(markdown);
    expect(container.textContent).toBe("see here for more");
    sameUrl(
      container.querySelector("a")?.getAttribute("href"),
      "https://example.com/a b",
    );
  });

  it("renders a refused scheme as text instead of a link", async () => {
    warnings.length = 0;
    const markdown = linked("javascript:alert(1)", "click me");
    const container = await renderMdx(markdown);
    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toBe("click me");

    const bookmarked = bookmark("javascript:alert(1)");
    expect(await renderMdx(bookmarked).then((c) => c.querySelector("a"))).toBeNull();
    expect(warnings.join("\n")).toContain("javascript:alert(1)");
  });
});
