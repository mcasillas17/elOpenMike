import type { BlockObjectRequest } from "@notionhq/client";

// Notion has no Markdown. A page stores runs of literal text, each carrying a
// set of annotations (bold, italic, strikethrough, code) and an optional link,
// and that is the whole vocabulary. The migration used to send one unstyled run
// per line, so `retrieve` arrived as a word wrapped in two backticks, **bold**
// as a word wrapped in four asterisks, and so on. The sync then read those
// characters back as the literal text they now were and escaped them, so the
// site started showing the punctuation instead of the formatting.
//
// So the inline Markdown a line carries is parsed here into the runs Notion
// actually stores. The grammar is deliberately the one this repo produces and
// uses — escapes, character references, code spans, emphasis, strikethrough and
// inline links — and everything outside it is refused rather than guessed at.
// The migration builds every page body before it creates the first page, so a
// refusal costs nothing: the run stops with the offending text in the message
// and the database is untouched. Degrading quietly, by contrast, would put text
// into Notion that nobody can tell was ever formatted.

// Derived from the SDK so the shape is whatever Notion currently accepts.
type CodeBlockRequest = Extract<BlockObjectRequest, { code: unknown }>;
export type RichTextInput = CodeBlockRequest["code"]["rich_text"];
type TextItem = Extract<RichTextInput[number], { text: unknown }>;
type ItemAnnotations = NonNullable<TextItem["annotations"]>;

type Annotation = "bold" | "italic" | "strikethrough" | "code";

// Written to the request in a fixed order so identical content always
// serializes identically.
const ANNOTATION_ORDER = [
  "bold",
  "italic",
  "strikethrough",
  "code",
] as const satisfies readonly Annotation[];

type Context = {
  annotations: readonly Annotation[];
  // Notion puts the link on the run, so it is inherited by everything inside
  // the label rather than wrapping it.
  href?: string;
};

export class UnsupportedInlineMarkdownError extends Error {
  readonly source: string;
  readonly index: number;

  constructor(reason: string, source: string, index: number) {
    super(
      `unsupported inline markdown in migration: ${reason} at offset ${index} ` +
        `of ${JSON.stringify(source)}`,
    );
    this.name = "UnsupportedInlineMarkdownError";
    this.source = source;
    this.index = index;
  }
}

// The runs one line of inline Markdown describes. Throws
// UnsupportedInlineMarkdownError for anything Notion's rich text cannot hold.
export function inlineToRichText(markdown: string): RichTextInput {
  const items: TextItem[] = [];
  parse(markdown, 0, markdown.length, { annotations: [] }, items);
  return items;
}

function parse(
  source: string,
  start: number,
  end: number,
  context: Context,
  items: TextItem[],
): void {
  let literal = "";
  let index = start;

  const flush = () => {
    if (literal !== "") {
      items.push(textItem(literal, context));
      literal = "";
    }
  };

  while (index < end) {
    const char = source[index];

    if (char === "\\") {
      const escaped = source[index + 1];
      // CommonMark: a backslash only escapes ASCII punctuation. Anywhere else
      // it is the backslash the author typed.
      if (index + 1 < end && escaped !== undefined && isPunctuation(escaped)) {
        literal += escaped;
        index += 2;
      } else {
        literal += char;
        index += 1;
      }
      continue;
    }

    if (char === "&") {
      const reference = readReference(source, index, end);
      if (reference) {
        literal += reference.value;
        index += reference.length;
        continue;
      }
      literal += char;
      index += 1;
      continue;
    }

    // MDX, not Markdown: `<` opens JSX or an autolink and `{` an expression.
    // Neither survives the trip into a Notion run.
    if (char === "<") {
      throw new UnsupportedInlineMarkdownError(
        "raw HTML, JSX or an autolink",
        source,
        index,
      );
    }
    if (char === "{") {
      throw new UnsupportedInlineMarkdownError(
        "an MDX expression",
        source,
        index,
      );
    }

    if (char === "!" && source[index + 1] === "[") {
      throw new UnsupportedInlineMarkdownError(
        "an inline image, which Notion stores as a block rather than a run",
        source,
        index,
      );
    }

    if (char === "`") {
      const span = readCodeSpan(source, index, end);
      if (!span) {
        throw new UnsupportedInlineMarkdownError(
          "a code span that never closes",
          source,
          index,
        );
      }
      flush();
      items.push(textItem(span.content, annotate(context, "code")));
      index = span.end;
      continue;
    }

    if (char === "[") {
      const link = readLink(source, index, end);
      if (!link.ok) {
        throw new UnsupportedInlineMarkdownError(link.reason, source, index);
      }
      if (context.href !== undefined) {
        throw new UnsupportedInlineMarkdownError(
          "a link inside a link",
          source,
          index,
        );
      }
      flush();
      parse(
        source,
        link.labelStart,
        link.labelEnd,
        { ...context, href: link.url },
        items,
      );
      index = link.end;
      continue;
    }

    if (isDelimiter(char)) {
      const run = delimiterRunAt(source, index, end);
      if (run.canOpen) {
        if (run.length > maxRunLength(char)) {
          throw new UnsupportedInlineMarkdownError(
            `a run of ${run.length} "${char}" characters, which is emphasis this converter cannot place`,
            source,
            index,
          );
        }
        const closer = findCloser(source, index + run.length, end, run);
        if (closer.index !== undefined) {
          flush();
          parse(
            source,
            index + run.length,
            closer.index,
            annotate(context, ...emphasisOf(char, run.length)),
            items,
          );
          index = closer.index + run.length;
          continue;
        }
        if (closer.sawMismatch) {
          throw new UnsupportedInlineMarkdownError(
            `emphasis opened with "${char.repeat(run.length)}" and closed with a run of another length`,
            source,
            index,
          );
        }
      }
      // Nothing can pair with it, so it is the character the author typed —
      // which is exactly how the site renders it.
      literal += char.repeat(run.length);
      index += run.length;
      continue;
    }

    literal += char;
    index += 1;
  }

  flush();
}

function textItem(content: string, context: Context): TextItem {
  const item: TextItem = { type: "text", text: { content } };
  if (context.href !== undefined) {
    item.text.link = { url: context.href };
  }

  const annotations: ItemAnnotations = {};
  let annotated = false;
  for (const key of ANNOTATION_ORDER) {
    if (context.annotations.includes(key)) {
      annotations[key] = true;
      annotated = true;
    }
  }
  if (annotated) {
    item.annotations = annotations;
  }

  return item;
}

function annotate(context: Context, ...added: Annotation[]): Context {
  const annotations = [...context.annotations];
  for (const annotation of added) {
    if (!annotations.includes(annotation)) annotations.push(annotation);
  }
  return { ...context, annotations };
}

function emphasisOf(char: string, length: number): Annotation[] {
  if (char === "~") return ["strikethrough"];
  if (length === 1) return ["italic"];
  if (length === 2) return ["bold"];
  return ["bold", "italic"];
}

// `***text***` is bold and italic at once, which one Notion run holds; GFM
// strikethrough is one or two tildes and nothing longer.
function maxRunLength(char: string): number {
  return char === "~" ? 2 : 3;
}

type DelimiterRun = {
  char: string;
  length: number;
  canOpen: boolean;
  canClose: boolean;
};

// CommonMark's flanking rules, which are what keep `last_edited_time` an
// identifier and "2 * 3 = 6" a multiplication. The character before the run and
// the character after it decide whether it can open emphasis, close it, both or
// neither; the edges of the surrounding text count as whitespace.
function delimiterRunAt(
  source: string,
  index: number,
  end: number,
): DelimiterRun {
  const char = source[index];
  let length = 0;
  while (index + length < end && source[index + length] === char) length += 1;

  const before = index > 0 ? source[index - 1] : undefined;
  const after = index + length < end ? source[index + length] : undefined;

  const beforeWhitespace = before === undefined || isWhitespace(before);
  const afterWhitespace = after === undefined || isWhitespace(after);
  const beforePunctuation = before !== undefined && isPunctuation(before);
  const afterPunctuation = after !== undefined && isPunctuation(after);

  const leftFlanking =
    !afterWhitespace &&
    (!afterPunctuation || beforeWhitespace || beforePunctuation);
  const rightFlanking =
    !beforeWhitespace &&
    (!beforePunctuation || afterWhitespace || afterPunctuation);

  // An underscore may only open or close where it is not sitting inside a word.
  const canOpen =
    char === "_"
      ? leftFlanking && (!rightFlanking || beforePunctuation)
      : leftFlanking;
  const canClose =
    char === "_"
      ? rightFlanking && (!leftFlanking || afterPunctuation)
      : rightFlanking;

  return { char, length, canOpen, canClose };
}

type CloserSearch = {
  index?: number;
  // A run of the same character that could close, but not at this length.
  // CommonMark would split it across two delimiters; which half belongs to
  // which is exactly the guess this converter refuses to make.
  sawMismatch: boolean;
};

function findCloser(
  source: string,
  start: number,
  end: number,
  opener: DelimiterRun,
): CloserSearch {
  let index = start;
  let sawMismatch = false;

  while (index < end) {
    const char = source[index];

    if (char === "\\") {
      index += 2;
      continue;
    }
    // A delimiter inside a code span or a link's destination belongs to that
    // construct, not to the emphasis being closed.
    if (char === "`") {
      const span = readCodeSpan(source, index, end);
      index = span ? span.end : index + 1;
      continue;
    }
    if (char === "[") {
      const link = readLink(source, index, end);
      index = link.ok ? link.end : index + 1;
      continue;
    }

    if (isDelimiter(char)) {
      const run = delimiterRunAt(source, index, end);
      if (run.char === opener.char && run.canClose) {
        if (run.length === opener.length) return { index, sawMismatch };
        sawMismatch = true;
        index += run.length;
        continue;
      }
      if (run.canOpen) {
        // Skip the pair this run opens, so emphasis nested inside is not
        // mistaken for the closer being looked for.
        const inner = findCloser(source, index + run.length, end, run);
        if (inner.index !== undefined) {
          index = inner.index + run.length;
          continue;
        }
        sawMismatch = sawMismatch || inner.sawMismatch;
      }
      index += run.length;
      continue;
    }

    index += 1;
  }

  return { sawMismatch };
}

type CodeSpan = { content: string; end: number };

// CommonMark: a code span closes on a backtick run of exactly the opening
// length, which is what lets a span quote backticks of its own. Nothing inside
// is interpreted — no escapes, no character references.
function readCodeSpan(
  source: string,
  index: number,
  end: number,
): CodeSpan | undefined {
  let opener = 0;
  while (index + opener < end && source[index + opener] === "`") opener += 1;

  let scan = index + opener;
  while (scan < end) {
    if (source[scan] !== "`") {
      scan += 1;
      continue;
    }
    let run = 0;
    while (scan + run < end && source[scan + run] === "`") run += 1;
    if (run === opener) {
      return { content: stripPadding(source.slice(index + opener, scan)), end: scan + run };
    }
    scan += run;
  }

  return undefined;
}

// One space is dropped from each side when the span has both and is not all
// spaces, which is how a span holding a literal backtick is written.
function stripPadding(content: string): string {
  const padded =
    content.length > 1 &&
    content.startsWith(" ") &&
    content.endsWith(" ") &&
    content.trim() !== "";
  return padded ? content.slice(1, -1) : content;
}

type LinkParse =
  | { ok: true; labelStart: number; labelEnd: number; url: string; end: number }
  | { ok: false; reason: string };

// `[label](destination)` and nothing else. A title has nowhere to go in a
// Notion run, and a reference link has no definition to resolve against once
// the paragraph is on its own, so both are refused instead of dropped.
function readLink(source: string, index: number, end: number): LinkParse {
  const labelEnd = findLabelEnd(source, index + 1, end);
  if (labelEnd === undefined) {
    return { ok: false, reason: "an opening bracket that never closes" };
  }
  if (labelEnd === index + 1) {
    return { ok: false, reason: "a link with no label" };
  }
  if (source[labelEnd + 1] === "[") {
    return {
      ok: false,
      reason: "a reference link, which has no definition to resolve here",
    };
  }
  if (labelEnd + 1 >= end || source[labelEnd + 1] !== "(") {
    return {
      ok: false,
      reason: "bracketed text that opens no link — escape it as \\[ if it is literal",
    };
  }

  const destination = readDestination(source, labelEnd + 2, end);
  if (!destination.ok) return destination;

  return {
    ok: true,
    labelStart: index + 1,
    labelEnd,
    url: destination.url,
    end: destination.end,
  };
}

function findLabelEnd(
  source: string,
  start: number,
  end: number,
): number | undefined {
  let depth = 0;
  let index = start;

  while (index < end) {
    const char = source[index];
    if (char === "\\") {
      index += 2;
      continue;
    }
    if (char === "`") {
      const span = readCodeSpan(source, index, end);
      index = span ? span.end : index + 1;
      continue;
    }
    if (char === "[") depth += 1;
    if (char === "]") {
      if (depth === 0) return index;
      depth -= 1;
    }
    index += 1;
  }

  return undefined;
}

type Destination =
  | { ok: true; url: string; end: number }
  | { ok: false; reason: string };

function readDestination(
  source: string,
  start: number,
  end: number,
): Destination {
  if (source[start] === "<") {
    return {
      ok: false,
      reason: "an angle-bracketed link destination, which MDX reads as JSX",
    };
  }

  let url = "";
  let depth = 0;
  let index = start;

  while (index < end) {
    const char = source[index];

    if (char === "\\") {
      const escaped = source[index + 1];
      if (escaped !== undefined && isPunctuation(escaped)) {
        url += escaped;
        index += 2;
        continue;
      }
    }
    if (char === "&") {
      const reference = readReference(source, index, end);
      if (reference) {
        url += reference.value;
        index += reference.length;
        continue;
      }
    }
    if (char === "(") depth += 1;
    if (char === ")") {
      if (depth === 0) {
        return url === ""
          ? { ok: false, reason: "a link with no destination" }
          : { ok: true, url, end: index + 1 };
      }
      depth -= 1;
    }
    if (isWhitespace(char)) {
      return {
        ok: false,
        reason:
          "a link title or a destination containing spaces, neither of which a Notion link holds",
      };
    }

    url += char;
    index += 1;
  }

  return { ok: false, reason: "a link destination that never closes" };
}

// The shape escape.ts guards against, so everything it wrote as an entity is
// read back as the character it stood for.
const REFERENCE =
  /&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([a-zA-Z][a-zA-Z0-9]{0,31}));/y;

// The named references this repo emits, plus the ones a keyboard cannot type.
// An unknown name is refused rather than kept literal: HTML knows two thousand
// of them, and quietly storing "&copy;" as six characters is the silent loss
// this converter exists to prevent.
const NAMED_REFERENCES: Record<string, string> = {
  amp: "&",
  apos: "'",
  bull: "•",
  copy: "©",
  deg: "°",
  euro: "€",
  gt: ">",
  hellip: "…",
  laquo: "«",
  ldquo: "\u201c",
  lsquo: "\u2018",
  lt: "<",
  mdash: "—",
  middot: "·",
  nbsp: "\u00a0",
  ndash: "–",
  plusmn: "±",
  pound: "£",
  quot: '"',
  raquo: "»",
  rdquo: "\u201d",
  reg: "®",
  rsquo: "\u2019",
  times: "×",
  trade: "™",
  yen: "¥",
};

function readReference(
  source: string,
  index: number,
  end: number,
): { value: string; length: number } | undefined {
  REFERENCE.lastIndex = index;
  const match = REFERENCE.exec(source);
  if (!match || index + match[0].length > end) return undefined;

  const [text, decimal, hexadecimal, name] = match;

  if (name !== undefined) {
    const value = NAMED_REFERENCES[name];
    if (value === undefined) {
      throw new UnsupportedInlineMarkdownError(
        `the character reference "${text}", which this converter cannot resolve — write "&amp;" for a literal ampersand`,
        source,
        index,
      );
    }
    return { value, length: text.length };
  }

  const code = Number.parseInt(decimal ?? hexadecimal, decimal ? 10 : 16);
  if (code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) {
    throw new UnsupportedInlineMarkdownError(
      `the character reference "${text}", which names no character`,
      source,
      index,
    );
  }
  return { value: String.fromCodePoint(code), length: text.length };
}

function isDelimiter(char: string): boolean {
  return char === "*" || char === "_" || char === "~";
}

// CommonMark counts every Unicode punctuation and symbol as punctuation, both
// for flanking and for what a backslash may escape — bar the non-ASCII half of
// the latter, which stays literal.
const PUNCTUATION = /[\p{P}\p{S}]/u;
const WHITESPACE = /\s/u;

function isPunctuation(char: string): boolean {
  return PUNCTUATION.test(char);
}

function isWhitespace(char: string): boolean {
  return WHITESPACE.test(char);
}
