import { describe, expect, it } from "vitest";
import {
  inlineToRichText,
  UnsupportedInlineMarkdownError,
  type RichTextInput,
} from "@/lib/notion/md-to-rich-text";

// The migration read a paragraph as one unstyled run, so every piece of inline
// formatting the posts carry — `retrieve`, **bold**, *italic*, ~~struck~~ and
// links — arrived in Notion as the literal characters that spell it. Syncing
// back then escaped those characters, so the site showed the backticks and
// asterisks the author never meant to type.

type Plain = {
  text: string;
  bold?: true;
  italic?: true;
  strikethrough?: true;
  code?: true;
  href?: string;
};

// The shape under test is the Notion SDK's, which is wordier than an assertion
// wants to be. This is the same information, flattened.
function readable(rich: RichTextInput): Plain[] {
  return rich.map((item) => {
    if (!("text" in item)) {
      throw new Error(`expected a text run, got ${JSON.stringify(item)}`);
    }
    const { bold, italic, strikethrough, code } = item.annotations ?? {};
    return {
      text: item.text.content,
      ...(bold === true ? { bold: true as const } : {}),
      ...(italic === true ? { italic: true as const } : {}),
      ...(strikethrough === true ? { strikethrough: true as const } : {}),
      ...(code === true ? { code: true as const } : {}),
      ...(item.text.link ? { href: item.text.link.url } : {}),
    };
  });
}

const runs = (markdown: string): Plain[] => readable(inlineToRichText(markdown));

const rejects = (markdown: string) =>
  expect(() => inlineToRichText(markdown)).toThrow(
    UnsupportedInlineMarkdownError,
  );

describe("plain text", () => {
  it("reads prose as one unstyled run", () => {
    expect(runs("plain prose, with punctuation!")).toEqual([
      { text: "plain prose, with punctuation!" },
    ]);
  });

  it("reads nothing out of nothing", () => {
    expect(inlineToRichText("")).toEqual([]);
  });

  it("leaves characters that open nothing alone", () => {
    for (const value of [
      "stdout | grep -c error",
      "Research & Development",
      "a } b",
      "Rated 9.5 out of 10.",
      "Ada — 1815-1852 — wrote it",
    ]) {
      expect(runs(value)).toEqual([{ text: value }]);
    }
  });
});

describe("backslash escapes", () => {
  it("gives back the character the escaper defused", () => {
    expect(runs("\\*not emphasis\\*")).toEqual([{ text: "*not emphasis*" }]);
    expect(runs("\\`not code\\`")).toEqual([{ text: "`not code`" }]);
    expect(runs("\\[text\\](https://example.com)")).toEqual([
      { text: "[text](https://example.com)" },
    ]);
    expect(runs("\\# Not a heading")).toEqual([{ text: "# Not a heading" }]);
    expect(runs("1\\. Not a list")).toEqual([{ text: "1. Not a list" }]);
    expect(runs("C:\\\\Users\\\\me")).toEqual([{ text: "C:\\Users\\me" }]);
  });

  it("keeps a backslash that escapes nothing", () => {
    // CommonMark only lets a backslash escape ASCII punctuation, so a
    // backslash before anything else — a letter, an em dash, a space — is the
    // backslash the author typed.
    expect(runs("\\d+ digits")).toEqual([{ text: "\\d+ digits" }]);
    expect(runs("ends with a backslash \\")).toEqual([
      { text: "ends with a backslash \\" },
    ]);
    expect(runs("\\— and \\\u00a0 and \\\u2019")).toEqual([
      { text: "\\— and \\\u00a0 and \\\u2019" },
    ]);
  });
});

describe("character references", () => {
  it("decodes the entities the escaper writes", () => {
    expect(runs("Array&lt;&#123;id: string&#125;>")).toEqual([
      { text: "Array<{id: string}>" },
    ]);
    expect(runs("&#105;mport the data")).toEqual([
      { text: "import the data" },
    ]);
    expect(runs("&#101;xport the results")).toEqual([
      { text: "export the results" },
    ]);
    expect(runs("&amp;amp; and &amp;#39;")).toEqual([
      { text: "&amp; and &#39;" },
    ]);
  });

  it("leaves an ampersand that starts no reference alone", () => {
    expect(runs("R&D and AT&T")).toEqual([{ text: "R&D and AT&T" }]);
  });

  it("refuses a reference it cannot resolve rather than guess", () => {
    rejects("&nosuchentity;");
    rejects("&#xd800;");
    rejects("&#0;");
  });

  it("refuses the references markdown would render as U+FFFD", () => {
    // A reference naming a code point HTML disallows renders as the
    // replacement character, which nobody typed and nobody wants stored.
    for (const value of ["&#128;", "&#x1f;", "&#xffff;", "&#xfdd0;", "&#x110000;"]) {
      rejects(value);
    }
  });
});

describe("inline code", () => {
  it("reads a code span as a code run", () => {
    expect(runs("`useState`")).toEqual([{ text: "useState", code: true }]);
    expect(runs("call `searchDocs` first")).toEqual([
      { text: "call " },
      { text: "searchDocs", code: true },
      { text: " first" },
    ]);
  });

  it("closes on a delimiter of its own length, not the first backtick", () => {
    expect(runs("``a`b``")).toEqual([{ text: "a`b", code: true }]);
    expect(runs("`` ` ``")).toEqual([{ text: "`", code: true }]);
    expect(runs("``` ``x`` ```")).toEqual([{ text: "``x``", code: true }]);
  });

  it("keeps the code raw, markdown and all", () => {
    expect(runs("`a_b *c* [d]`")).toEqual([
      { text: "a_b *c* [d]", code: true },
    ]);
    // No escape processing and no character references inside a code span.
    expect(runs("`&lt;T&gt;`")).toEqual([{ text: "&lt;T&gt;", code: true }]);
    expect(runs("`\\n`")).toEqual([{ text: "\\n", code: true }]);
  });

  it("strips the padding the writer added and nothing more", () => {
    expect(runs("` a `")).toEqual([{ text: "a", code: true }]);
    expect(runs("`  a  `")).toEqual([{ text: " a ", code: true }]);
    expect(runs("` `")).toEqual([{ text: " ", code: true }]);
    // Only a span of nothing but spaces keeps them: a tab is content.
    expect(runs("` \t `")).toEqual([{ text: "\t", code: true }]);
    expect(runs("`   `")).toEqual([{ text: "   ", code: true }]);
  });

  it("refuses a span that never closes", () => {
    rejects("`oops");
    rejects("``a`");
  });
});

describe("emphasis", () => {
  it("reads bold, italic, strikethrough and the two together", () => {
    expect(runs("**bold**")).toEqual([{ text: "bold", bold: true }]);
    expect(runs("__bold__")).toEqual([{ text: "bold", bold: true }]);
    expect(runs("*italic*")).toEqual([{ text: "italic", italic: true }]);
    expect(runs("_italic_")).toEqual([{ text: "italic", italic: true }]);
    expect(runs("~~struck~~")).toEqual([
      { text: "struck", strikethrough: true },
    ]);
    // GFM reads a single tilde as strikethrough too, and so does this site.
    expect(runs("~struck~")).toEqual([{ text: "struck", strikethrough: true }]);
    expect(runs("***both***")).toEqual([
      { text: "both", bold: true, italic: true },
    ]);
  });

  it("keeps a delimiter that cannot open emphasis literal", () => {
    for (const value of [
      "last_edited_time",
      "2 * 3 = 6",
      "a * b * c",
      "5*3 dollars",
      "snake_case and more_of_it",
    ]) {
      expect(runs(value)).toEqual([{ text: value }]);
    }
  });

  it("reads emphasis inside emphasis", () => {
    expect(runs("**bold with *italic* inside**")).toEqual([
      { text: "bold with ", bold: true },
      { text: "italic", bold: true, italic: true },
      { text: " inside", bold: true },
    ]);
    expect(runs("*italic with **bold** inside*")).toEqual([
      { text: "italic with ", italic: true },
      { text: "bold", italic: true, bold: true },
      { text: " inside", italic: true },
    ]);
    expect(runs("~~struck **bold** `code`~~")).toEqual([
      { text: "struck ", strikethrough: true },
      { text: "bold", strikethrough: true, bold: true },
      { text: " ", strikethrough: true },
      { text: "code", strikethrough: true, code: true },
    ]);
  });

  // GFM registers `~` as an attention marker, which exempts it from the rule
  // that a delimiter cannot open emphasis against punctuation. So a bold run
  // wrapped straight around a struck one pairs off where "a**`x`**" would not.
  it("pairs emphasis against a tilde the way GFM does", () => {
    expect(runs("prose**~~struck~~**")).toEqual([
      { text: "prose" },
      { text: "struck", bold: true, strikethrough: true },
    ]);
    expect(runs("~~struck~~*italic*")).toEqual([
      { text: "struck", strikethrough: true },
      { text: "italic", italic: true },
    ]);
    expect(runs("a**~~struck~~**b")).toEqual([
      { text: "a" },
      { text: "struck", bold: true, strikethrough: true },
      { text: "b" },
    ]);
  });

  it("refuses pairs that cross instead of nesting", () => {
    // Markdown gives the overlap to one pair and the leftovers to the other,
    // moving delimiter characters into the text. Notion annotations nest or
    // they do not apply, so there is nothing honest to store.
    rejects("~~struck **and~~ bold**");
    rejects("*italic ~~and* struck~~");
    rejects("**bold ~~and** struck~~");
  });

  it("still reads one kind of emphasis nested in another", () => {
    for (const [source, inner] of [
      ["~~a **b** c~~", { strikethrough: true, bold: true }],
      ["**a ~~b~~ c**", { bold: true, strikethrough: true }],
      ["*a `b` c*", { italic: true, code: true }],
      ["**a *b* c**", { bold: true, italic: true }],
    ] as const) {
      expect(runs(source)[1]).toEqual({ text: "b", ...inner });
    }
  });

  it("ignores a delimiter hiding inside code", () => {
    expect(runs("*emphasis around `a*b` code*")).toEqual([
      { text: "emphasis around ", italic: true },
      { text: "a*b", italic: true, code: true },
      { text: " code", italic: true },
    ]);
  });

  it("refuses a run it cannot pair off", () => {
    // A closer of another length is emphasis this converter cannot represent
    // without guessing which part of the run belongs to which delimiter.
    rejects("**bold *and italic***");
    rejects("****four****");
    rejects("~~~three~~~");
    // Interleaved rather than nested: CommonMark splits the runs across both
    // pairs, which is not a shape Notion annotations can hold.
    rejects("*foo **bar* baz**");
    rejects("*foo **bar*");
    rejects("**a *b c**");
  });

  // Each opener that turns out not to pair off used to re-scan the rest of the
  // line for every other one, so a line of them cost exponential time: twenty
  // took a quarter of a second, and the forty below would not have finished.
  it("reads a line of unpaired delimiters without exploring every pairing", () => {
    const line = `${"*.ts ".repeat(40)}and nothing else`;

    expect(runs(line)).toEqual([{ text: line }]);
  });
});

// GFM turns a bare url, a www address and an email into a link when the page is
// rendered, and the site says so in docs/authoring.md. The text is what the
// author wrote and what the converters carry, in both directions: it is stored
// literally, and the link is made again at render time.
describe("bare urls", () => {
  it("keeps them as the literal text they are", () => {
    for (const value of [
      "Visit https://example.com now",
      "mail me at someone@example.com",
      "see www.example.com",
    ]) {
      expect(runs(value)).toEqual([{ text: value }]);
    }
  });
});

describe("links", () => {
  it("reads the label and the href", () => {
    expect(runs("[docs](https://example.com)")).toEqual([
      { text: "docs", href: "https://example.com" },
    ]);
    expect(runs("see [docs](/blog/x) now")).toEqual([
      { text: "see " },
      { text: "docs", href: "/blog/x" },
      { text: " now" },
    ]);
  });

  it("keeps the formatting inside the label", () => {
    expect(runs("[**bold**](https://example.com)")).toEqual([
      { text: "bold", bold: true, href: "https://example.com" },
    ]);
    expect(runs("[`code`](https://example.com)")).toEqual([
      { text: "code", code: true, href: "https://example.com" },
    ]);
    expect(runs("[a *b*](https://example.com)")).toEqual([
      { text: "a ", href: "https://example.com" },
      { text: "b", italic: true, href: "https://example.com" },
    ]);
  });

  it("gives back a label the escaper defused", () => {
    expect(runs("[\\[x\\]](https://example.com)")).toEqual([
      { text: "[x]", href: "https://example.com" },
    ]);
  });

  it("keeps the href exactly as written", () => {
    for (const url of [
      "https://example.com/a(b)c",
      "https://example.com/?a=1&b=2",
      "/blog/a-post#heading",
      "mailto:someone@example.com",
    ]) {
      expect(runs(`[label](${url})`)).toEqual([{ text: "label", href: url }]);
    }
  });

  it("refuses the link shapes Notion cannot hold", () => {
    rejects('[docs](https://example.com "title")');
    rejects("[docs][ref]");
    rejects("[docs]");
    rejects("![alt](https://example.com/a.png)");
    rejects("[](https://example.com)");
    rejects("[a [b](https://x) c](https://y)");
    rejects("[docs](<https://example.com>)");
    rejects("[docs](https://example.com/(unbalanced)");
  });
});

describe("constructs with no rich-text equivalent", () => {
  it("refuses rather than quietly dropping them", () => {
    rejects("<span>markup</span>");
    rejects("<https://example.com>");
    rejects("an expression {value} here");
    rejects("![](https://example.com/a.png)");
  });

  it("says what it choked on and where", () => {
    try {
      inlineToRichText("prose with `unclosed code");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(UnsupportedInlineMarkdownError);
      const failure = error as UnsupportedInlineMarkdownError;
      expect(failure.message).toContain("code span");
      expect(failure.source).toBe("prose with `unclosed code");
      expect(failure.index).toBe(11);
    }
  });
});
