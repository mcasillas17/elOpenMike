// Notion rich text is literal. The only formatting a page carries is in its
// annotations (bold, italic, code, links) and in the block a run belongs to —
// the characters themselves are what the author typed. Emitting them verbatim
// into Markdown handed them straight back to the parser, so a paragraph reading
// "# not a heading" came out as a heading, "---" became a rule, and "[see](/x)"
// became a link nobody asked for.
//
// So unformatted text is escaped on the way out. Two contexts matter, and
// conflating them is what makes a naive escaper unusable:
//
//   * Inline syntax (emphasis, code spans, links, entities) is significant
//     anywhere in a line, so those characters are always escaped.
//   * Block syntax (ATX headings, blockquotes, list markers, thematic breaks,
//     setext underlines) is only significant at the start of a line. Escaping
//     `#` mid-sentence would litter the file with backslashes for no reason, so
//     line position is tracked and those are escaped only where they could
//     actually open a block.
//
// MDX adds a third: a line that opens with `import ` or `export ` is a module
// declaration rather than a paragraph. That one is not an escape at all —
// see defuseEsmKeyword below.
//
// Everything the converters generate themselves — the `##` of a heading, the
// `-` of a list item, the `**` around a bold run, the `[...](...)` of a link —
// is written outside this function and is never escaped, so a wrapper is never
// escaped twice.

// Only characters CommonMark calls escapable may be backslash-escaped: a
// backslash before anything else is a literal backslash.
const ALWAYS_ESCAPED = new Set(["\\", "`", "*", "[", "]", "~"]);

// MDX, not Markdown: `<` opens JSX and `{` an expression. Entities keep them
// literal without relying on MDX's own escape rules.
const MDX_ENTITIES: Record<string, string> = {
  "<": "&lt;",
  "{": "&#123;",
  "}": "&#125;",
};

// `&` only needs escaping when it actually starts a character reference;
// escaping every ampersand would turn "R&D" into "R&amp;D" in the source.
const ENTITY_START =
  /^&(#\d{1,7}|#[xX][0-9a-fA-F]{1,6}|[a-zA-Z][a-zA-Z0-9]{0,31});/;

// CommonMark: an underscore between two alphanumerics can neither open nor
// close emphasis, which is what keeps snake_case identifiers readable.
const ALPHANUMERIC = /[\p{L}\p{N}]/u;

// Leading spaces do not stop a block marker from opening, so they leave the
// "still at the start of the line" state alone.
const INDENT = /[ \t]/;

// MDX, unlike Markdown, reads a line that begins `import ` or `export ` as an
// ESM statement and hands it straight to acorn. Prose is not JavaScript, so a
// paragraph opening "import the data first" either fails to parse — taking the
// whole post down with it — or, when it happens to be valid ("export const
// config = 1"), is evaluated as a declaration and disappears from the page
// without a trace.
//
// No escape defuses it: a backslash before a letter is a literal backslash, and
// there is no character to escape anyway. A numeric character reference is the
// way out — micromark decides this is ESM from the raw bytes of the line,
// before any reference is resolved, so `&#105;mport …` is read as a paragraph
// and still renders the word "import".
//
// The trigger is narrow, and matching it exactly is what keeps "important" and
// "exporting" out of it: the keyword must be the whole word, it must be
// followed by a space (a tab does not arm it), and it must sit in column one at
// the start of a block — indentation, a list marker, a blockquote marker or
// being a paragraph's second line all put it out of reach. See
// micromark-extension-mdxjs-esm.
const ESM_KEYWORDS = { import: "&#105;mport", export: "&#101;xport" };

// The rewritten text, or the text unchanged when MDX would not read ESM in it.
// Takes the assembled block rather than one run for two reasons: Notion splits
// text at arbitrary points, so "imp" and "ort the data" are two runs of one
// word; and a blank line ends the paragraph, so what follows it opens a block
// of its own and lands back in column one.
export function defuseEsmKeyword(text: string): string {
  let flowStart = true;

  return text
    .split("\n")
    .map((line) => {
      const defused = flowStart ? defuseLine(line) : line;
      flowStart = line.trim() === "";
      return defused;
    })
    .join("\n");
}

function defuseLine(line: string): string {
  for (const [keyword, replacement] of Object.entries(ESM_KEYWORDS)) {
    if (line.startsWith(`${keyword} `)) {
      return `${replacement}${line.slice(keyword.length)}`;
    }
  }
  return line;
}

type BlockMarker = { text: string; length: number };

// Escapes one run of literal text. `atLineStart` says whether the first
// character lands at the beginning of a Markdown line — false for a heading's
// content, a table cell, or anything already wrapped in an annotation, where
// block syntax cannot open.
export function escapeMarkdown(text: string, atLineStart = true): string {
  let out = "";
  let lineStart = atLineStart;

  for (let i = 0; i < text.length; ) {
    const char = text[i];

    if (char === "\n") {
      out += char;
      lineStart = true;
      i += 1;
      continue;
    }

    if (INDENT.test(char)) {
      out += char;
      i += 1;
      continue;
    }

    const marker = lineStart ? blockMarkerAt(text, i) : undefined;
    if (marker) {
      out += marker.text;
      i += marker.length;
      lineStart = false;
      continue;
    }

    out += escapeInline(text, i);
    lineStart = false;
    i += 1;
  }

  return out;
}

// True when the next character written after `text` would still be at the start
// of a line, so a run's escaping can continue where the previous one left off.
export function endsAtLineStart(text: string, atLineStart: boolean): boolean {
  const lastBreak = text.lastIndexOf("\n");
  const tail = lastBreak === -1 ? text : text.slice(lastBreak + 1);
  const blank = [...tail].every((char) => INDENT.test(char));
  return lastBreak === -1 ? blank && atLineStart : blank;
}

function escapeInline(text: string, index: number): string {
  const char = text[index];

  if (char === "_") return isIntraword(text, index) ? "_" : "\\_";
  if (char === "&") {
    return ENTITY_START.test(text.slice(index)) ? "&amp;" : "&";
  }
  if (MDX_ENTITIES[char]) return MDX_ENTITIES[char];
  if (ALWAYS_ESCAPED.has(char)) return `\\${char}`;
  return char;
}

function isIntraword(text: string, index: number): boolean {
  const before = text[index - 1];
  const after = text[index + 1];
  return (
    before !== undefined &&
    after !== undefined &&
    ALPHANUMERIC.test(before) &&
    ALPHANUMERIC.test(after)
  );
}

// Escapes the one character that would otherwise open a block. `*`, `_`, `` ` ``
// and `~` are already escaped inline, which covers `* item`, `***`, `___` and
// fences, so only the markers unique to line position are handled here.
function blockMarkerAt(text: string, index: number): BlockMarker | undefined {
  const char = text[index];

  // A GFM table only exists if some line is a delimiter row, so defusing that
  // one line is enough — and it is the one literal-text case that restructures
  // the prose around it into cells instead of merely restyling it.
  if (
    (char === "|" || char === ":" || char === "-") &&
    isTableDelimiterLine(text, index)
  ) {
    return { text: `\\${char}`, length: 1 };
  }

  // A blockquote marker needs no trailing space, so any leading `>` counts.
  if (char === ">") return { text: "\\>", length: 1 };

  // ATX heading: one to six hashes, then a space or the end of the line.
  if (char === "#") {
    const hashes = runLength(text, index, "#");
    return hashes <= 6 && atLineBoundary(text, index + hashes)
      ? { text: "\\#", length: 1 }
      : undefined;
  }

  // Ordered list: up to nine digits, then `.` or `)`, then a space or the end
  // of the line. Escaping the delimiter is enough, and reads better than
  // escaping a digit.
  if (isDigit(char)) {
    const digits = digitRun(text, index);
    const delimiter = text[index + digits];
    if (
      digits <= 9 &&
      (delimiter === "." || delimiter === ")") &&
      atLineBoundary(text, index + digits + 1)
    ) {
      return {
        text: `${text.slice(index, index + digits)}\\${delimiter}`,
        length: digits + 1,
      };
    }
    return undefined;
  }

  // Bullet list, and the `-`/`=` underlines that turn the previous paragraph
  // into a setext heading or the line itself into a thematic break.
  if (char === "-" || char === "+") {
    return atLineBoundary(text, index + 1) || isRuleLine(text, index, char)
      ? { text: `\\${char}`, length: 1 }
      : undefined;
  }
  if (char === "=" && isRuleLine(text, index, "=")) {
    return { text: "\\=", length: 1 };
  }

  return undefined;
}

function atLineBoundary(text: string, index: number): boolean {
  const char = text[index];
  return char === undefined || char === "\n" || INDENT.test(char);
}

// The rest of the line is nothing but `char` and spaces.
function isRuleLine(text: string, index: number, char: string): boolean {
  for (let i = index; i < text.length; i++) {
    if (text[i] === "\n") return true;
    if (text[i] !== char && !INDENT.test(text[i])) return false;
  }
  return true;
}

// Every shape GFM will read as a table's delimiter row, and then some: a line
// of nothing but pipes, colons, spaces and at least one dash. `|` is left
// literal everywhere else, so a cell's own pipes keep the escaping that
// blocks-to-md already applies to them.
function isTableDelimiterLine(text: string, index: number): boolean {
  let dashes = 0;
  for (let i = index; i < text.length; i++) {
    const char = text[i];
    if (char === "\n") break;
    if (char === "-") dashes += 1;
    else if (char !== "|" && char !== ":" && !INDENT.test(char)) return false;
  }
  return dashes > 0;
}

function runLength(text: string, index: number, char: string): number {
  let length = 0;
  while (text[index + length] === char) length += 1;
  return length;
}

function isDigit(char: string): boolean {
  return char >= "0" && char <= "9";
}

function digitRun(text: string, index: number): number {
  let length = 0;
  while (index + length < text.length && isDigit(text[index + length])) {
    length += 1;
  }
  return length;
}
