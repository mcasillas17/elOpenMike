import type { BlockObjectRequest } from "@notionhq/client";
import { inlineToRichText, type RichTextInput } from "./md-to-rich-text";

// Derived from the SDK rather than restated, so `pnpm exec tsc` fails if a
// language below is not one Notion actually accepts.
type CodeBlockRequest = Extract<BlockObjectRequest, { code: unknown }>;
export type NotionLanguage = CodeBlockRequest["code"]["language"];

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

// Handles exactly the constructs the two existing posts use. Anything else
// throws rather than silently dropping content — including the inline markdown
// inside a line, which md-to-rich-text turns into the annotated runs Notion
// stores rather than leaving as the characters that spell them.
//
// Heading levels shift back by one: blocks-to-md renders Notion's H1/H2/H3 as
// `##`/`###`/`####` (the post title is already the page's h1), so migrating in
// the opposite direction has to undo exactly that step.
export function markdownToBlocks(markdown: string): BlockObjectRequest[] {
  const blocks: BlockObjectRequest[] = [];
  const lines = markdown.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim() === "") continue;

    if (line.startsWith("```")) {
      const language = notionCodeLanguage(line.slice(3));
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) body.push(lines[i++]);
      blocks.push({
        object: "block",
        type: "code",
        code: { rich_text: plainRichText(body.join("\n")), language },
      });
      continue;
    }

    if (line.startsWith("### ")) {
      blocks.push({
        object: "block",
        type: "heading_2",
        heading_2: { rich_text: inlineToRichText(line.slice(4)) },
      });
      continue;
    }
    if (line.startsWith("## ")) {
      blocks.push({
        object: "block",
        type: "heading_1",
        heading_1: { rich_text: inlineToRichText(line.slice(3)) },
      });
      continue;
    }
    if (line.startsWith("- ")) {
      blocks.push({
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: { rich_text: inlineToRichText(line.slice(2)) },
      });
      continue;
    }
    if (/^[#>|]/.test(line)) {
      throw new Error(
        `unsupported markdown in migration: ${JSON.stringify(line)}`,
      );
    }

    blocks.push({
      object: "block",
      type: "paragraph",
      paragraph: { rich_text: inlineToRichText(line) },
    });
  }

  return blocks;
}
