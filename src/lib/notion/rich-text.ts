import type { Annotations, RichText } from "./types";
import { inlineCodeSpan } from "./code-span";
import { endsAtLineStart, escapeMarkdown } from "./escape";
import { markdownDestination } from "./link-destination";
import {
  classifyCharacter,
  firstCharacter,
  lastCharacter,
  needsPunctuationOpposite,
  referenceEdge,
  splitEdgeWhitespace,
} from "./flanking";

export type RichTextOptions = {
  // False where the text cannot open a block: a heading's content, a table
  // cell, an image's alt text. See escape.ts.
  atLineStart?: boolean;
  onWarning?: (message: string) => void;
};

// Notion's annotations are a property of a run; CommonMark's emphasis is a
// property of a *boundary*. Bridging the two takes three moves, in this order:
//
//   1. Runs that render identically are written as one span, so the editor
//      splitting a word in two cannot put `~~a~~~~b~~` on the page.
//   2. Whitespace at the edge of an annotated run is written outside the
//      delimiters. The text and its order are untouched — the space was never
//      part of the formatting — and a delimiter beside a space is exactly what
//      CommonMark refuses to read.
//   3. What is left is checked against the neighbouring run. Where punctuation
//      leaves a delimiter unable to flank, the neighbouring literal character
//      is written as the numeric character reference it already renders as.
//      Where two generated delimiter runs would touch and fuse, the annotation
//      is written as the element it stands for instead — `<strong>` says what
//      `**` cannot say there, and needs no flanking at all.
//
// See flanking.ts for the rules being satisfied.

// One group of adjacent runs, rendered, along with what its delimiters still
// need from whatever ends up beside them.
type Segment = {
  markdown: string;
  // The Markdown of the group with its annotations written as elements, for
  // when the delimiters above cannot be used at all.
  asElements: string;
  // "*", "~", or "" where the group generated no emphasis.
  marker: string;
  openNeedsPunctuation: boolean;
  closeNeedsPunctuation: boolean;
  // True where a delimiter run sits flush against the group's edge, and so
  // would fuse with a run of the same marker in the neighbouring group.
  opensFlush: boolean;
  closesFlush: boolean;
  // A link opening the group turns a literal `!` in front of it into an image.
  opensLink: boolean;
};

export function richTextToMarkdown(
  rich: RichText[],
  { atLineStart = true, onWarning }: RichTextOptions = {},
): string {
  let lineStart = atLineStart;
  const segments: Segment[] = [];

  for (const group of groupRuns(rich)) {
    const rendered = renderGroup(group, lineStart, onWarning);
    segments.push(rendered.segment);
    lineStart = rendered.lineStart;
  }

  return settleBoundaries(segments).join("");
}

// Notion splits rich text wherever the editor happened to: a word typed in two
// sittings, a colour change, a spellcheck. Runs that render the same way are
// one span as far as Markdown is concerned. `code` is left out of the key
// because it wraps the text *inside* any shared emphasis, so a struck code span
// and the struck words after it still share one pair of tildes.
function groupRuns(rich: RichText[]): RichText[][] {
  const groups: RichText[][] = [];
  let key: string | undefined;

  for (const run of rich) {
    const runKey = groupKey(run);
    if (runKey === key && groups.length > 0) {
      groups[groups.length - 1].push(run);
      continue;
    }
    groups.push([run]);
    key = runKey;
  }

  return groups;
}

function groupKey(run: RichText): string {
  const { bold, italic, strikethrough } = run.annotations;
  return JSON.stringify([bold, italic, strikethrough, run.href]);
}

// Adjacent runs that are both code, or both not, are one piece of text: two
// code spans written back to back would fuse their backticks the same way two
// emphasis runs fuse their asterisks.
function mergeByCode(runs: RichText[]): Array<{ code: boolean; text: string }> {
  const pieces: Array<{ code: boolean; text: string }> = [];

  for (const run of runs) {
    const code = run.annotations.code;
    const last = pieces[pieces.length - 1];
    if (last !== undefined && last.code === code) {
      last.text += run.plain_text;
      continue;
    }
    pieces.push({ code, text: run.plain_text });
  }

  return pieces;
}

function renderGroup(
  runs: RichText[],
  atLineStart: boolean,
  onWarning?: (message: string) => void,
): { segment: Segment; lineStart: boolean } {
  const annotations = runs[0].annotations;
  const { bold, italic, strikethrough } = annotations;
  const href = runs[0].href;
  // A URL Markdown cannot spell as a destination, or one that is a way to run
  // code rather than a place to go, leaves the text as text: dropping the link
  // loses one attribute, writing it loses the reader's trust.
  const destination =
    typeof href === "string" ? markdownDestination(href) : undefined;
  if (typeof href === "string" && destination === undefined) {
    onWarning?.(`dropped a link to an unsupported url: ${href}`);
  }
  const insideLink = destination !== undefined;
  const emphasised = bold || italic || strikethrough;
  const pieces = mergeByCode(runs);
  // Whatever the group writes first: a delimiter of its own means the text no
  // longer sits at the start of a line — and a delimiter is not a block marker,
  // so nothing after it can open one either.
  const opensWithDelimiter = emphasised || insideLink || pieces[0].code;

  let lineStart = atLineStart;
  let inner = "";
  for (const piece of pieces) {
    // Inline code must preserve raw text so snippets like `<T>` render
    // literally instead of being MDX-escaped, and its delimiter outgrows any
    // backtick run inside, or the span would close on the first one.
    //
    // Anything else is literal prose and is escaped, so Markdown the author
    // never typed cannot appear. Every wrapper below is generated after the
    // escape pass has finished, so a wrapper is never escaped.
    inner += piece.code
      ? inlineCodeSpan(piece.text)
      : escapeMarkdown(piece.text, lineStart && !opensWithDelimiter);
    lineStart =
      piece.text.trim() !== "" && (opensWithDelimiter || piece.code)
        ? false
        : endsAtLineStart(piece.text, lineStart);
  }

  // Whitespace-only runs often carry incidental annotations from the editor,
  // but wrapping them would change layout — and there is no text to emphasise.
  if (inner.trim() === "") {
    return { segment: plainSegment(inner, false), lineStart };
  }

  if (!emphasised) {
    return {
      segment: plainSegment(
        insideLink ? `[${inner}](${destination})` : inner,
        insideLink,
      ),
      lineStart: insideLink ? false : lineStart,
    };
  }

  const { lead, core, trail } = splitEdgeWhitespace(inner);
  const layers = delimiterLayers(annotations);
  const wrapped = wrapDelimiters(core, annotations);
  const marker = layers[0][0];
  // What the outermost delimiter run actually touches on the inside. Delimiter
  // runs are maximal, so the `**` of bold and the `*` of italic written back to
  // back are one run of three, and what it touches is the first layer written
  // with another character — or the text itself. Read from the structure rather
  // than scanned back off `wrapped`, where a trailing `\*` the escaper wrote is
  // indistinguishable from a delimiter of our own.
  let outermost = 0;
  while (outermost < layers.length && layers[outermost][0] === marker) {
    outermost += 1;
  }
  const inside = layers[outermost] ?? core;
  const withElements = `${lead}${wrapElements(core, annotations)}${trail}`;
  const withDelimiters = `${lead}${wrapped}${trail}`;

  // Inside a link the delimiters are already surrounded by the brackets, which
  // are punctuation and flank them for free.
  return {
    segment: {
      markdown: insideLink
        ? `[${withDelimiters}](${destination})`
        : withDelimiters,
      asElements: insideLink
        ? `[${withElements}](${destination})`
        : withElements,
      marker,
      openNeedsPunctuation:
        !insideLink &&
        lead === "" &&
        needsPunctuationOpposite(firstCharacter(inside), marker),
      closeNeedsPunctuation:
        !insideLink &&
        trail === "" &&
        needsPunctuationOpposite(lastCharacter(inside), marker),
      opensFlush: !insideLink && lead === "",
      closesFlush: !insideLink && trail === "",
      opensLink: insideLink,
    },
    lineStart: insideLink ? false : endsAtLineStart(trail, false),
  };
}

function plainSegment(markdown: string, opensLink: boolean): Segment {
  return {
    markdown,
    asElements: markdown,
    marker: "",
    openNeedsPunctuation: false,
    closeNeedsPunctuation: false,
    opensFlush: false,
    closesFlush: false,
    opensLink,
  };
}

// Strikethrough sits innermost and bold outermost, so code, strike and italic
// all stay inside whatever wraps them — and inside a link's anchor text. The
// layers are listed outermost first, because only the outermost run of the
// group ever touches a neighbouring one.
function delimiterLayers(annotations: Annotations): string[] {
  const layers: string[] = [];
  if (annotations.bold) layers.push("**");
  if (annotations.italic) layers.push("*");
  if (annotations.strikethrough) layers.push("~~");
  return layers;
}

function wrapDelimiters(core: string, annotations: Annotations): string {
  return delimiterLayers(annotations).reduceRight(
    (wrapped, layer) => `${layer}${wrapped}${layer}`,
    core,
  );
}

// The same nesting, in the elements the delimiters stand for. MDX reads these
// as JSX and still parses their children as Markdown, so an escaped character
// or a code span inside one is unaffected.
function wrapElements(core: string, annotations: Annotations): string {
  let wrapped = core;
  if (annotations.strikethrough) wrapped = `<del>${wrapped}</del>`;
  if (annotations.italic) wrapped = `<em>${wrapped}</em>`;
  if (annotations.bold) wrapped = `<strong>${wrapped}</strong>`;
  return wrapped;
}

// Walks the rendered groups left to right and settles what each boundary needs.
// Rewriting a neighbour's character can only turn it from "other" into
// punctuation, which is the one thing a stranded delimiter ever asks for, so no
// repair here can undo another.
function settleBoundaries(segments: Segment[]): string[] {
  const pieces = segments.map((segment) => segment.markdown);

  segments.forEach((segment, index) => {
    const before = previousCharacter(pieces, index);
    const after = nextCharacter(pieces, index);

    // Two delimiter runs of the same marker written back to back are a single
    // longer run, and what it pairs with is no longer ours to say. The element
    // form carries the annotation across that boundary intact.
    if (
      (segment.opensFlush && before === segment.marker) ||
      (segment.closesFlush && after === segment.marker)
    ) {
      pieces[index] = segment.asElements;
      return;
    }

    if (segment.openNeedsPunctuation && classifyCharacter(before) === "other") {
      const neighbour = previousIndex(pieces, index);
      if (neighbour !== undefined) {
        pieces[neighbour] = referenceEdge(pieces[neighbour], "last");
      }
    }

    if (segment.closeNeedsPunctuation && classifyCharacter(after) === "other") {
      const neighbour = nextIndex(pieces, index);
      if (neighbour !== undefined) {
        pieces[neighbour] = referenceEdge(pieces[neighbour], "first");
      }
    }

    // `!` in front of a link is Markdown's image syntax, and the exclamation
    // mark is the author's prose rather than a marker they typed.
    if (segment.opensLink && before === "!") {
      const neighbour = previousIndex(pieces, index);
      if (neighbour !== undefined) {
        pieces[neighbour] = `${pieces[neighbour].slice(0, -1)}\\!`;
      }
    }
  });

  return pieces;
}

function previousIndex(pieces: string[], index: number): number | undefined {
  for (let i = index - 1; i >= 0; i -= 1) {
    if (pieces[i] !== "") return i;
  }
  return undefined;
}

function nextIndex(pieces: string[], index: number): number | undefined {
  for (let i = index + 1; i < pieces.length; i += 1) {
    if (pieces[i] !== "") return i;
  }
  return undefined;
}

function previousCharacter(pieces: string[], index: number): string | undefined {
  const found = previousIndex(pieces, index);
  return found === undefined ? undefined : lastCharacter(pieces[found]);
}

function nextCharacter(pieces: string[], index: number): string | undefined {
  const found = nextIndex(pieces, index);
  return found === undefined ? undefined : firstCharacter(pieces[found]);
}
