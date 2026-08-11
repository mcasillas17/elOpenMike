// Notion's code content is arbitrary text, and a post about Markdown carries
// backticks inside it. Markdown closes a code span or fence at the first
// delimiter run of the same length, so both delimiters have to be chosen from
// the content rather than fixed.

import { escapeMarkdown, referenceLineEndings } from "./escape";

export function longestBacktickRun(text: string): number {
  let longest = 0;
  let current = 0;
  for (const char of text) {
    current = char === "`" ? current + 1 : 0;
    if (current > longest) longest = current;
  }
  return longest;
}

// CommonMark: a fenced block ends at a fence of at least the opening length,
// so opening with one more backtick than the longest run inside is enough.
export function codeFence(code: string): string {
  return "`".repeat(Math.max(3, longestBacktickRun(code) + 1));
}

// CommonMark: a code span's content is stripped of one leading and one trailing
// space when it has both and is not all spaces. Padding therefore both keeps a
// literal backtick from touching the delimiter and survives the strip, so
// content that genuinely starts or ends with a space round-trips too.
export function inlineCodeSpan(text: string): string {
  const delimiter = "`".repeat(longestBacktickRun(text) + 1);
  const padded =
    longestBacktickRun(text) > 0 ||
    (text.startsWith(" ") && text.endsWith(" ") && text.trim() !== "");
  const pad = padded ? " " : "";
  return `${delimiter}${pad}${text}${pad}${delimiter}`;
}

// A line ending is the one thing a code span cannot carry: CommonMark converts
// every one of them to a space before the span is rendered, so `` `a\nb` ``
// reaches the reader as "a b" and the newline is gone — from the page, and from
// the next migration back into Notion.
//
// The `<code>` element carries it. MDX parses a JSX element's children as
// markdown, which is what makes the element usable rather than merely raw HTML:
// the text is escaped exactly the way any other literal text is, and the line
// endings are written as the character references they already render as, so
// CRLF and a lone carriage return stay distinguishable. Nothing about the run
// is lost, the generated file still holds one line per block, and
// md-to-rich-text reads this one shape back — and refuses every other `<code>`.
const LINE_ENDING = /[\r\n]/;

export function inlineCode(text: string): string {
  if (!LINE_ENDING.test(text)) return inlineCodeSpan(text);

  return `<code>${referenceLineEndings(escapeMarkdown(text, false))}</code>`;
}
