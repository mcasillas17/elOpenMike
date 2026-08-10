import type { MdBlock, RichText } from "./types";

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

// Notion omits annotation fields when they're false, so the fixture starts from the full default shape.
export function rt(text: string, opts: Partial<RichText["annotations"]> & { href?: string | null } = {}): RichText {
  const { href, ...annotations } = opts;
  return {
    plain_text: text,
    href: href ?? null,
    annotations: {
      bold: false,
      italic: false,
      strikethrough: false,
      underline: false,
      code: false,
      ...annotations,
    },
  };
}

// Children are already resolved into the tree, matching the shape produced after block expansion.
export function block<T extends Record<string, unknown>>(type: string, payload: T, children: MdBlock[] = []): MdBlock & Record<string, unknown> {
  return {
    id: `${type}-${JSON.stringify(payload).length}-${children.length}`,
    type,
    has_children: children.length > 0,
    [type]: payload,
    children,
  };
}
