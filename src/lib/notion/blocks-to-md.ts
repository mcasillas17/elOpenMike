import { richTextToMarkdown } from "./rich-text";
import { defuseEsmKeyword, escapeMarkdown } from "./escape";
import { codeFence } from "./code-span";
import type { MdBlock, RichText } from "./types";

export type BlocksToMarkdownContext = {
  imagePath(blockId: string): string;
  onWarning?: (message: string) => void;
};

export const LANGUAGE_MAP = {
  typescript: "ts",
  javascript: "js",
  "plain text": "text",
  bash: "bash",
  shell: "bash",
  json: "json",
  python: "python",
  go: "go",
  rust: "rust",
  java: "java",
  "c++": "cpp",
  "c#": "csharp",
  css: "css",
  html: "html",
  markdown: "md",
  sql: "sql",
  yaml: "yaml",
  diff: "diff",
} as const;

const HEADING_MARKERS = {
  heading_1: "##",
  heading_2: "###",
  heading_3: "####",
} as const;

type RenderOptions = {
  // The exact column every line of this block starts at. Carried as a string
  // rather than a depth because a list item's children line up with the width
  // of its own marker, which "1." and "10." do not share with "-".
  indent: string;
  numberedOrdinal?: number;
};

export function blocksToMarkdown(blocks: MdBlock[], context: BlocksToMarkdownContext): string {
  const body = renderSequence(blocks, context, "", "\n\n");
  return body === "" ? "" : `${body}\n`;
}

function renderSequence(blocks: MdBlock[], context: BlocksToMarkdownContext, indent: string, separator: string): string {
  const chunks: string[] = [];
  let numberedOrdinal = 0;
  let previousRenderedType: string | undefined;
  let groupType: string | undefined;

  for (const block of blocks) {
    const isNumbered = block.type === "numbered_list_item";
    const candidateOrdinal = isNumbered && previousRenderedType === "numbered_list_item" ? numberedOrdinal + 1 : isNumbered ? 1 : 0;

    let rendered = renderBlock(block, context, { indent, numberedOrdinal: isNumbered ? candidateOrdinal : undefined });
    if (rendered === "") {
      if (!isListType(block.type)) {
        numberedOrdinal = 0;
        previousRenderedType = block.type;
        groupType = undefined;
      }
      continue;
    }
    if (indent !== "" && !isListType(block.type)) {
      rendered = indentBlock(rendered, indent);
    }
    numberedOrdinal = candidateOrdinal;
    previousRenderedType = block.type;

    if (groupType === block.type && isListType(block.type)) {
      chunks[chunks.length - 1] = `${chunks[chunks.length - 1]}\n${rendered}`;
    } else {
      chunks.push(rendered);
    }
    groupType = isListType(block.type) ? block.type : undefined;
  }

  return chunks.join(separator);
}

function renderBlock(block: MdBlock, context: BlocksToMarkdownContext, options: RenderOptions): string {
  const data = blockPayload(block);

  switch (block.type) {
    case "paragraph":
      return renderTextBlock(data.rich_text);
    case "heading_1":
    case "heading_2":
    case "heading_3":
      // Site pages already reserve the H1, so Notion headings shift down one level.
      return renderHeading(HEADING_MARKERS[block.type], data.rich_text);
    case "quote":
      return renderQuote(data.rich_text, block.children, context);
    case "callout":
      return renderCallout(data, block.children, context);
    case "divider":
      return "---";
    case "bulleted_list_item":
      return renderListItem("-", "-", data.rich_text, block.children, context, options.indent);
    case "numbered_list_item": {
      const ordinal = `${options.numberedOrdinal ?? 1}.`;
      return renderListItem(ordinal, ordinal, data.rich_text, block.children, context, options.indent);
    }
    case "to_do":
      // GFM's checkbox is part of the item's content, not its marker, so a task
      // item's content column is the same as a plain bullet's.
      return renderListItem(data.checked === true ? "- [x]" : "- [ ]", "-", data.rich_text, block.children, context, options.indent);
    case "code":
      return renderCode(data);
    case "image":
      return renderImage(block, data, context);
    case "table":
      return renderTable(block);
    case "bookmark":
    case "link_preview":
      return renderLinkBlock(data);
    case "toggle":
      return renderToggle(data, block.children, context);
    default:
      context.onWarning?.(`skipped unsupported block: ${block.type}`);
      return "";
  }
}

function renderHeading(marker: string, value: unknown): string {
  // A heading's content is inline-only, so a literal `#` or `-` in it cannot
  // open a block and needs no escaping.
  const text = renderRichText(value, false);
  return isBlank(text) ? "" : `${marker} ${text}`;
}

function renderQuote(value: unknown, children: MdBlock[], context: BlocksToMarkdownContext): string {
  const text = renderRichText(value);
  const renderedChildren = renderSequence(children, context, "", "\n\n");
  const content = [isBlank(text) ? "" : text, renderedChildren].filter(Boolean).join("\n\n");
  return isBlank(content) ? "" : renderBlockquote(content);
}

function renderCallout(data: Record<string, unknown>, children: MdBlock[], context: BlocksToMarkdownContext): string {
  const text = renderRichText(data.rich_text);
  const emoji = readEmoji(data.icon);
  const summary = [emoji, text].filter(Boolean).join(" ");
  const renderedChildren = renderSequence(children, context, "", "\n\n");
  const content = [isBlank(summary) ? "" : summary, renderedChildren].filter(Boolean).join("\n\n");
  return isBlank(content) ? "" : renderBlockquote(content);
}

function renderListItem(
  prefix: string,
  marker: string,
  value: unknown,
  children: MdBlock[],
  context: BlocksToMarkdownContext,
  indent: string,
): string {
  const text = renderRichText(value);
  if (isBlank(text) && children.length === 0) {
    return "";
  }

  // CommonMark: a list item's content column is the width of its marker plus
  // the space after it, and everything belonging to the item has to start
  // there. Two spaces are right under "-" and one short under "1.", where the
  // parser reads a shallower line as the end of the item and opens a sibling
  // list instead of a nested one. Deriving the indent from the marker keeps
  // bullets where they were and follows "10." out to four columns.
  const childIndent = `${indent}${" ".repeat(marker.length + 1)}`;
  const ownLine = `${indent}${prefix}${isBlank(text) ? "" : ` ${text}`}`;
  const childLines = renderSequence(children, context, childIndent, "\n");
  return childLines === "" ? ownLine : `${ownLine}\n${childLines}`;
}

function renderCode(data: Record<string, unknown>): string {
  const language = normalizeLanguage(data.language);
  const code = readPlainText(data.rich_text);
  // Rehype Pretty Code/Shiki falls back by fence language, so unknown Notion languages become text.
  // Fenced code uses raw plain_text so MDX-like snippets such as <T>{} are not escaped.
  // The fence outgrows any backtick run inside, or a code block quoting Markdown would close itself early.
  const fence = codeFence(code);
  return `${fence}${language}\n${code}\n${fence}`;
}

function renderImage(block: MdBlock, data: Record<string, unknown>, context: BlocksToMarkdownContext): string {
  const alt = renderRichText(data.caption, false);
  // The converter stays pure by receiving already-resolved image paths from the caller.
  return `![${alt}](${context.imagePath(block.id)})`;
}

function renderTable(block: MdBlock): string {
  const data = blockPayload(block);
  const rows = block.children.filter((child) => child.type === "table_row").map(renderTableRow);
  const width = tableWidth(data.table_width, rows);
  if (width === 0) {
    return "";
  }

  const normalizedRows = rows.map((row) => normalizeRow(row, width));
  const hasHeader = data.has_column_header === true && normalizedRows.length > 0;
  const header = hasHeader ? normalizedRows[0] : Array<string>(width).fill("");
  const bodies = hasHeader ? normalizedRows.slice(1) : normalizedRows;

  // GFM requires a delimiter row even when Notion has no explicit column header.
  return [renderTableLine(header), renderTableLine(Array<string>(width).fill("---")), ...bodies.map(renderTableLine)].join("\n");
}

function renderTableRow(block: MdBlock): string[] {
  const data = blockPayload(block);
  if (!Array.isArray(data.cells)) {
    return [];
  }

  // A cell is inline context; its line breaks become <br /> below.
  return data.cells.map((cell) => renderRichText(cell, false));
}

function renderLinkBlock(data: Record<string, unknown>): string {
  if (typeof data.url !== "string" || data.url === "") {
    return "";
  }

  const caption = renderRichText(data.caption, false);
  // With no caption the url doubles as the link text, where it is literal prose
  // like any other and is escaped as such.
  const label = caption === "" ? escapeMarkdown(data.url, false) : caption;
  return `[${label}](${data.url})`;
}

function renderToggle(data: Record<string, unknown>, children: MdBlock[], context: BlocksToMarkdownContext): string {
  const summary = renderFlowText(data.rich_text);
  const renderedChildren = renderSequence(children, context, "", "\n\n");
  return [summary, renderedChildren].filter(Boolean).join("\n\n");
}

function renderTextBlock(value: unknown): string {
  const text = renderFlowText(value);
  return isBlank(text) ? "" : text;
}

// Rich text that opens a block of its own, so its first character is also the
// file's first character on that line. Every other block writes a marker in
// front of its text — `## `, `- `, `> `, `| ` — which is enough to put the
// line out of MDX's reach; these two do not. See escape.ts.
function renderFlowText(value: unknown): string {
  return defuseEsmKeyword(renderRichText(value));
}

function renderRichText(value: unknown, atLineStart = true): string {
  return richTextToMarkdown(readRichText(value), { atLineStart });
}

function readPlainText(value: unknown): string {
  return readRichText(value).map((run) => run.plain_text).join("");
}

function readRichText(value: unknown): RichText[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRichText);
}

function isRichText(value: unknown): value is RichText {
  if (!isRecord(value) || typeof value.plain_text !== "string" || !isRecord(value.annotations)) {
    return false;
  }

  return true;
}

function blockPayload(block: MdBlock): Record<string, unknown> {
  const payload = block[block.type];
  return isRecord(payload) ? payload : {};
}

function readEmoji(value: unknown): string {
  if (!isRecord(value) || value.type !== "emoji" || typeof value.emoji !== "string") {
    return "";
  }

  return value.emoji;
}

function normalizeLanguage(value: unknown): string {
  if (typeof value !== "string") {
    return "text";
  }

  return LANGUAGE_MAP[value.toLowerCase() as keyof typeof LANGUAGE_MAP] ?? "text";
}

function tableWidth(value: unknown, rows: string[][]): number {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  return rows.reduce((width, row) => Math.max(width, row.length), 0);
}

function normalizeRow(row: string[], width: number): string[] {
  return Array.from({ length: width }, (_, index) => row[index] ?? "");
}

function renderTableLine(cells: string[]): string {
  return `| ${cells.map(normalizeTableCell).join(" | ")} |`;
}

function normalizeTableCell(cell: string): string {
  // MDX parses raw HTML as JSX, so the line break must be self-closing —
  // a bare `<br>` makes the generated .mdx fail to compile.
  return cell.replace(/\|/g, "\\|").replace(/\r\n|\r|\n/g, "<br />");
}

function indentBlock(markdown: string, indent: string): string {
  return markdown.split("\n").map((line) => (line === "" ? line : `${indent}${line}`)).join("\n");
}

function renderBlockquote(markdown: string): string {
  return markdown.split("\n").map((line) => (line === "" ? ">" : `> ${line}`)).join("\n");
}

function isListType(type: string): boolean {
  return type === "bulleted_list_item" || type === "numbered_list_item" || type === "to_do";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isBlank(value: string): boolean {
  return value.trim() === "";
}
