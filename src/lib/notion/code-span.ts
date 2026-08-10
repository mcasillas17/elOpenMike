// Notion's code content is arbitrary text, and a post about Markdown carries
// backticks inside it. Markdown closes a code span or fence at the first
// delimiter run of the same length, so both delimiters have to be chosen from
// the content rather than fixed.

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
