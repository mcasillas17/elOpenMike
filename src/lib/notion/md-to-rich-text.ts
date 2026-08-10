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

type Annotation =
  | "bold"
  | "italic"
  | "strikethrough"
  | "underline"
  | "code";

// Written to the request in a fixed order so identical content always
// serializes identically.
const ANNOTATION_ORDER = [
  "bold",
  "italic",
  "strikethrough",
  "underline",
  "code",
] as const satisfies readonly Annotation[];

type Context = {
  annotations: readonly Annotation[];
  // Notion puts the link on the run, so it is inherited by everything inside
  // the label rather than wrapping it.
  href?: string;
};

// What kind of thing was refused, as a name rather than as an excerpt of the
// text. Every refusal has one, so a caller can react to a class of problem
// without parsing prose — and so a message can be built without quoting the
// line it came from.
export type InlineMarkdownCategory =
  | "raw-markup"
  | "mdx-expression"
  | "inline-image"
  | "code-span"
  | "code-element"
  | "link"
  | "emphasis"
  | "character-reference"
  | "scan-budget"
  | "nesting-depth";

// A refusal used to quote the line it choked on, in full, both in its message
// and on the error object. That line is printed to a terminal and, from CI, to
// a public log — and the one line that reaches a refusal is by definition the
// odd one: a link pasted with a session token still in its query, an image URL
// signed by a private CDN, a half-written snippet holding an API key, a
// paragraph pasted out of a terminal. The converter cannot tell which, and it
// does not have to.
//
// So nothing from the text itself is kept: what is reported is a category, the
// reason that category exists, the character offset, and — where the caller
// knows it — the line the block started on. That is enough to open the file and
// put a cursor on the problem, which is all the message was ever for.
export class UnsupportedInlineMarkdownError extends Error {
  readonly category: InlineMarkdownCategory;
  readonly reason: string;
  readonly index: number;
  readonly line?: number;

  constructor(
    category: InlineMarkdownCategory,
    reason: string,
    index: number,
    line?: number,
  ) {
    super(
      `unsupported inline markdown in migration: ${reason} at offset ${index}` +
        (line === undefined ? "" : ` of line ${line}`),
    );
    this.name = "UnsupportedInlineMarkdownError";
    this.category = category;
    this.reason = reason;
    this.index = index;
    if (line !== undefined) this.line = line;
  }
}

// What one line cost to read: the character positions every scan visited, and
// the deepest nesting it reached. Exposed so a test can pin the cost of a
// pathological line to a number rather than to a stopwatch.
export type InlineParseMetrics = { steps: number; depth: number };

export type InlineParseOptions = {
  // True where the line is one cell of a GFM table row. A row is a single line,
  // so a cell holding two lines has nowhere to put the break except the
  // `<br />` blocks-to-md writes there — and only there. See readLineBreak.
  tableCell?: boolean;
  // Which line of the post this text opened on, where the caller knows. It is
  // reported instead of the text, so a refusal is locatable without being
  // quotable. 1-based, as an editor counts.
  line?: number;
  // The ceiling on `steps`. Defaults to inlineScanBudget(markdown.length).
  maxSteps?: number;
  onMetrics?: (metrics: InlineParseMetrics) => void;
};

// The memo below makes the search polynomial rather than exponential, and the
// budget is what stands behind it: a shape nobody anticipated stops with a
// located refusal instead of holding a sync open or exhausting the heap. It is
// deliberately far above anything prose reaches — the paragraph these posts
// open with costs a few hundred steps for a few hundred characters — so a line
// that meets it is not a line anyone wrote by hand.
export const INLINE_SCAN_BUDGET_BASE = 20_000;
export const INLINE_SCAN_BUDGET_PER_CHARACTER = 4_000;

export function inlineScanBudget(length: number): number {
  return INLINE_SCAN_BUDGET_BASE + INLINE_SCAN_BUDGET_PER_CHARACTER * length;
}

// Each unpaired opener recurses to look for its closer, so nesting is stack
// depth. Real markdown nests three or four deep; hundreds is a line built to
// break something, and a RangeError from a blown stack is not a refusal
// anybody can act on.
export const MAX_INLINE_DEPTH = 500;

class ScanBudget {
  steps = 0;
  depth = 0;
  deepest = 0;

  constructor(
    private readonly line: number | undefined,
    private readonly maxSteps: number,
  ) {}

  // Charged per character visited, wherever the scan visits it, so `steps` is
  // the honest total cost of reading the line.
  spend(index: number, count = 1): void {
    this.steps += count;
    if (this.steps > this.maxSteps) {
      throw new UnsupportedInlineMarkdownError(
        "scan-budget",
        `inline markdown whose delimiters need more than ${this.maxSteps} scan ` +
          "steps to resolve — simplify the emphasis on this line",
        index,
        this.line,
      );
    }
  }

  descend<T>(index: number, work: () => T): T {
    if (this.depth >= MAX_INLINE_DEPTH) {
      throw new UnsupportedInlineMarkdownError(
        "nesting-depth",
        `inline markdown nested more than ${MAX_INLINE_DEPTH} levels deep`,
        index,
        this.line,
      );
    }
    this.depth += 1;
    if (this.depth > this.deepest) this.deepest = this.depth;
    try {
      return work();
    } finally {
      this.depth -= 1;
    }
  }
}

// Everything one call to inlineToRichText shares: the text, the runs being
// built, the answers already worked out, and what is left of the budget.
type Scan = {
  source: string;
  items: TextItem[];
  closers: CloserMemo;
  budget: ScanBudget;
  tableCell: boolean;
  // The line this text opened on, when the caller knew it. Reported in place
  // of the text itself; see UnsupportedInlineMarkdownError.
  line?: number;
};

// Every refusal inside the scan goes through here, so none of them can reach
// for `scan.source` on the way out.
function refuse(
  scan: Scan,
  category: InlineMarkdownCategory,
  reason: string,
  index: number,
): never {
  throw new UnsupportedInlineMarkdownError(category, reason, index, scan.line);
}

// The runs one line of inline Markdown describes. Throws
// UnsupportedInlineMarkdownError for anything Notion's rich text cannot hold,
// and for anything that would cost more to read than the budget allows.
export function inlineToRichText(
  markdown: string,
  { maxSteps, onMetrics, tableCell = false, line }: InlineParseOptions = {},
): RichTextInput {
  const budget = new ScanBudget(
    line,
    maxSteps ?? inlineScanBudget(markdown.length),
  );
  const scan: Scan = {
    source: markdown,
    items: [],
    closers: new Map(),
    budget,
    tableCell,
    line,
  };

  try {
    parse(scan, 0, markdown.length, { annotations: [] }, NOTHING_ENCLOSING);
  } finally {
    onMetrics?.({ steps: budget.steps, depth: budget.deepest });
  }

  return scan.items;
}

function parse(
  scan: Scan,
  start: number,
  end: number,
  context: Context,
  // The delimiter runs still open around this text. A run of one of them
  // inside is a pair crossing this one rather than nesting in it.
  enclosing: Enclosing,
): void {
  const { source, budget } = scan;
  let literal = "";
  let index = start;

  const flush = () => {
    if (literal !== "") {
      scan.items.push(textItem(literal, context));
      literal = "";
    }
  };

  while (index < end) {
    budget.spend(index);
    const char = source[index];

    if (char === "\\") {
      const escaped = source[index + 1];
      // CommonMark: a backslash only escapes ASCII punctuation. Before a
      // letter, an em dash or a non-breaking space it is the backslash the
      // author typed, and markdown renders it.
      if (index + 1 < end && escaped !== undefined && isEscapable(escaped)) {
        literal += escaped;
        index += 2;
      } else {
        literal += char;
        index += 1;
      }
      continue;
    }

    if (char === "&") {
      const reference = readReference(scan, index, end);
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
    // Neither survives the trip into a Notion run — except for the three
    // elements rich-text.ts writes on purpose, which are annotations spelled
    // another way. See readGeneratedElement.
    if (char === "<") {
      const lineBreak = readLineBreak(scan, index, end);
      if (lineBreak !== undefined) {
        literal += "\n";
        index = lineBreak;
        continue;
      }
      const element = readGeneratedElement(scan, index, end);
      if (!element) {
        refuse(scan, "raw-markup", "raw HTML, JSX or an autolink", index);
      }
      flush();
      // `<code>` holds a code run's text, which is not markdown: reading it as
      // markdown would turn the snippet's own asterisks into emphasis.
      if (element.annotation === "code") {
        scan.items.push(
          textItem(
            readCodeElementText(scan, element.contentStart, element.contentEnd),
            annotate(context, "code"),
          ),
        );
      } else {
        budget.descend(index, () =>
          parse(
            scan,
            element.contentStart,
            element.contentEnd,
            annotate(context, element.annotation),
            enclosing,
          ),
        );
      }
      index = element.end;
      continue;
    }
    if (char === "{") {
      refuse(scan, "mdx-expression", "an MDX expression", index);
    }

    if (char === "!" && source[index + 1] === "[") {
      refuse(
        scan,
        "inline-image",
        "an inline image, which Notion stores as a block rather than a run",
        index,
      );
    }

    if (char === "`") {
      const span = readCodeSpan(scan, index, end);
      if (!span) {
        refuse(scan, "code-span", "a code span that never closes", index);
      }
      flush();
      scan.items.push(textItem(span.content, annotate(context, "code")));
      index = span.end;
      continue;
    }

    if (char === "[") {
      const link = readLink(scan, index, end);
      if (!link.ok) {
        refuse(scan, "link", link.reason, index);
      }
      if (context.href !== undefined) {
        refuse(scan, "link", "a link inside a link", index);
      }
      flush();
      budget.descend(index, () =>
        parse(
          scan,
          link.labelStart,
          link.labelEnd,
          { ...context, href: link.url },
          enclosing,
        ),
      );
      index = link.end;
      continue;
    }

    if (isDelimiter(char)) {
      const run = delimiterRunAt(scan, index, end);
      if (run.canOpen) {
        if (run.length > maxRunLength(char)) {
          refuse(
            scan,
            "emphasis",
            `a run of ${run.length} emphasis delimiters, which is emphasis ` +
              "this converter cannot place",
            index,
          );
        }
        const closer = findCloser(
          scan,
          index + run.length,
          end,
          run,
          enclosing,
        );
        if (closer.sawMismatch) {
          refuse(
            scan,
            "emphasis",
            `emphasis opened with a run of ${run.length} delimiters and a run ` +
              "of another length between it and its closer",
            index,
          );
        }
        if (closer.sawCrossing) {
          refuse(
            scan,
            "emphasis",
            `emphasis opened with a run of ${run.length} delimiters and ` +
              "crossed by another delimiter's pair rather than containing it",
            index,
          );
        }
        if (closer.index !== undefined) {
          flush();
          const inner = closer.index;
          budget.descend(index, () =>
            parse(
              scan,
              index + run.length,
              inner,
              annotate(context, ...emphasisOf(char, run.length)),
              open(enclosing, char),
            ),
          );
          index = inner + run.length;
          continue;
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
// neither; the edges of the line count as whitespace.
//
// One exception on top, which the site's pipeline has: the delimiters
// themselves are "attention markers", so a `*` or `_` run touching one of them
// may open or close even though they are punctuation. `~` joins the set when
// GFM strikethrough is on, which is what makes "prose**~~struck~~**" bold and
// struck rather than four literal asterisks. Strikethrough's own runs get no
// such exemption. Mirrors micromark-core-commonmark's attention tokenizer, the
// default attentionMarkers, and micromark-extension-gfm-strikethrough.
const ATTENTION_MARKERS = new Set(["*", "_", "~"]);

function delimiterRunAt(scan: Scan, index: number, end: number): DelimiterRun {
  const { source } = scan;
  const char = source[index];
  let length = 0;
  while (index + length < end && source[index + length] === char) length += 1;
  scan.budget.spend(index, length);

  // The real neighbours, not the ends of the range being parsed: markdown
  // classified them against the whole line.
  const before = index > 0 ? source[index - 1] : undefined;
  const after = source[index + length];

  const beforeWhitespace = before === undefined || isWhitespace(before);
  const afterWhitespace = after === undefined || isWhitespace(after);
  const beforePunctuation = before !== undefined && isPunctuation(before);
  const afterPunctuation = after !== undefined && isPunctuation(after);
  const beforeOther = !beforeWhitespace && !beforePunctuation;
  const afterOther = !afterWhitespace && !afterPunctuation;

  // Strikethrough is tokenized by an extension of its own, which does not
  // consult the marker set.
  const marked = char !== "~";
  const opens =
    afterOther ||
    (afterPunctuation && !beforeOther) ||
    (marked && after !== undefined && ATTENTION_MARKERS.has(after));
  const closes =
    beforeOther ||
    (beforePunctuation && !afterOther) ||
    (marked && before !== undefined && ATTENTION_MARKERS.has(before));

  // An underscore may only open or close where it is not sitting inside a word.
  const canOpen =
    char === "_" ? opens && (!beforeOther || !closes) : opens;
  const canClose =
    char === "_" ? closes && (!afterOther || !opens) : closes;

  return { char, length, canOpen, canClose };
}

type CloserSearch = {
  index?: number;
  // A run of the same character that could close, but not at this length —
  // whether or not a closer was found after it. CommonMark splits such a run
  // across two delimiters, and which half belongs to which is exactly the
  // guess this converter refuses to make: "*foo **bar*" is a literal "*foo *"
  // and an italic "bar", not the italic "foo **bar" it looks like.
  sawMismatch: boolean;
  // A run of a delimiter still open further out, closing inside this one.
  // Markdown gives that pair the characters; this converter would have to take
  // them from it, so the line is refused instead.
  sawCrossing: boolean;
};

// Every answer is a pure function of where the search starts, where it stops,
// which run it is looking for, and which markers are open around it — and the
// same question is asked again for every opener that turns out not to pair off.
// Remembering the answers is what keeps a line of unpaired delimiters —
// "*.ts *.tsx *.js *.jsx …" — from taking exponential time to refuse.
//
// The key has to be canonical or the memo does not work. The scan asks one
// thing of the delimiters open around it: is this marker one of them. So the
// *set* of markers is the state, and the key spells it as a bitmask. Keying on
// the stack itself — "*_~" against "~_*" against "**_" — made every permutation
// a separate entry, the memo missed on all of them, and the exponential search
// it exists to prevent came straight back: seventy-five characters of
// interleaved markers took three seconds, and a hundred did not finish.
type Enclosing = number;

const NOTHING_ENCLOSING: Enclosing = 0;

const MARKER_BIT: Record<string, Enclosing> = { "*": 1, _: 2, "~": 4 };

function open(enclosing: Enclosing, char: string): Enclosing {
  return enclosing | (MARKER_BIT[char] ?? 0);
}

function encloses(enclosing: Enclosing, char: string): boolean {
  return (enclosing & (MARKER_BIT[char] ?? 0)) !== 0;
}

type CloserMemo = Map<string, CloserSearch>;

function findCloser(
  scan: Scan,
  start: number,
  end: number,
  opener: DelimiterRun,
  enclosing: Enclosing,
): CloserSearch {
  const key = `${start}:${end}:${opener.char}:${opener.length}:${enclosing}`;
  const remembered = scan.closers.get(key);
  if (remembered) return remembered;

  const found = scan.budget.descend(start, () =>
    scanForCloser(scan, start, end, opener, enclosing),
  );
  scan.closers.set(key, found);
  return found;
}

function scanForCloser(
  scan: Scan,
  start: number,
  end: number,
  opener: DelimiterRun,
  enclosing: Enclosing,
): CloserSearch {
  const { source, budget } = scan;
  const inside = open(enclosing, opener.char);
  let index = start;
  let sawMismatch = false;
  let sawCrossing = false;

  while (index < end) {
    budget.spend(index);
    const char = source[index];

    if (char === "\\") {
      index += 2;
      continue;
    }
    // A delimiter inside a code span or a link's destination belongs to that
    // construct, not to the emphasis being closed.
    if (char === "`") {
      const span = readCodeSpan(scan, index, end);
      index = span ? span.end : index + 1;
      continue;
    }
    if (char === "[") {
      const link = readLink(scan, index, end);
      index = link.ok ? link.end : index + 1;
      continue;
    }
    // The children of a generated element are parsed as markdown, but a
    // delimiter inside one cannot pair with a delimiter outside it.
    if (char === "<") {
      const lineBreak = readLineBreak(scan, index, end);
      if (lineBreak !== undefined) {
        index = lineBreak;
        continue;
      }
      const element = readGeneratedElement(scan, index, end);
      index = element ? element.end : index + 1;
      continue;
    }

    if (isDelimiter(char)) {
      const run = delimiterRunAt(scan, index, end);
      if (run.char === opener.char && run.canClose) {
        if (run.length === opener.length) {
          return { index, sawMismatch, sawCrossing };
        }
        sawMismatch = true;
        index += run.length;
        continue;
      }
      // A run that closes a pair opened outside this one: the two overlap
      // instead of nesting, and markdown resolves that in a way no set of
      // annotations reproduces.
      if (run.canClose && encloses(enclosing, run.char)) {
        sawCrossing = true;
      }
      if (run.canOpen) {
        // Skip the pair this run opens, so emphasis nested inside is not
        // mistaken for the closer being looked for. What it could not pair off
        // carries out: in "*foo **bar* baz**" the runs interleave rather than
        // nest, and CommonMark splits them across both pairs.
        const inner = findCloser(scan, index + run.length, end, run, inside);
        sawMismatch = sawMismatch || inner.sawMismatch;
        sawCrossing = sawCrossing || inner.sawCrossing;
        if (inner.index !== undefined) {
          index = inner.index + run.length;
          continue;
        }
      }
      index += run.length;
      continue;
    }

    index += 1;
  }

  return { sawMismatch, sawCrossing };
}

// rich-text.ts writes an annotation as one of these three elements wherever two
// generated delimiter runs would sit flush against each other: delimiter runs
// are maximal, so `**a**` beside `**b**` is a run of four asterisks that opens
// and closes nothing, while `<strong>a</strong>**b**` says exactly what was
// meant. They are this repo's own output, so reading them back is reading a
// bold, italic or struck run — and a synced post that carries one has to be
// migratable again.
//
// Nothing else is accepted. The tag must be one of these three names in lower
// case, with no attributes and no whitespace inside the angle brackets, and it
// must close. Anything else is the raw HTML this converter has always refused,
// which is what keeps `<script>`, `<em onclick=…>` and a half-open tag out of a
// Notion page.
const GENERATED_ELEMENTS: Record<string, Annotation> = {
  strong: "bold",
  em: "italic",
  del: "strikethrough",
  // A code run carrying a line ending, which no backtick span can hold: see
  // code-span.ts. Its children are literal text rather than markdown, so
  // readCodeElementText below reads them instead of parse().
  code: "code",
  // Underline, which markdown has no delimiter for at all: rich-text.ts writes
  // every annotation on such a run as an element, so this is the only spelling
  // of it there is to read.
  u: "underline",
};

const OPENING_TAG = /^<(strong|em|del|code|u)>/;

// A GFM table row is one line, so blocks-to-md writes a cell's line endings as
// this element — self-closing, because MDX reads raw HTML as JSX and a bare
// `<br>` makes the generated file fail to compile. It is written in a table
// cell and nowhere else (a paragraph keeps its line endings as line endings),
// so it is read back in a table cell and nowhere else.
//
// The match is the exact six characters the converter emits. `<br>`, `<br/>`,
// `<br  />` and anything carrying an attribute are somebody else's HTML, and
// the rule that has always kept `<script>` and `<img onerror=…>` out of a
// Notion page is that this converter reads only what it writes.
const LINE_BREAK_ELEMENT = "<br />";

function readLineBreak(
  scan: Scan,
  index: number,
  end: number,
): number | undefined {
  if (!scan.tableCell) return undefined;
  const past = index + LINE_BREAK_ELEMENT.length;
  if (past > end || !scan.source.startsWith(LINE_BREAK_ELEMENT, index)) {
    return undefined;
  }
  scan.budget.spend(index, LINE_BREAK_ELEMENT.length);
  return past;
}

type GeneratedElement = {
  annotation: Annotation;
  contentStart: number;
  contentEnd: number;
  end: number;
};

function readGeneratedElement(
  scan: Scan,
  index: number,
  end: number,
): GeneratedElement | undefined {
  const { source, budget } = scan;
  const match = OPENING_TAG.exec(source.slice(index, end));
  if (!match) return undefined;

  const name = match[1];
  const opening = `<${name}>`;
  const closing = `</${name}>`;
  const contentStart = index + opening.length;

  // The closing tag that belongs to *this* opening one, so an element of the
  // same name nested inside closes itself first.
  let depth = 0;
  let scanned = contentStart;
  while (scanned < end) {
    budget.spend(scanned);
    if (scanned + opening.length <= end && source.startsWith(opening, scanned)) {
      depth += 1;
      scanned += opening.length;
      continue;
    }
    if (scanned + closing.length <= end && source.startsWith(closing, scanned)) {
      if (depth === 0) {
        return {
          annotation: GENERATED_ELEMENTS[name],
          contentStart,
          contentEnd: scanned,
          end: scanned + closing.length,
        };
      }
      depth -= 1;
      scanned += closing.length;
      continue;
    }
    scanned += 1;
  }

  return undefined;
}

type CodeSpan = { content: string; end: number };
// CommonMark: a code span closes on a backtick run of exactly the opening
// length, which is what lets a span quote backticks of its own. Nothing inside
// is interpreted — no escapes, no character references.
function readCodeSpan(
  scan: Scan,
  index: number,
  end: number,
): CodeSpan | undefined {
  const { source, budget } = scan;
  let opener = 0;
  while (index + opener < end && source[index + opener] === "`") opener += 1;

  let scanned = index + opener;
  budget.spend(index, opener);
  while (scanned < end) {
    budget.spend(scanned);
    if (source[scanned] !== "`") {
      scanned += 1;
      continue;
    }
    let run = 0;
    while (scanned + run < end && source[scanned + run] === "`") run += 1;
    if (run === opener) {
      return {
        content: stripPadding(
          flattenLineEndings(source.slice(index + opener, scanned)),
        ),
        end: scanned + run,
      };
    }
    scanned += run;
  }

  return undefined;
}

// CommonMark converts every line ending inside a code span to a space, and only
// then strips the padding. A span spread over two lines therefore reaches the
// reader as one line, so one line is what Notion is told the page says —
// storing the newline would put text into the database that the page never
// showed, and the next sync would write it back as a `<code>` element nobody
// asked for. The element is how a line ending is carried on purpose; a span is
// not.
const CODE_SPAN_LINE_ENDING = /\r\n|\r|\n/g;

function flattenLineEndings(content: string): string {
  return content.replace(CODE_SPAN_LINE_ENDING, " ");
}

// The children of a generated `<code>` element: the literal text of a code run,
// written by escapeMarkdown and with its line endings written as character
// references. Every character markdown would read as syntax is escaped there,
// so an unescaped one here is not this converter's output — it is raw HTML, or
// a hand-written tag, and it is refused rather than half-read. That is what
// keeps `<code><script>…</script></code>` and `<code>a<strong>b</strong></code>`
// out of a Notion page.
const FOREIGN_IN_CODE = new Set(["<", "{", "}", "`", "*", "[", "]", "~"]);

function readCodeElementText(scan: Scan, start: number, end: number): string {
  const { source, budget } = scan;
  let text = "";
  let index = start;

  while (index < end) {
    budget.spend(index);
    const char = source[index];

    if (char === "\\") {
      const escaped = source[index + 1];
      // escapeMarkdown writes a literal backslash as `\\`, so a backslash
      // before anything else was never written by it.
      if (index + 1 >= end || escaped === undefined || !isEscapable(escaped)) {
        refuse(
          scan,
          "code-element",
          "a backslash inside a code element that escapes nothing",
          index,
        );
      }
      text += escaped;
      index += 2;
      continue;
    }

    if (char === "&") {
      const reference = readReference(scan, index, end);
      if (reference) {
        text += reference.value;
        index += reference.length;
        continue;
      }
    }

    if (FOREIGN_IN_CODE.has(char)) {
      refuse(
        scan,
        "code-element",
        "an unescaped markdown delimiter inside a code element, which this " +
          "converter never writes",
        index,
      );
    }

    text += char;
    index += 1;
  }

  return text;
}

// One space is dropped from each side when the span has both and is not made of
// spaces alone, which is how a span holding a literal backtick is written. A
// tab is content, not padding, so a span of " \t " really does hold the tab and
// nothing else.
const NOT_A_SPACE = /[^ ]/;

function stripPadding(content: string): string {
  const padded =
    content.startsWith(" ") &&
    content.endsWith(" ") &&
    NOT_A_SPACE.test(content);
  return padded ? content.slice(1, -1) : content;
}

type LinkParse =
  | { ok: true; labelStart: number; labelEnd: number; url: string; end: number }
  | { ok: false; reason: string };

// `[label](destination)` and nothing else. A title has nowhere to go in a
// Notion run, and a reference link has no definition to resolve against once
// the paragraph is on its own, so both are refused instead of dropped.
function readLink(scan: Scan, index: number, end: number): LinkParse {
  const { source } = scan;
  const labelEnd = findLabelEnd(scan, index + 1, end);
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

  const destination = readDestination(scan, labelEnd + 2, end);
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
  scan: Scan,
  start: number,
  end: number,
): number | undefined {
  const { source, budget } = scan;
  let depth = 0;
  let index = start;

  while (index < end) {
    budget.spend(index);
    const char = source[index];
    if (char === "\\") {
      index += 2;
      continue;
    }
    if (char === "`") {
      const span = readCodeSpan(scan, index, end);
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

function readDestination(scan: Scan, start: number, end: number): Destination {
  const { source, budget } = scan;
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
    budget.spend(index);
    const char = source[index];

    if (char === "\\") {
      const escaped = source[index + 1];
      if (escaped !== undefined && isEscapable(escaped)) {
        url += escaped;
        index += 2;
        continue;
      }
    }
    if (char === "&") {
      const reference = readReference(scan, index, end);
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
  scan: Scan,
  index: number,
  end: number,
): { value: string; length: number } | undefined {
  REFERENCE.lastIndex = index;
  const match = REFERENCE.exec(scan.source);
  if (!match || index + match[0].length > end) return undefined;

  const [text, decimal, hexadecimal, name] = match;

  if (name !== undefined) {
    const value = NAMED_REFERENCES[name];
    if (value === undefined) {
      // The reference itself is not repeated: `&name;` is source text like any
      // other, and the offset already points at it.
      refuse(
        scan,
        "character-reference",
        "a character reference this converter cannot resolve — write " +
          '"&amp;" for a literal ampersand',
        index,
      );
    }
    return { value, length: text.length };
  }

  const code = Number.parseInt(decimal ?? hexadecimal, decimal ? 10 : 16);
  if (namesNoCharacter(code)) {
    refuse(
      scan,
      "character-reference",
      "a character reference for a code point markdown renders as the " +
        "replacement character",
      index,
    );
  }
  return { value: String.fromCodePoint(code), length: text.length };
}

// The code points markdown refuses to produce, replacing each with U+FFFD:
// control characters, surrogates, the noncharacters, and anything past the last
// plane. Storing a replacement character nobody typed is the silent loss this
// converter exists to prevent, so the reference is refused instead. Mirrors
// micromark-util-decode-numeric-character-reference.
function namesNoCharacter(code: number): boolean {
  return (
    code < 9 ||
    code === 11 ||
    (code > 13 && code < 32) ||
    (code > 126 && code < 160) ||
    (code > 0xd7ff && code < 0xe000) ||
    (code > 0xfdcf && code < 0xfdf0) ||
    (code & 0xffff) === 0xfffe ||
    (code & 0xffff) === 0xffff ||
    code > 0x10ffff
  );
}

function isDelimiter(char: string): boolean {
  return char === "*" || char === "_" || char === "~";
}

// CommonMark counts every Unicode punctuation and symbol as punctuation for
// flanking, but only ASCII punctuation may be backslash-escaped.
const PUNCTUATION = /[\p{P}\p{S}]/u;
const ASCII_PUNCTUATION = /[!-/:-@[-`{-~]/;
const WHITESPACE = /\s/u;

function isPunctuation(char: string): boolean {
  return PUNCTUATION.test(char);
}

function isEscapable(char: string): boolean {
  return ASCII_PUNCTUATION.test(char);
}

function isWhitespace(char: string): boolean {
  return WHITESPACE.test(char);
}
