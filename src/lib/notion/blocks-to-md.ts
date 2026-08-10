import { richTextToMarkdown } from "./rich-text";
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
  depth: number;
  numberedOrdinal?: number;
};

export function blocksToMarkdown(blocks: MdBlock[], context: BlocksToMarkdownContext): string {
  const body = renderSequence(blocks, context, 0, "\n\n");
  return body === "" ? "" : `${body}\n`;
}

function renderSequence(blocks: MdBlock[], context: BlocksToMarkdownContext, depth: number, separator: string): string {
  const chunks: string[] = [];
  let numberedOrdinal = 0;
  let previousType: string | undefined;
  let groupType: string | undefined;

  for (const block of blocks) {
    const isNumbered = block.type === "numbered_list_item";
    numberedOrdinal = isNumbered && previousType === "numbered_list_item" ? numberedOrdinal + 1 : isNumbered ? 1 : 0;
    previousType = block.type;

    const rendered = renderBlock(block, context, { depth, numberedOrdinal: isNumbered ? numberedOrdinal : undefined });
    if (rendered === "") {
      groupType = undefined;
      continue;
    }

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
      return renderQuote(data.rich_text);
    case "callout":
      return renderCallout(data);
    case "divider":
      return "---";
    case "bulleted_list_item":
      return renderListItem("-", data.rich_text, block.children, context, options.depth);
    case "numbered_list_item":
      return renderListItem(`${options.numberedOrdinal ?? 1}.`, data.rich_text, block.children, context, options.depth);
    case "to_do":
      return renderListItem(data.checked === true ? "- [x]" : "- [ ]", data.rich_text, block.children, context, options.depth);
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
      return renderToggle(data, block.children, context, options.depth);
    default:
      context.onWarning?.(`skipped unsupported block: ${block.type}`);
      return "";
  }
}

function renderHeading(marker: string, value: unknown): string {
  const text = renderRichText(value);
  return isBlank(text) ? "" : `${marker} ${text}`;
}

function renderQuote(value: unknown): string {
  const text = renderRichText(value);
  return isBlank(text) ? "" : text.split("\n").map((line) => `> ${line}`).join("\n");
}

function renderCallout(data: Record<string, unknown>): string {
  const text = renderRichText(data.rich_text);
  const emoji = readEmoji(data.icon);
  const content = [emoji, text].filter(Boolean).join(" ");
  return isBlank(content) ? "" : `> ${content}`;
}

function renderListItem(
  marker: string,
  value: unknown,
  children: MdBlock[],
  context: BlocksToMarkdownContext,
  depth: number,
): string {
  const text = renderRichText(value);
  if (isBlank(text) && children.length === 0) {
    return "";
  }

  // Two spaces per depth keeps nested markers valid in GFM without changing top-level list shape.
  const indent = "  ".repeat(depth);
  const ownLine = `${indent}${marker}${isBlank(text) ? "" : ` ${text}`}`;
  const childLines = renderSequence(children, context, depth + 1, "\n");
  return childLines === "" ? ownLine : `${ownLine}\n${childLines}`;
}

function renderCode(data: Record<string, unknown>): string {
  const language = normalizeLanguage(data.language);
  const code = readPlainText(data.rich_text);
  // Rehype Pretty Code/Shiki falls back by fence language, so unknown Notion languages become text.
  // Fenced code uses raw plain_text so MDX-like snippets such as <T>{} are not escaped.
  return `\`\`\`${language}\n${code}\n\`\`\``;
}

function renderImage(block: MdBlock, data: Record<string, unknown>, context: BlocksToMarkdownContext): string {
  const alt = renderRichText(data.caption);
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

  return data.cells.map((cell) => renderRichText(cell));
}

function renderLinkBlock(data: Record<string, unknown>): string {
  if (typeof data.url !== "string" || data.url === "") {
    return "";
  }

  const caption = renderRichText(data.caption);
  return `[${caption === "" ? data.url : caption}](${data.url})`;
}

function renderToggle(data: Record<string, unknown>, children: MdBlock[], context: BlocksToMarkdownContext, depth: number): string {
  const summary = renderRichText(data.rich_text);
  const renderedChildren = renderSequence(children, context, depth, "\n\n");
  return [summary, renderedChildren].filter(Boolean).join("\n\n");
}

function renderTextBlock(value: unknown): string {
  const text = renderRichText(value);
  return isBlank(text) ? "" : text;
}

function renderRichText(value: unknown): string {
  return richTextToMarkdown(readRichText(value));
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
  return `| ${cells.join(" | ")} |`;
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
