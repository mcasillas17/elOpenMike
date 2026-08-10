import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { compileMDX } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import type { ReactElement } from "react";
import {
  inlineScanBudget,
  inlineToRichText,
  MAX_INLINE_DEPTH,
  UnsupportedInlineMarkdownError,
  type InlineParseMetrics,
  type RichTextInput,
} from "../md-to-rich-text";

// Every opener that turns out not to pair off asks the same question again of
// the rest of the line, and the answers were remembered under a key that
// spelled out the whole stack of delimiters still open around it. Two different
// stacks holding the same *set* of markers are the same question — the scan
// only ever asks whether a marker is open, never how many times or in what
// order — so the memo missed on every permutation and the search went back to
// exploring them all. Seventy-five characters of interleaved `*`, `_` and `~`
// took three seconds; a hundred would not have finished.
//
// The key is canonicalized to that set here, and a scan budget sits behind it:
// whatever else a line can do, it stops with a located refusal rather than
// taking the process down with it.

const metricsFor = (markdown: string): InlineParseMetrics => {
  let seen: InlineParseMetrics | undefined;
  inlineToRichText(markdown, { onMetrics: (metrics) => (seen = metrics) });
  if (seen === undefined) throw new Error("no metrics were reported");
  return seen;
};

const stepsFor = (markdown: string): number => metricsFor(markdown).steps;

describe("the work one line of inline markdown costs", () => {
  // Interleaved markers are the shape that used to explode: each one opens,
  // none of them closes, and every prefix of the stack is a distinct question
  // under the old key.
  const interleaved = (times: number) => `${"*a _b ~c ".repeat(times)}end`;

  it("stays linear-ish as interleaved markers pile up", () => {
    const short = stepsFor(interleaved(10));
    const long = stepsFor(interleaved(20));

    // Twice the line for at most six times the work: the exponential search
    // multiplied by eight for every nine characters added.
    expect(long).toBeLessThan(short * 6);
  });

  it("resolves a long interleaved line inside a generous fixed budget", () => {
    const line = interleaved(60);

    expect(stepsFor(line)).toBeLessThan(1_000_000);
    expect(stepsFor(line)).toBeLessThan(inlineScanBudget(line.length));
  });

  it("resolves crossing markers inside the same budget", () => {
    // Pairs that overlap rather than nest: the scan has to walk past every one
    // of them to discover the crossing it refuses.
    const line = `${"*a ~b _c *d ~e _f ".repeat(40)}end`;

    expect(() => inlineToRichText(line)).not.toThrow(RangeError);
    let steps = 0;
    try {
      inlineToRichText(line, { onMetrics: (metrics) => (steps = metrics.steps) });
    } catch (error) {
      expect(error).toBeInstanceOf(UnsupportedInlineMarkdownError);
    }
    expect(steps).toBeLessThan(inlineScanBudget(line.length));
  });

  it("resolves a line of unpaired delimiters", () => {
    const line = `${"*.ts ".repeat(200)}and nothing else`;

    expect(stepsFor(line)).toBeLessThan(inlineScanBudget(line.length));
  });

  it("resolves openers nested to the depth the site's own posts reach", () => {
    const line = `${"*a ".repeat(20)}mid${" b*".repeat(20)}`;

    expect(stepsFor(line)).toBeLessThan(inlineScanBudget(line.length));
  });

  // A wall-clock backstop, generous enough that only a genuine regression to
  // exponential search can trip it. The assertions above are the real ones.
  it("finishes a pathological line in well under a second", () => {
    const started = performance.now();
    try {
      inlineToRichText(`${"*a _b ~c ".repeat(80)}end`);
    } catch (error) {
      expect(error).toBeInstanceOf(UnsupportedInlineMarkdownError);
    }

    expect(performance.now() - started).toBeLessThan(2_000);
  });
});

describe("the budget behind the memo", () => {
  it("refuses, located, rather than scanning forever", () => {
    const line = `${"*a _b ~c ".repeat(20)}end`;

    try {
      inlineToRichText(line, { maxSteps: 200 });
      expect.unreachable("should have refused");
    } catch (error) {
      expect(error).toBeInstanceOf(UnsupportedInlineMarkdownError);
      const failure = error as UnsupportedInlineMarkdownError;
      expect(failure.message).toContain("scan");
      expect(failure.source).toBe(line);
      expect(failure.index).toBeGreaterThanOrEqual(0);
      expect(failure.index).toBeLessThanOrEqual(line.length);
    }
  });

  it("grows the budget with the line, so ordinary prose never meets it", () => {
    expect(inlineScanBudget(0)).toBeGreaterThan(0);
    expect(inlineScanBudget(2_000)).toBeGreaterThan(inlineScanBudget(100));
  });

  it("refuses nesting deep enough to exhaust the stack", () => {
    // Each opener recurses to look for its closer. Thousands of them used to
    // reach Node's stack limit and take the whole run down with a RangeError.
    const line = "*a ".repeat(MAX_INLINE_DEPTH * 20);

    expect(() => inlineToRichText(line)).toThrow(UnsupportedInlineMarkdownError);
    expect(() => inlineToRichText(line)).not.toThrow(RangeError);
  });

  it("leaves the constructs the posts actually use well inside it", () => {
    const line =
      "Keep the surface small — see `searchDocs`, read the " +
      "[docs](https://example.com), and **never** *ever* ~~guess~~.";

    expect(stepsFor(line)).toBeLessThan(inlineScanBudget(line.length) / 10);
  });
});

// The canonicalized key merges memo entries the old one kept apart, so the
// answers have to stay the ones the site's own renderer would give. Each case
// is pushed through the real MDX pipeline and compared run for run.

type Semantic = {
  text: string;
  bold?: true;
  italic?: true;
  strikethrough?: true;
  code?: true;
  href?: string;
};

const TAG_ANNOTATION: Record<string, keyof Semantic> = {
  STRONG: "bold",
  B: "bold",
  EM: "italic",
  I: "italic",
  DEL: "strikethrough",
  S: "strikethrough",
  CODE: "code",
};

function fromDom(container: HTMLElement): Semantic[] {
  const runs: Semantic[] = [];

  const walk = (node: Node, carried: Semantic): void => {
    if (node.nodeType === node.TEXT_NODE) {
      const text = node.textContent ?? "";
      if (text === "") return;
      runs.push({ ...carried, text });
      return;
    }
    if (!(node instanceof HTMLElement)) return;

    const next: Semantic = { ...carried };
    const annotation = TAG_ANNOTATION[node.tagName];
    if (annotation) Object.assign(next, { [annotation]: true });
    if (node.tagName === "A") next.href = node.getAttribute("href") ?? "";

    for (const child of Array.from(node.childNodes)) walk(child, next);
  };

  walk(container, { text: "" });
  return merge(runs.map(({ text, ...rest }) => ({ ...rest, text })));
}

function fromParser(rich: RichTextInput): Semantic[] {
  return merge(
    rich.map((item) => {
      if (!("text" in item)) throw new Error("not a text run");
      const { bold, italic, strikethrough, code } = item.annotations ?? {};
      return {
        text: item.text.content,
        ...(bold === true ? { bold: true as const } : {}),
        ...(italic === true ? { italic: true as const } : {}),
        ...(strikethrough === true ? { strikethrough: true as const } : {}),
        ...(code === true ? { code: true as const } : {}),
        ...(item.text.link ? { href: item.text.link.url } : {}),
      };
    }),
  );
}

// Notion splits runs where the editor did and MDX splits them where the tags
// are; two neighbours carrying the same annotations are one piece of text.
function merge(runs: Semantic[]): Semantic[] {
  const merged: Semantic[] = [];
  for (const run of runs) {
    if (run.text === "") continue;
    const last = merged[merged.length - 1];
    if (last && key(last) === key(run)) {
      last.text += run.text;
      continue;
    }
    merged.push({ ...run });
  }
  return merged;
}

const key = ({ bold, italic, strikethrough, code, href }: Semantic) =>
  JSON.stringify([bold, italic, strikethrough, code, href]);

async function renderMdx(markdown: string): Promise<HTMLElement> {
  const { content } = await compileMDX({
    source: markdown,
    options: { mdxOptions: { remarkPlugins: [remarkGfm] } },
  });
  return render(content as ReactElement).container;
}

describe("mixed markers, read against the renderer they came from", () => {
  const CASES = [
    "**bold with *italic* inside**",
    "*italic with **bold** inside*",
    "~~struck **bold** `code`~~",
    "a *b _c_ d* e",
    "_a **b** c_",
    "*a* _b_ ~c~",
    "**a** *b* ~~c~~",
    "prose**~~struck~~**",
    "*emphasis around `a*b` code*",
    "[a *b*](https://example.com) and *c*",
    "*.ts *.tsx *.js and nothing else",
    "a_b_c and snake_case_words",
    "**a *b* c *d* e**",
    "~~a *b* c~~ and **d**",
  ];

  for (const markdown of CASES) {
    it(`agrees with MDX on ${JSON.stringify(markdown)}`, async () => {
      const expected = fromDom(await renderMdx(markdown));

      expect(fromParser(inlineToRichText(markdown))).toEqual(expected);
    });
  }

  // Where markdown splits a delimiter run across two pairs there is no set of
  // annotations to store, so the converter refuses instead of guessing — but it
  // must never quietly disagree with the renderer.
  const REFUSED = [
    "*foo **bar* baz**",
    "~~struck **and~~ bold**",
    "*italic ~~and* struck~~",
    "**bold ~~and** struck~~",
  ];

  for (const markdown of REFUSED) {
    it(`refuses ${JSON.stringify(markdown)} rather than guess`, () => {
      expect(() => inlineToRichText(markdown)).toThrow(
        UnsupportedInlineMarkdownError,
      );
    });
  }
});
