import type { BlockObjectRequest } from "@notionhq/client";
import { inlineToRichText, type RichTextInput } from "./md-to-rich-text";

// Derived from the SDK rather than restated, so `pnpm exec tsc` fails if a
// language below is not one Notion actually accepts.
type CodeBlockRequest = Extract<BlockObjectRequest, { code: unknown }>;
export type NotionLanguage = CodeBlockRequest["code"]["language"];

// Notion's api takes one level of nesting in a create-page request: a block may
// carry children, and those children may not carry children of their own. The
// SDK spells that out; the type is not exported, so it is derived here.
type QuoteBlockRequest = Extract<BlockObjectRequest, { quote: unknown }>;
type ChildBlockRequest = NonNullable<
  QuoteBlockRequest["quote"]["children"]
>[number];
type TableBlockRequest = Extract<BlockObjectRequest, { table: unknown }>;
type TableRowRequest = TableBlockRequest["table"]["children"][number];

// Every value Notion's API accepts for a code block's language, bar the legacy
// composite "java/c/c++/c#" that no fence produces. Notion refuses the entire
// create-page request when it sees anything else — one bad fence costs the
// whole post — so a label is only forwarded if it appears here.
export const NOTION_LANGUAGES = [
  "abap", "abc", "agda", "arduino", "ascii art", "assembly", "bash",
  "basic", "bnf", "c", "c#", "c++", "clojure", "coffeescript", "coq",
  "css", "dart", "dhall", "diff", "docker", "ebnf", "elixir", "elm",
  "erlang", "f#", "flow", "fortran", "gherkin", "glsl", "go", "graphql",
  "groovy", "haskell", "hcl", "html", "idris", "java", "javascript",
  "json", "julia", "kotlin", "latex", "less", "lisp", "livescript",
  "llvm ir", "lua", "makefile", "markdown", "markup", "matlab",
  "mathematica", "mermaid", "nix", "notion formula", "objective-c",
  "ocaml", "pascal", "perl", "php", "plain text", "powershell", "prolog",
  "protobuf", "purescript", "python", "r", "racket", "reason", "ruby",
  "rust", "sass", "scala", "scheme", "scss", "shell", "smalltalk",
  "solidity", "sql", "swift", "toml", "typescript", "vb.net", "verilog",
  "vhdl", "visual basic", "webassembly", "xml", "yaml",
] as const satisfies readonly NotionLanguage[];

const ACCEPTED = new Set<string>(NOTION_LANGUAGES);

// Markdown and Shiki name languages by file extension; Notion spells them out.
// The two committed posts open with ```ts, which Notion rejects outright.
const ALIASES: Record<string, NotionLanguage> = {
  ts: "typescript",
  tsx: "typescript",
  mts: "typescript",
  cts: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  node: "javascript",
  sh: "shell",
  zsh: "shell",
  console: "shell",
  md: "markdown",
  mdx: "markdown",
  py: "python",
  rb: "ruby",
  rs: "rust",
  yml: "yaml",
  cpp: "c++",
  cc: "c++",
  cs: "c#",
  csharp: "c#",
  fsharp: "f#",
  golang: "go",
  htm: "html",
  objc: "objective-c",
  plain: "plain text",
  text: "plain text",
  txt: "plain text",
  ps1: "powershell",
  dockerfile: "docker",
  jsonc: "json",
  tf: "hcl",
  vb: "visual basic",
  wasm: "webassembly",
};

const FALLBACK: NotionLanguage = "plain text";

function lookup(label: string): NotionLanguage | undefined {
  if (ALIASES[label]) return ALIASES[label];
  return ACCEPTED.has(label) ? (label as NotionLanguage) : undefined;
}

// A fence's info string may carry more than the language (```ts twoslash,
// ```js {1,3} title="x"), so the first token is tried too. An unrecognized
// label degrades to plain text: losing highlighting on one block is a far
// better outcome than losing the post.
export function notionCodeLanguage(label: string): NotionLanguage {
  const cleaned = label.trim().toLowerCase();
  const [token] = cleaned.split(/[\s{]+/, 1);
  return lookup(cleaned) ?? lookup(token) ?? FALLBACK;
}

// One unstyled run, for the text that carries no formatting to lose: a
// property value, and the body of a code block, where a backtick or an asterisk
// is part of the snippet rather than markup.
export const plainRichText = (content: string): RichTextInput => [
  { type: "text", text: { content } },
];

// Handles every block shape blocks-to-md writes, because the two converters are
// a pair: a post syncs out of Notion as markdown and has to migrate back in as
// the blocks it came from. Anything outside that vocabulary throws rather than
// quietly becoming a paragraph — the migration builds every page body before it
// creates the first page, so a refusal costs nothing, while a silent downgrade
// puts a heading, a table or a quote into Notion as prose nobody can tell was
// ever anything else. The same goes for the inline markdown inside a line,
// which md-to-rich-text turns into the annotated runs Notion stores rather than
// leaving as the characters that spell them.
//
// Heading levels shift back by one: blocks-to-md renders Notion's H1/H2/H3 as
// `##`/`###`/`####` (the post title is already the page's h1), so migrating in
// the opposite direction has to undo exactly that step. A `#` heading therefore
// has no Notion level to land on and is refused.
//
// Three shapes markdown cannot tell apart come back as the simpler one, which
// renders identically rather than pretending to be what it was:
//
//   * a callout and a quote are both written as a blockquote, so both migrate
//     back as a quote — a callout's icon is part of its text by then;
//   * a bookmark and a paragraph holding one link are both written as
//     `[label](url)`, so both migrate back as a paragraph;
//   * a toggle's summary and its children are written as sibling blocks, and
//     migrate back as siblings.
export function markdownToBlocks(markdown: string): BlockObjectRequest[] {
  return readBlocks(markdown.split("\n"));
}

function unsupported(reason: string, line: string): Error {
  return new Error(
    `unsupported markdown in migration: ${reason} in ${JSON.stringify(line)}`,
  );
}

const FENCE = /^(`{3,}|~{3,})(.*)$/;
const HEADING = /^(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/;
const THEMATIC_BREAK = /^(?:(?:-[ \t]*){3,}|(?:\*[ \t]*){3,}|(?:_[ \t]*){3,})$/;
const SETEXT = /^(?:=+|-+)[ \t]*$/;
const BULLET = /^([-+*])(?:[ \t]+(.*))?$/;
const ORDERED = /^(\d{1,9})([.)])(?:[ \t]+(.*))?$/;
const CHECKBOX = /^\[([ xX])\](?:[ \t]+(.*))?$/;
const QUOTE = /^>[ ]?(.*)$/;

const HEADING_LEVELS: Record<number, "heading_1" | "heading_2" | "heading_3"> = {
  2: "heading_1",
  3: "heading_2",
  4: "heading_3",
};

// A tab advances to the next multiple of four, which is how CommonMark measures
// the indentation deciding whether a line opens an indented code block.
function measureIndent(line: string): { width: number; content: string } {
  let width = 0;
  let index = 0;
  while (index < line.length) {
    if (line[index] === " ") width += 1;
    else if (line[index] === "\t") width += 4 - (width % 4);
    else break;
    index += 1;
  }
  return { width, content: line.slice(index) };
}

function isBlank(line: string): boolean {
  return line.trim() === "";
}

// Removes up to `column` columns of leading space, which is the indentation a
// list item's own marker accounts for.
function stripIndent(line: string, column: number): string {
  let index = 0;
  while (index < column && line[index] === " ") index += 1;
  return line.slice(index);
}

// True when this line starts a block rather than continuing a paragraph.
// `interrupting` narrows it to the shapes CommonMark lets interrupt a
// paragraph: an ordered list only where it starts at 1, and no empty list item
// at all, which is what keeps a line reading "2026. was a year" prose.
function opensBlock(content: string, interrupting = false): boolean {
  if (
    FENCE.test(content) ||
    HEADING.test(content) ||
    THEMATIC_BREAK.test(content) ||
    content.startsWith(">")
  ) {
    return true;
  }

  const bullet = BULLET.exec(content);
  if (bullet) return !interrupting || (bullet[2] ?? "") !== "";

  const ordered = ORDERED.exec(content);
  if (ordered) {
    return !interrupting || (ordered[1] === "1" && (ordered[3] ?? "") !== "");
  }

  return false;
}

function readBlocks(lines: string[]): BlockObjectRequest[] {
  const blocks: BlockObjectRequest[] = [];
  let index = 0;

  while (index < lines.length) {
    if (isBlank(lines[index])) {
      index += 1;
      continue;
    }

    const read = readBlock(lines, index);
    blocks.push(read.block);
    index = read.next;
  }

  return blocks;
}

function readBlock(
  lines: string[],
  index: number,
): { block: BlockObjectRequest; next: number } {
  const line = lines[index];
  const { width, content } = measureIndent(line);

  if (width >= 4) {
    throw unsupported(
      "an indented code block, which the sync never writes — fence it instead",
      line,
    );
  }

  const fence = FENCE.exec(content);
  if (fence) return readCode(lines, index, fence[1], fence[2]);

  const heading = HEADING.exec(content);
  if (heading) {
    const type = HEADING_LEVELS[heading[1].length];
    if (!type) {
      throw unsupported(
        `a level ${heading[1].length} heading, which no Notion heading maps to — ` +
          "the sync writes Notion's three levels as ##, ### and ####",
        line,
      );
    }
    return {
      block: {
        object: "block",
        type,
        [type]: { rich_text: inlineToRichText(heading[2] ?? "") },
      } as BlockObjectRequest,
      next: index + 1,
    };
  }

  if (THEMATIC_BREAK.test(content)) {
    return {
      block: { object: "block", type: "divider", divider: {} },
      next: index + 1,
    };
  }

  if (content.startsWith(">")) return readQuote(lines, index);

  if (content.startsWith("|") && isTableDelimiterRow(lines[index + 1])) {
    return readTable(lines, index);
  }

  if (BULLET.test(content) || ORDERED.test(content)) {
    return readListItem(lines, index);
  }

  return readParagraph(lines, index);
}

// CommonMark closes a fenced block on a line of the same character, at least as
// long as the fence that opened it, indented no further than three columns and
// carrying nothing but whitespace after the run. A line that merely starts with
// the same backticks — `` ```js `` inside a block quoting markdown — closes
// nothing.
function closesFence(line: string, fence: string): boolean {
  const { width, content } = measureIndent(line);
  if (width >= 4) return false;
  const run = /^(`+|~+)[ \t]*$/.exec(content);
  return (
    run !== null && run[1][0] === fence[0] && run[1].length >= fence.length
  );
}

function readCode(
  lines: string[],
  index: number,
  fence: string,
  info: string,
): { block: BlockObjectRequest; next: number } {
  // A backtick fence's info string cannot hold a backtick, or the line would
  // be a paragraph with a code span in it rather than a fence at all.
  if (fence.startsWith("`") && info.includes("`")) {
    throw unsupported(
      "a fence whose info string holds a backtick, which opens no code block",
      lines[index],
    );
  }

  const language = notionCodeLanguage(info);
  const body: string[] = [];
  let scan = index + 1;

  while (scan < lines.length && !closesFence(lines[scan], fence)) {
    body.push(lines[scan]);
    scan += 1;
  }

  // Markdown lets a fence run to the end of the document; migrating that would
  // send the whole rest of the post to Notion as code. The run stops instead,
  // before any page is created.
  if (scan >= lines.length) {
    throw unsupported(
      `a fenced code block that never closes — close it with a line of at least ` +
        `${fence.length} ${fence[0] === "`" ? "backticks" : "tildes"}`,
      lines[index],
    );
  }

  return {
    block: {
      object: "block",
      type: "code",
      code: { rich_text: plainRichText(body.join("\n")), language },
    },
    next: scan + 1,
  };
}

function readParagraph(
  lines: string[],
  index: number,
): { block: BlockObjectRequest; next: number } {
  const collected: string[] = [];
  let scan = index;

  while (scan < lines.length) {
    const line = lines[scan];
    if (isBlank(line)) break;
    const { content } = measureIndent(line);

    if (collected.length > 0) {
      // `---` or `===` under a paragraph line is a setext heading, not a rule
      // and not prose. The sync escapes both, so one arriving here means the
      // markdown did not come from it, and reading it either way is a guess.
      if (SETEXT.test(content)) {
        throw unsupported(
          "a setext heading underline, which no Notion heading maps to",
          line,
        );
      }
      if (opensBlock(content, true)) break;
    }

    collected.push(content);
    scan += 1;
  }

  return {
    block: {
      object: "block",
      type: "paragraph",
      paragraph: { rich_text: inlineToRichText(collected.join("\n")) },
    },
    next: scan,
  };
}

function readQuote(
  lines: string[],
  index: number,
): { block: BlockObjectRequest; next: number } {
  const inner: string[] = [];
  let scan = index;

  while (scan < lines.length) {
    const { content } = measureIndent(lines[scan]);
    const marked = QUOTE.exec(content);
    if (marked) {
      inner.push(marked[1]);
      scan += 1;
      continue;
    }
    // A paragraph line carrying on from the one above is still inside the
    // quote — CommonMark's lazy continuation.
    const lazy =
      scan > index &&
      !isBlank(lines[scan]) &&
      !isBlank(lines[scan - 1]) &&
      !opensBlock(content, true);
    if (!lazy) break;
    inner.push(content);
    scan += 1;
  }

  // blocks-to-md writes a quote's own text first and its children after, so the
  // paragraph it opens with is the text and the rest are the children.
  const blocks = readBlocks(inner);
  const lead = blocks[0];
  const opensWithParagraph = lead !== undefined && lead.type === "paragraph";
  const rich_text = opensWithParagraph
    ? (lead as Extract<BlockObjectRequest, { paragraph: unknown }>).paragraph
        .rich_text
    : [];
  const children = opensWithParagraph ? blocks.slice(1) : blocks;

  return {
    block: {
      object: "block",
      type: "quote",
      quote: {
        rich_text,
        ...(children.length > 0
          ? { children: asChildren(children, lines[index]) }
          : {}),
      },
    },
    next: scan,
  };
}

function readListItem(
  lines: string[],
  index: number,
): { block: BlockObjectRequest; next: number } {
  const line = lines[index];
  const { width, content } = measureIndent(line);
  const bullet = BULLET.exec(content);
  const ordered = bullet ? null : ORDERED.exec(content);
  if (!bullet && !ordered) {
    throw unsupported("a list item with no marker", line);
  }
  const markerWidth = bullet ? 1 : (ordered as RegExpExecArray)[1].length + 1;
  // CommonMark: a list item's content column is the width of its marker plus
  // the space after it, and everything belonging to the item starts there. It
  // is what blocks-to-md indents an item's children by, so it is what reads
  // them back — and it is why "1." and "10." do not share a column with "-".
  const column = width + markerWidth + 1;
  const first = (bullet ? bullet[2] : (ordered as RegExpExecArray)[3]) ?? "";

  let scan = index + 1;
  let previousBlank = false;
  while (scan < lines.length) {
    if (isBlank(lines[scan])) {
      previousBlank = true;
      scan += 1;
      continue;
    }
    const candidate = measureIndent(lines[scan]);
    if (candidate.width >= column) {
      previousBlank = false;
      scan += 1;
      continue;
    }
    // Inside a list, a marker at the outer column is the next item rather than
    // a lazy continuation of this one — the "only 1. interrupts a paragraph"
    // rule is about opening a list, not about continuing one.
    if (previousBlank || opensBlock(candidate.content)) break;
    scan += 1;
  }
  while (scan > index + 1 && isBlank(lines[scan - 1])) scan -= 1;

  const body = [
    first,
    ...lines.slice(index + 1, scan).map((rest) => stripIndent(rest, column)),
  ];
  while (body.length > 0 && isBlank(body[0])) body.shift();

  // The item's own text is the paragraph it opens with; anything after that is
  // a block of its own, nested inside it.
  let paragraphEnd = 0;
  if (body.length > 0 && !opensBlock(measureIndent(body[0]).content)) {
    paragraphEnd = 1;
    while (paragraphEnd < body.length) {
      const candidate = measureIndent(body[paragraphEnd]);
      if (isBlank(body[paragraphEnd]) || opensBlock(candidate.content)) break;
      paragraphEnd += 1;
    }
  }

  const text = body
    .slice(0, paragraphEnd)
    .map((entry) => measureIndent(entry).content)
    .join("\n");
  const children = readBlocks(body.slice(paragraphEnd));
  const nested =
    children.length > 0 ? { children: asChildren(children, line) } : {};

  // GFM's checkbox is part of a bullet's content rather than its marker, which
  // is why a to-do and a bullet share a content column.
  const checkbox = bullet ? CHECKBOX.exec(text) : undefined;
  if (checkbox) {
    return {
      block: {
        object: "block",
        type: "to_do",
        to_do: {
          rich_text: inlineToRichText(checkbox[2] ?? ""),
          checked: checkbox[1] !== " ",
          ...nested,
        },
      },
      next: scan,
    };
  }

  const type = bullet ? "bulleted_list_item" : "numbered_list_item";
  return {
    block: {
      object: "block",
      type,
      [type]: { rich_text: inlineToRichText(text), ...nested },
    } as BlockObjectRequest,
    next: scan,
  };
}

// Notion creates one level of nesting per request, so a block carrying children
// cannot itself be a child. Refusing says so; sending it anyway drops the third
// level without a word.
function asChildren(
  blocks: BlockObjectRequest[],
  line: string,
): ChildBlockRequest[] {
  for (const block of blocks) {
    const record = block as unknown as Record<string, unknown>;
    const payload = record[String(record.type)];
    if (
      typeof payload === "object" &&
      payload !== null &&
      "children" in payload
    ) {
      throw unsupported(
        "a block nested three levels deep, which Notion's api cannot create in one request",
        line,
      );
    }
  }
  return blocks as ChildBlockRequest[];
}

// GFM: a table exists only where a delimiter row follows the header, which is
// what keeps a paragraph of literal pipes a paragraph.
function isTableDelimiterRow(line: string | undefined): boolean {
  if (line === undefined || isBlank(line)) return false;
  const { width, content } = measureIndent(line);
  if (width >= 4 || !content.includes("-")) return false;
  const cells = splitTableCells(content);
  return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell));
}

function splitTableCells(line: string): string[] {
  const trimmed = line.trim();
  const cells: string[] = [];
  let current = "";
  let index = trimmed.startsWith("|") ? 1 : 0;
  let closed = false;

  for (; index < trimmed.length; index += 1) {
    const char = trimmed[index];
    // GFM: `\|` is a literal pipe inside a cell and is the one escape the row
    // itself reads. Every other backslash belongs to the cell's inline markdown.
    if (char === "\\" && index + 1 < trimmed.length) {
      current += trimmed[index + 1] === "|" ? "|" : `\\${trimmed[index + 1]}`;
      index += 1;
      closed = false;
      continue;
    }
    if (char === "|") {
      cells.push(current.trim());
      current = "";
      closed = true;
      continue;
    }
    current += char;
    closed = false;
  }

  if (!closed || current.trim() !== "") cells.push(current.trim());
  return cells;
}

function readTable(
  lines: string[],
  index: number,
): { block: BlockObjectRequest; next: number } {
  const header = splitTableCells(measureIndent(lines[index]).content);
  const width = header.length;
  const delimiter = splitTableCells(measureIndent(lines[index + 1]).content);
  if (delimiter.length !== width) {
    throw unsupported(
      `a table whose delimiter row has ${delimiter.length} cells where its header has ${width}`,
      lines[index],
    );
  }

  const rows = [header];
  let scan = index + 2;
  while (scan < lines.length) {
    const { width: indent, content } = measureIndent(lines[scan]);
    if (isBlank(lines[scan]) || indent >= 4 || opensBlock(content)) break;
    rows.push(splitTableCells(content));
    scan += 1;
  }

  return {
    block: {
      object: "block",
      type: "table",
      table: {
        table_width: width,
        // GFM has no table without a header row, so the header markdown had to
        // write is the header Notion records.
        has_column_header: true,
        children: rows.map((row) => tableRow(row, width)),
      },
    },
    next: scan,
  };
}

// GFM pads a short row and drops whatever runs past the header's width.
function tableRow(cells: string[], width: number): TableRowRequest {
  return {
    object: "block",
    type: "table_row",
    table_row: {
      cells: Array.from({ length: width }, (_, column) =>
        inlineToRichText(cells[column] ?? ""),
      ),
    },
  };
}
