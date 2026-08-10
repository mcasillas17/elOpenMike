import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import matter from "gray-matter";
import {
  markdownToBlocks,
  notionCodeLanguage,
  NOTION_LANGUAGES,
} from "@/lib/notion/md-to-blocks";

const languages = new Set<string>(NOTION_LANGUAGES);

type MigrationBlock = ReturnType<typeof markdownToBlocks>[number];
type CodeBlock = Extract<MigrationBlock, { code: unknown }>;

const codeBlocks = (markdown: string): CodeBlock[] =>
  markdownToBlocks(markdown).filter(
    (block): block is CodeBlock => "code" in block,
  );

// The one block a line becomes, read back as the runs the migration will send.
const richText = (line: string) => {
  const [block] = markdownToBlocks(line);
  const payload = Object.values(block).find(
    (value): value is { rich_text: unknown } =>
      typeof value === "object" && value !== null && "rich_text" in value,
  );
  return payload?.rich_text;
};

// Notion rejects a create-page request whose code block carries a language it
// does not know — the whole page is refused, so a single `​```ts` fence stops
// the migration dead. Markdown and Shiki spell most languages differently from
// Notion, so every label is translated rather than passed through.
describe("notionCodeLanguage", () => {
  it("maps the aliases the posts and Shiki actually use", () => {
    const cases: Record<string, string> = {
      ts: "typescript",
      tsx: "typescript",
      js: "javascript",
      jsx: "javascript",
      sh: "shell",
      shell: "shell",
      md: "markdown",
      py: "python",
      yml: "yaml",
      cpp: "c++",
      cs: "c#",
      plain: "plain text",
      text: "plain text",
    };
    for (const [label, expected] of Object.entries(cases)) {
      expect(notionCodeLanguage(label)).toBe(expected);
    }
  });

  it("passes through labels Notion already accepts", () => {
    for (const language of [
      "typescript",
      "javascript",
      "python",
      "json",
      "go",
      "rust",
      "bash",
      "sql",
      "diff",
      "plain text",
      "c++",
      "c#",
    ]) {
      expect(notionCodeLanguage(language)).toBe(language);
    }
  });

  it("ignores case and surrounding whitespace", () => {
    for (const label of ["TS", " ts ", "TypeScript", "\tTSX\n"]) {
      expect(notionCodeLanguage(label)).toBe("typescript");
    }
  });

  it("reads only the language off a decorated fence info string", () => {
    expect(notionCodeLanguage("ts twoslash")).toBe("typescript");
    expect(notionCodeLanguage('js {1,3} title="x"')).toBe("javascript");
  });

  it("falls back to plain text rather than failing the whole page", () => {
    for (const label of ["", "   ", "vue", "svelte", "brainfuck", "ts-node"]) {
      expect(notionCodeLanguage(label)).toBe("plain text");
    }
  });

  it("only ever returns a language Notion accepts", () => {
    for (const label of ["ts", "yml", "cs", "nope", "", "PLAIN"]) {
      expect(languages.has(notionCodeLanguage(label))).toBe(true);
    }
  });
});

// The posts this migration exists to move. If their fences don't translate,
// the one thing the script has to do doesn't work.
describe("the committed posts", () => {
  const dir = path.join(process.cwd(), "content", "blog");
  const names = readdirSync(dir).filter((name) => name.endsWith(".mdx"));

  it("finds posts to migrate", () => {
    expect(names.length).toBeGreaterThan(0);
  });

  for (const name of names) {
    it(`parses ${name} into blocks Notion accepts`, () => {
      const { content } = matter(readFileSync(path.join(dir, name), "utf8"));
      const blocks = markdownToBlocks(content);

      expect(blocks.length).toBeGreaterThan(0);
      for (const block of codeBlocks(content)) {
        expect(languages.has(block.code.language)).toBe(true);
      }
    });
  }

  it("translates their ts fences to typescript", () => {
    const fences = names.flatMap((name) =>
      codeBlocks(matter(readFileSync(path.join(dir, name), "utf8")).content),
    );

    expect(fences.length).toBeGreaterThan(0);
    expect(fences.map((block) => block.code.language)).toEqual(
      fences.map(() => "typescript"),
    );
  });
});

describe("markdownToBlocks", () => {
  it("keeps the code body verbatim", () => {
    const blocks = codeBlocks("```ts\nconst a = 1;\n\n  indented();\n```\n");
    expect(blocks[0].code.rich_text).toEqual([
      { type: "text", text: { content: "const a = 1;\n\n  indented();" } },
    ]);
  });

  it("treats a bare fence as plain text", () => {
    expect(codeBlocks("```\njust words\n```\n")[0].code.language).toBe(
      "plain text",
    );
  });

  // blocks-to-md renders Notion H1/H2/H3 as `##`/`###`/`####`, so migrating in
  // the other direction has to shift back by exactly the same step or the first
  // sync after the migration deepens every sub-heading.
  it("shifts headings back to the levels the sync renders from", () => {
    expect(markdownToBlocks("## Section\n### Sub\n")).toEqual([
      {
        object: "block",
        type: "heading_1",
        heading_1: { rich_text: [{ type: "text", text: { content: "Section" } }] },
      },
      {
        object: "block",
        type: "heading_2",
        heading_2: { rich_text: [{ type: "text", text: { content: "Sub" } }] },
      },
    ]);
  });

  it("converts bullets and paragraphs", () => {
    expect(markdownToBlocks("- One\n\nProse.\n")).toEqual([
      {
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: [{ type: "text", text: { content: "One" } }],
        },
      },
      {
        object: "block",
        type: "paragraph",
        paragraph: { rich_text: [{ type: "text", text: { content: "Prose." } }] },
      },
    ]);
  });

  it("refuses markdown it would silently drop", () => {
    for (const line of ["# Title", "> Quote", "| a | b |"]) {
      expect(() => markdownToBlocks(line)).toThrow(/unsupported markdown/);
    }
  });

  it("keeps the inline formatting a line carries", () => {
    expect(richText("Call `searchDocs` first")).toEqual([
      { type: "text", text: { content: "Call " } },
      {
        type: "text",
        text: { content: "searchDocs" },
        annotations: { code: true },
      },
      { type: "text", text: { content: " first" } },
    ]);
  });

  it("keeps it in headings and list items too", () => {
    expect(richText("## A **bold** section")).toEqual([
      { type: "text", text: { content: "A " } },
      { type: "text", text: { content: "bold" }, annotations: { bold: true } },
      { type: "text", text: { content: " section" } },
    ]);
    expect(richText("### An *italic* sub")).toEqual([
      { type: "text", text: { content: "An " } },
      {
        type: "text",
        text: { content: "italic" },
        annotations: { italic: true },
      },
      { type: "text", text: { content: " sub" } },
    ]);
    expect(richText("- Read the [docs](https://example.com)")).toEqual([
      { type: "text", text: { content: "Read the " } },
      {
        type: "text",
        text: { content: "docs", link: { url: "https://example.com" } },
      },
    ]);
  });

  it("gives back the literal text the escaper defused", () => {
    expect(richText("\\*not emphasis\\* and Array&lt;T>")).toEqual([
      { type: "text", text: { content: "*not emphasis* and Array<T>" } },
    ]);
  });

  it("leaves a code block's body alone, backticks and all", () => {
    expect(codeBlocks("```md\nA **bold** `span`\n```\n")[0].code.rich_text).toEqual([
      { type: "text", text: { content: "A **bold** `span`" } },
    ]);
  });

  it("refuses inline markdown it cannot represent before anything is created", () => {
    for (const line of [
      "an ![image](https://example.com/a.png) inline",
      "a [reference][link]",
      "an <span>element</span>",
      "an unclosed `code span",
    ]) {
      expect(() => markdownToBlocks(line)).toThrow(
        /unsupported inline markdown/,
      );
    }
  });

  it("does not mistake those characters inside a code block for markdown", () => {
    expect(() =>
      markdownToBlocks("```md\n# Title\n> Quote\n| a | b |\n```\n"),
    ).not.toThrow();
  });
});
