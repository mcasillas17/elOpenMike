import type { RichText } from "./types";

// MDX/JSX only treat `<`, `{`, and `}` as parser delimiters here; `>` stays literal unless the opener is escaped.
const MDX_ESCAPES = {
  "{": "&#123;",
  "}": "&#125;",
  "<": "&lt;",
} as const;

export function escapeMdx(text: string): string {
  return text.replace(/[{}<]/g, (char) => MDX_ESCAPES[char as keyof typeof MDX_ESCAPES]);
}

export function richTextToMarkdown(rich: RichText[]): string {
  return rich.map(renderRun).join("");
}

function renderRun(run: RichText): string {
  // Whitespace-only runs often carry incidental annotations from the editor, but wrapping them would change layout.
  if (run.plain_text.trim() === "") {
    return run.plain_text;
  }

  // Inline code must preserve raw text so snippets like `<T>` render literally instead of being MDX-escaped.
  const content = run.annotations.code ? `\`${run.plain_text}\`` : escapeMdx(run.plain_text);
  const strike = run.annotations.strikethrough ? `~~${content}~~` : content;
  const italic = run.annotations.italic ? `*${strike}*` : strike;
  const bold = run.annotations.bold ? `**${italic}**` : italic;

  // Wrap the final formatted span in a link last so code/strike/italic/bold all stay inside the anchor text.
  return run.href ? `[${bold}](${run.href})` : bold;
}
