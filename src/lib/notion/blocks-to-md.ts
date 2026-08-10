import { richTextToMarkdown } from "./rich-text";
import {
  defuseEsmKeyword,
  defuseHeadingClosingSequence,
  escapeMarkdown,
} from "./escape";
import { markdownDestination } from "./link-destination";
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
      return renderTextBlock(data.rich_text, block.children, context);
    case "heading_1":
    case "heading_2":
    case "heading_3":
      // Site pages already reserve the H1, so Notion headings shift down one level.
      return renderHeading(
        HEADING_MARKERS[block.type],
        data.rich_text,
        block.children,
        context,
      );
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
      return renderTable(block, context);
    case "bookmark":
    case "link_preview":
      return renderLinkBlock(data, context);
    case "toggle":
      return renderToggle(data, block.children, context);
    default:
      context.onWarning?.(`skipped unsupported block: ${block.type}`);
      return "";
  }
}

// A Notion heading can be toggleable, and a toggleable heading holds blocks.
// They were fetched and then dropped, so a section written as a collapsible
// heading published as its title and nothing else. Markdown has no toggle, but
// a heading followed by content is what a toggleable heading is once you take
// the folding away — the same trade the `toggle` block already makes — so the
// children are written after it as the siblings they render as.
function renderHeading(
  marker: string,
  value: unknown,
  children: MdBlock[],
  context: BlocksToMarkdownContext,
): string {
  // A heading's content is inline-only, so a literal `#` or `-` in it cannot
  // open a block and needs no escaping. Its *last* hashes are another matter:
  // a run of them ending the line is the heading's closing sequence, which the
  // parser removes. That is decided on the whole assembled line, so it is
  // defused here rather than run by run.
  const text = defuseHeadingClosingSequence(
    renderRichText(value, false, context),
  );
  const own = isBlank(text) ? "" : `${marker} ${text}`;
  return withChildren(own, children, context);
}

// A block's own text and the blocks nested under it, as the sibling blocks
// markdown writes them. Whichever half is empty falls away, so a heading with
// nothing under it is still one line and children under an empty heading are
// still published.
function withChildren(
  own: string,
  children: MdBlock[],
  context: BlocksToMarkdownContext,
): string {
  const rendered = renderSequence(children, context, "", "\n\n");
  return [own, rendered].filter(Boolean).join("\n\n");
}

function renderQuote(value: unknown, children: MdBlock[], context: BlocksToMarkdownContext): string {
  const text = renderRichText(value, true, context);
  const renderedChildren = renderSequence(children, context, "", "\n\n");
  const content = [isBlank(text) ? "" : text, renderedChildren].filter(Boolean).join("\n\n");
  return isBlank(content) ? "" : renderBlockquote(content);
}

function renderCallout(data: Record<string, unknown>, children: MdBlock[], context: BlocksToMarkdownContext): string {
  const text = renderRichText(data.rich_text, true, context);
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
  const text = renderRichText(value, true, context);
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
  const alt = renderRichText(data.caption, false, context);
  // The converter stays pure by receiving already-resolved image paths from the caller.
  return `![${alt}](${context.imagePath(block.id)})`;
}

function renderTable(block: MdBlock, context: BlocksToMarkdownContext): string {
  const data = blockPayload(block);
  const rows = block.children
    .filter((child) => child.type === "table_row")
    .map((row) => renderTableRow(row, context));
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

function renderTableRow(block: MdBlock, context: BlocksToMarkdownContext): string[] {
  const data = blockPayload(block);
  if (!Array.isArray(data.cells)) {
    return [];
  }

  // A cell is inline context; its line breaks become <br /> below.
  return data.cells.map((cell) => renderRichText(cell, false, context));
}

function renderLinkBlock(
  data: Record<string, unknown>,
  context: BlocksToMarkdownContext,
): string {
  if (typeof data.url !== "string" || data.url === "") {
    return "";
  }

  const destination = markdownDestination(data.url);
  if (destination === undefined) {
    context.onWarning?.(
      `kept a bookmark to an unsupported url as text: ${data.url}`,
    );
    // A block of its own now, so its first character does open a line.
    const text = renderRichText(data.caption, true, context);
    return text === "" ? escapeMarkdown(data.url) : text;
  }

  // With no caption the url doubles as the link text, where it is literal prose
  // like any other and is escaped as such.
  const caption = renderRichText(data.caption, false, context);
  const label = caption === "" ? escapeMarkdown(data.url, false) : caption;
  return `[${label}](${destination})`;
}

function renderToggle(data: Record<string, unknown>, children: MdBlock[], context: BlocksToMarkdownContext): string {
  return withChildren(renderFlowText(data.rich_text, context), children, context);
}

// Notion indents blocks under a paragraph the same way it does under a heading,
// and they were dropped the same way. Markdown writes them as the siblings they
// already read as.
function renderTextBlock(
  value: unknown,
  children: MdBlock[],
  context: BlocksToMarkdownContext,
): string {
  const text = renderFlowText(value, context);
  return withChildren(isBlank(text) ? "" : text, children, context);
}

// Rich text that opens a block of its own, so its first character is also the
// file's first character on that line. Every other block writes a marker in
// front of its text — `## `, `- `, `> `, `| ` — which is enough to put the
// line out of MDX's reach; these two do not. See escape.ts.
function renderFlowText(value: unknown, context: BlocksToMarkdownContext): string {
  return defuseEsmKeyword(renderRichText(value, true, context));
}

function renderRichText(
  value: unknown,
  atLineStart: boolean,
  context: BlocksToMarkdownContext,
): string {
  return normalizeLineEndings(
    richTextToMarkdown(readRichText(value), {
      atLineStart,
      onWarning: context.onWarning,
    }),
  );
}

function readPlainText(value: unknown): string {
  return normalizeLineEndings(readRichText(value).map((run) => run.plain_text).join(""));
}

// CRLF, a lone carriage return and a newline are the same line ending to every
// markdown parser, and Notion hands over whichever the author's editor
// produced. Escaping has already run by the time this does, so nothing about
// where a block could open is being decided here — only which bytes stand for
// the line ending that was decided on. Writing one of them keeps identical
// content serializing to identical bytes, which the sync's idempotency rests
// on, and keeps every line-based step below (indenting, blockquoting, table
// cells) looking for a single character.
const OTHER_LINE_ENDINGS = /\r\n|\r/g;

function normalizeLineEndings(text: string): string {
  return text.replace(OTHER_LINE_ENDINGS, "\n");
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
