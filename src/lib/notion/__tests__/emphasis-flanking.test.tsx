import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { compileMDX } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import type { ReactElement } from "react";
import { richTextToMarkdown } from "../rich-text";
import { blocksToMarkdown } from "../blocks-to-md";
import type { RichText } from "../types";
import { block, rt } from "./fixtures/blocks";

// CommonMark decides whether `**`, `*` and `~~` are emphasis from the
// characters on either side of them: a closing run may not be preceded by
// whitespace, and a run touching punctuation only flanks when the character
// opposite it is whitespace or punctuation too. Notion records none of that —
// it hands over runs split at arbitrary points, whitespace and all — so a bold
// run reading "Bold " next to the plain word "then" was written `**Bold **then`
// and rendered as four literal asterisks.

const ctx = { imagePath: (id: string) => `/images/${id}.png` };

type RunArgs = Parameters<typeof rt>;

const paragraph = (...runs: RunArgs[]) =>
  blocksToMarkdown(
    [block("paragraph", { rich_text: runs.map((args) => rt(...args)) })],
    ctx,
  );

const source = (...runs: RunArgs[]) => paragraph(...runs).trimEnd();

async function renderMdx(markdown: string): Promise<HTMLElement> {
  const { content } = await compileMDX({
    source: markdown,
    options: { mdxOptions: { remarkPlugins: [remarkGfm] } },
  });
  return render(content as ReactElement).container;
}

describe("edge whitespace inside an annotated run", () => {
  it("moves a trailing space outside the emphasis it would break", () => {
    expect(source(["Bold ", { bold: true }], ["then text"])).toBe(
      "**Bold** then text",
    );
    expect(source(["Italic ", { italic: true }], ["then text"])).toBe(
      "*Italic* then text",
    );
    expect(source(["Struck ", { strikethrough: true }], ["then text"])).toBe(
      "~~Struck~~ then text",
    );
  });

  it("moves a leading space outside too", () => {
    expect(source(["before"], [" Bold", { bold: true }], ["after"])).toBe(
      "before **Bold**after",
    );
    expect(source([" Both ", { italic: true }], ["end"])).toBe(" *Both* end");
  });

  it("keeps every space the author typed, in the order they typed it", () => {
    expect(source(["  wide  ", { bold: true }], ["tail"])).toBe(
      "  **wide**  tail",
    );
    expect(source(["two  words", { bold: true }])).toBe("**two  words**");
    expect(source(["a\nb ", { bold: true }], ["c"])).toBe("**a\nb** c");
  });

  it("still leaves a run that is nothing but whitespace unwrapped", () => {
    expect(richTextToMarkdown([rt("   ", { bold: true })])).toBe("   ");
    expect(
      richTextToMarkdown([rt("   ", { bold: true, href: "https://x.com" })]),
    ).toBe("   ");
  });

  it("hoists the space out of the emphasis but keeps it inside the link", () => {
    expect(
      source(["Bold ", { bold: true, href: "https://example.com" }], ["tail"]),
    ).toBe("[**Bold** ](https://example.com)tail");
  });
});

describe("punctuation at the edge of an annotated run", () => {
  // The closing `**` of `**Wow!**bar` is preceded by punctuation and followed
  // by a letter, so it does not close. Writing the letter as the character
  // reference it already renders as makes the delimiter flank without adding,
  // removing or reordering a single character of the author's text.
  it("neutralises the next character when the run ends in punctuation", () => {
    expect(source(["Wow!", { bold: true }], ["bar"])).toBe("**Wow!**&#98;ar");
    expect(source(["Wow!", { italic: true }], ["bar"])).toBe("*Wow!*&#98;ar");
    expect(source(["Wow!", { strikethrough: true }], ["bar"])).toBe(
      "~~Wow!~~&#98;ar",
    );
  });

  it("neutralises the previous character when the run starts in punctuation", () => {
    expect(source(["foo"], ["!bar", { bold: true }])).toBe("fo&#111;**!bar**");
  });

  it("leaves a delimiter that already flanks alone", () => {
    expect(source(["Wow!", { bold: true }], [" bar"])).toBe("**Wow!** bar");
    expect(source(["Wow", { bold: true }], ["bar"])).toBe("**Wow**bar");
    expect(source(["Wow!", { bold: true }], ["(bar)"])).toBe("**Wow!**(bar)");
    expect(source(["Wow!", { bold: true }])).toBe("**Wow!**");
  });

  // Two delimiter runs written back to back are one longer run, and no
  // neighbouring character can tell it where to pair. The element says it
  // outright.
  it("writes the element where two delimiter runs would fuse", () => {
    expect(source(["Wow!", { bold: true }], ["b", { italic: true }])).toBe(
      "<strong>Wow!</strong>*b*",
    );
    expect(source(["a", { bold: true }], ["b", { bold: true, strikethrough: true }])).toBe(
      "<strong>a</strong>**~~b~~**",
    );
  });

  it("keeps a literal exclamation mark from turning a link into an image", () => {
    expect(source(["Wow!"], ["docs", { href: "https://example.com" }])).toBe(
      "Wow\\![docs](https://example.com)",
    );
  });

  it("needs no help inside a link, where brackets already flank it", () => {
    expect(
      source(["Wow!", { bold: true, href: "https://example.com" }], ["bar"]),
    ).toBe("[**Wow!**](https://example.com)bar");
  });
});

describe("code spans keep their own padding rules", () => {
  it("pads only where CommonMark would strip or swallow", () => {
    expect(richTextToMarkdown([rt("useState", { code: true })])).toBe(
      "`useState`",
    );
    expect(richTextToMarkdown([rt(" x ", { code: true })])).toBe("`  x  `");
    expect(richTextToMarkdown([rt("a`b", { code: true })])).toBe("`` a`b ``");
  });

  it("does not hoist whitespace out of a code span", () => {
    expect(source(["code ", { code: true }], ["tail"])).toBe("`code `tail");
  });

  it("still flanks the emphasis wrapped around a code span", () => {
    expect(source(["x"], ["c", { code: true, bold: true }], ["y"])).toBe(
      "&#120;**`c`**&#121;",
    );
  });
});

describe("runs Notion split for no reason", () => {
  it("writes one pair of delimiters for adjacent identical runs", () => {
    expect(source(["Bo", { bold: true }], ["ld", { bold: true }])).toBe(
      "**Bold**",
    );
    expect(
      source(["a", { strikethrough: true }], ["b", { strikethrough: true }]),
    ).toBe("~~ab~~");
  });

  it("shares one wrapper when only the inner annotation differs", () => {
    expect(
      source(["x", { strikethrough: true, code: true }], ["y", { strikethrough: true }]),
    ).toBe("~~`x`y~~");
  });
});

// The exact-output tests above say what is written; these say what a reader
// sees, through the same MDX pipeline the post page compiles with.
describe("compiled through the post page's MDX pipeline", () => {
  it("renders the reported paragraph as bold text, not asterisks", async () => {
    const container = await renderMdx(paragraph(["Bold ", { bold: true }], ["then text"]));
    expect(container.textContent).toBe("Bold then text");
    expect(container.querySelector("strong")?.textContent).toBe("Bold");
  });

  it("renders punctuation-edged annotations as the annotation", async () => {
    const container = await renderMdx(paragraph(["Wow!", { bold: true }], ["bar"]));
    expect(container.textContent).toBe("Wow!bar");
    expect(container.querySelector("strong")?.textContent).toBe("Wow!");
  });

  it("keeps a link valid while the emphasis inside it flanks", async () => {
    const container = await renderMdx(
      paragraph(["Wow!", { bold: true, href: "https://example.com" }], ["bar"]),
    );
    const anchor = container.querySelector("a");
    expect(anchor?.getAttribute("href")).toBe("https://example.com");
    expect(anchor?.querySelector("strong")?.textContent).toBe("Wow!");
    expect(container.textContent).toBe("Wow!bar");
  });
});

// A matrix rather than a list of examples: the bug was not one string, it was
// every boundary between an annotated run and whatever Notion put next to it.
const ANNOTATIONS: Array<[string, Partial<RichText["annotations"]> & { href?: string }]> = [
  ["plain", {}],
  ["bold", { bold: true }],
  ["italic", { italic: true }],
  ["strike", { strikethrough: true }],
  ["bold+italic", { bold: true, italic: true }],
  ["bold+strike", { bold: true, strikethrough: true }],
  ["italic+strike", { italic: true, strikethrough: true }],
  ["all three", { bold: true, italic: true, strikethrough: true }],
  ["code", { code: true }],
  ["bold+code", { bold: true, code: true }],
  ["strike+code", { strikethrough: true, code: true }],
  ["link", { href: "https://example.com" }],
  ["bold link", { bold: true, href: "https://example.com" }],
];

const TEXTS = [
  "word",
  "Wow!",
  "!lead",
  "!both!",
  "two words",
  " lead",
  "trail ",
  " both ",
  "(parens)",
  "e.g.",
  "50%",
];

const TAG_OF_MARK = {
  bold: "STRONG",
  italic: "EM",
  strikethrough: "DEL",
  code: "CODE",
} as const;

const MARK_TAGS = new Set(["STRONG", "EM", "DEL", "CODE", "A"]);

// One entry per rendered character: the character itself, and the formatting
// wrapped around it. Whitespace carries no visible formatting, so the marks on
// a space are deliberately not compared — moving one out of a delimiter is the
// fix, not a regression.
type Marked = string;

const marked = (char: string, marks: string[]): Marked =>
  `${char}\u0000${/\s/.test(char) ? "" : [...marks].sort().join(",")}`;

function expectedMarks(runs: RichText[]): Marked[] {
  const out: Marked[] = [];
  for (const run of runs) {
    const marks = [
      ...Object.entries(TAG_OF_MARK)
        .filter(([key]) => run.annotations[key as keyof typeof TAG_OF_MARK])
        .map(([, tag]) => tag as string),
      ...(run.href === null ? [] : ["A"]),
    ];
    for (const char of run.plain_text) out.push(marked(char, marks));
  }
  return out;
}

function actualMarks(paragraphElement: Element): Marked[] {
  const out: Marked[] = [];
  const walk = (node: Node, marks: string[]) => {
    for (const child of node.childNodes) {
      if (child.nodeType === child.TEXT_NODE) {
        for (const char of child.textContent ?? "") out.push(marked(char, marks));
        continue;
      }
      const tag = (child as Element).tagName;
      walk(child, MARK_TAGS.has(tag) ? [...marks, tag] : marks);
    }
  };
  walk(paragraphElement, []);
  return out;
}

describe("every annotated run beside every neighbour", () => {
  type Case = { name: string; runs: RichText[] };

  const cases: Case[] = [];
  for (const [name, annotations] of ANNOTATIONS) {
    for (const text of TEXTS) {
      cases.push({
        name: `${name} ${JSON.stringify(text)} between plain runs`,
        runs: [rt("x"), rt(text, annotations), rt("y")],
      });
    }
  }
  for (const [leftName, left] of ANNOTATIONS) {
    for (const [rightName, right] of ANNOTATIONS) {
      cases.push({
        name: `${leftName} then ${rightName}`,
        runs: [rt("Wow!", left), rt("bar", right), rt("z")],
      });
      cases.push({
        name: `${leftName} then one-character ${rightName}`,
        runs: [rt("Wow!", left), rt("b", right), rt("z")],
      });
      cases.push({
        name: `${leftName} then ${rightName}, no punctuation`,
        runs: [rt("Wow", left), rt("bar", right), rt("z")],
      });
    }
  }

  it(`covers ${cases.length} run sequences`, () => {
    expect(cases.length).toBeGreaterThan(300);
  });

  it("renders each one with the marks and the text Notion recorded", async () => {
    const markdown = blocksToMarkdown(
      cases.map(({ runs }) => block("paragraph", { rich_text: runs })),
      ctx,
    );
    const container = await renderMdx(markdown);
    const paragraphs = [...container.querySelectorAll("p")];
    expect(paragraphs).toHaveLength(cases.length);

    const failures = cases
      .map((testCase, index) => {
        const want = expectedMarks(testCase.runs);
        const got = actualMarks(paragraphs[index]);
        return want.join("") === got.join("")
          ? null
          : `${testCase.name}: wanted ${JSON.stringify(want)} got ${JSON.stringify(got)}`;
      })
      .filter((failure): failure is string => failure !== null);

    expect(failures).toEqual([]);
  });
});
