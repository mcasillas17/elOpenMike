import type { RichText } from "./types";
import { inlineCodeSpan } from "./code-span";
import { endsAtLineStart, escapeMarkdown } from "./escape";

export type RichTextOptions = {
  // False where the text cannot open a block: a heading's content, a table
  // cell, an image's alt text. See escape.ts.
  atLineStart?: boolean;
};

export function richTextToMarkdown(
  rich: RichText[],
  { atLineStart = true }: RichTextOptions = {},
): string {
  let lineStart = atLineStart;
  let out = "";

  for (const run of rich) {
    out += renderRun(run, lineStart);
    lineStart = nextLineState(run, lineStart);
  }

  return out;
}

function renderRun(run: RichText, atLineStart: boolean): string {
  // Whitespace-only runs often carry incidental annotations from the editor, but wrapping them would change layout.
  if (run.plain_text.trim() === "") {
    return run.plain_text;
  }

  // Inline code must preserve raw text so snippets like `<T>` render literally instead of being MDX-escaped.
  // The delimiter outgrows any backtick run inside, or the span would close on the first one.
  //
  // Anything else is literal prose and is escaped, so Markdown the author never
  // typed cannot appear. The wrappers below are generated after the escape pass
  // has finished, so a wrapper is never escaped.
  const content = run.annotations.code
    ? inlineCodeSpan(run.plain_text)
    : escapeMarkdown(run.plain_text, atLineStart && !isWrapped(run));
  const strike = run.annotations.strikethrough ? `~~${content}~~` : content;
  const italic = run.annotations.italic ? `*${strike}*` : strike;
  const bold = run.annotations.bold ? `**${italic}**` : italic;

  // Wrap the final formatted span in a link last so code/strike/italic/bold all stay inside the anchor text.
  return run.href ? `[${bold}](${run.href})` : bold;
}

// A wrapped run opens with a delimiter of its own, so its text no longer sits
// at the start of a line — and a delimiter is not a block marker, so nothing
// after it can open one either.
function isWrapped(run: RichText): boolean {
  const { code, strikethrough, italic, bold } = run.annotations;
  return code || strikethrough || italic || bold || typeof run.href === "string";
}

function nextLineState(run: RichText, atLineStart: boolean): boolean {
  if (run.plain_text.trim() !== "" && isWrapped(run)) return false;
  return endsAtLineStart(run.plain_text, atLineStart);
}
