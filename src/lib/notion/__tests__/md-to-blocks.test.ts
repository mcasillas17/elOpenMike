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

  it("translates the TypeScript article's ts fence to typescript", () => {
    const { content } = matter(
      readFileSync(path.join(dir, "grounding-agents-with-mcp.mdx"), "utf8"),
    );
    const fences = codeBlocks(content);

    expect(fences.length).toBeGreaterThan(0);
    expect(fences.map((block) => block.code.language)).toEqual(
      fences.map(() => "typescript"),
    );
  });
});

describe("markdownToBlocks", () => {
  describe("line-ending normalization", () => {
    const everyBlockForm = [
      "Paragraph.",
      "",
      "## Heading one",
      "### Heading two",
      "#### Heading three",
      "",
      "- Bullet",
      "",
      "1. Numbered",
      "",
      "- [x] Done",
      "",
      "> Quote",
      ">",
      "> - Nested",
      "",
      "---",
      "",
      "| A | B |",
      "| --- | --- |",
      "| 1 | 2 |",
      "",
      "```ts",
      "const answer = 42;",
      "```",
      "",
    ].join("\n");

    it.each([
      ["CRLF", "\r\n"],
      ["lone CR", "\r"],
    ])("parses every emitted block form with %s exactly like LF", (_name, ending) => {
      const expected = markdownToBlocks(everyBlockForm);
      const actual = markdownToBlocks(everyBlockForm.replaceAll("\n", ending));

      expect(actual).toEqual(expected);
      expect(actual.map((block) => block.type)).toEqual([
        "paragraph",
        "heading_1",
        "heading_2",
        "heading_3",
        "bulleted_list_item",
        "numbered_list_item",
        "to_do",
        "quote",
        "divider",
        "table",
        "code",
      ]);
    });

    it.each([
      ["CRLF", "\r\n"],
      ["lone CR", "\r"],
    ])(
      "normalizes %s inside a fence without changing fence semantics",
      (_name, ending) => {
        const fenced = [
          "````md",
          "before",
          "```ts",
          "inside",
          "```",
          "after",
          "````",
          "",
        ].join(ending);

        const [block] = codeBlocks(fenced);
        expect(block.code.language).toBe("markdown");
        expect(block.code.rich_text).toEqual([
          {
            type: "text",
            text: { content: "before\n```ts\ninside\n```\nafter" },
          },
        ]);
      },
    );
  });

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

  // CommonMark closes a fenced block on a line of the same character, at least
  // as long as the one that opened it, and carrying nothing else. A fence that
  // never meets one runs to the end of the document, so the rest of the post
  // would have arrived in Notion as code.
  describe("a fence that does not close", () => {
    const rejects = (markdown: string) =>
      expect(() => markdownToBlocks(markdown)).toThrow(/unsupported markdown/);

    it("refuses a block that never closes", () => {
      rejects("```ts\nconst a = 1;\n");
      rejects("```ts\nconst a = 1;\n\nAnd prose after it.\n");
    });

    it("refuses a closer shorter than the fence that opened the block", () => {
      rejects("````md\ncode\n```\n");
    });

    it("refuses a closer carrying an info string, which closes nothing", () => {
      rejects("```ts\ncode\n```js\n");
    });

    it("refuses an info string a backtick fence cannot carry", () => {
      rejects("```js`x\ncode\n```\n");
    });

    it("says what to do about it", () => {
      expect(() => markdownToBlocks("```ts\ncode\n")).toThrow(
        /never closes/,
      );
    });
  });

  describe("a fence long enough for what is inside it", () => {
    it("keeps a shorter fence in the body rather than closing on it", () => {
      const [block] = codeBlocks("````md\n```ts\ninner\n```\n````\n");
      expect(block.code.rich_text).toEqual([
        { type: "text", text: { content: "```ts\ninner\n```" } },
      ]);
      expect(block.code.language).toBe("markdown");
    });

    it("closes on a fence longer than the one that opened it", () => {
      expect(codeBlocks("```ts\ncode\n`````\n")[0].code.rich_text).toEqual([
        { type: "text", text: { content: "code" } },
      ]);
    });

    it("reads a tilde fence, which markdown opens a block with too", () => {
      const [block] = codeBlocks("~~~ts\nconst a = 1;\n~~~\n");
      expect(block.code.language).toBe("typescript");
      expect(block.code.rich_text).toEqual([
        { type: "text", text: { content: "const a = 1;" } },
      ]);
    });

    it("keeps reading the document after the block closes", () => {
      const blocks = markdownToBlocks("```ts\ncode\n```\n\nProse.\n");
      expect(blocks).toHaveLength(2);
      expect(blocks[1].type).toBe("paragraph");
    });
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
    for (const line of ["# Title", "##### Deeper", "    indented code"]) {
      expect(() => markdownToBlocks(line)).toThrow(/unsupported markdown/);
    }
  });

  // Every block blocks-to-md writes has to read back as the block it came
  // from. Anything that came back as a paragraph instead lost the shape the
  // author gave it, silently and permanently.
  describe("the blocks the sync writes", () => {
    const only = (markdown: string) => markdownToBlocks(markdown)[0];

    it("reads a numbered item as a numbered item", () => {
      expect(markdownToBlocks("1. One\n2. Two\n")).toEqual([
        {
          object: "block",
          type: "numbered_list_item",
          numbered_list_item: {
            rich_text: [{ type: "text", text: { content: "One" } }],
          },
        },
        {
          object: "block",
          type: "numbered_list_item",
          numbered_list_item: {
            rich_text: [{ type: "text", text: { content: "Two" } }],
          },
        },
      ]);
    });

    it("reads a checkbox as a to-do, checked or not", () => {
      expect(only("- [x] Done")).toEqual({
        object: "block",
        type: "to_do",
        to_do: {
          rich_text: [{ type: "text", text: { content: "Done" } }],
          checked: true,
        },
      });
      expect(only("- [ ] Todo")).toEqual({
        object: "block",
        type: "to_do",
        to_do: {
          rich_text: [{ type: "text", text: { content: "Todo" } }],
          checked: false,
        },
      });
      // A bracket the escaper defused is text, not a checkbox.
      expect(only("- \\[x\\] escaped").type).toBe("bulleted_list_item");
      // GFM needs whitespace after the checkbox for it to be one.
      expect(only("- \\[x\\]no space").type).toBe("bulleted_list_item");
    });

    it("reads a rule as a divider", () => {
      expect(only("---")).toEqual({
        object: "block",
        type: "divider",
        divider: {},
      });
    });

    it("reads the fourth heading level the sync writes", () => {
      expect(only("#### Deep")).toEqual({
        object: "block",
        type: "heading_3",
        heading_3: {
          rich_text: [{ type: "text", text: { content: "Deep" } }],
        },
      });
    });

    it("reads a blockquote as a quote, with what follows it as children", () => {
      expect(only("> Quoted")).toEqual({
        object: "block",
        type: "quote",
        quote: { rich_text: [{ type: "text", text: { content: "Quoted" } }] },
      });

      const withChildren = only("> Quoted\n>\n> - a\n> - b");
      expect(withChildren).toEqual({
        object: "block",
        type: "quote",
        quote: {
          rich_text: [{ type: "text", text: { content: "Quoted" } }],
          children: [
            {
              object: "block",
              type: "bulleted_list_item",
              bulleted_list_item: {
                rich_text: [{ type: "text", text: { content: "a" } }],
              },
            },
            {
              object: "block",
              type: "bulleted_list_item",
              bulleted_list_item: {
                rich_text: [{ type: "text", text: { content: "b" } }],
              },
            },
          ],
        },
      });
    });

    it("nests a sub-list under the item it is indented into", () => {
      expect(only("- outer\n  - inner")).toEqual({
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: [{ type: "text", text: { content: "outer" } }],
          children: [
            {
              object: "block",
              type: "bulleted_list_item",
              bulleted_list_item: {
                rich_text: [{ type: "text", text: { content: "inner" } }],
              },
            },
          ],
        },
      });

      // A numbered item's content column is the width of "1." plus its space.
      const numbered = only("1. outer\n   - inner");
      expect(numbered.type).toBe("numbered_list_item");
      expect(
        (numbered as { numbered_list_item: { children?: unknown[] } })
          .numbered_list_item.children,
      ).toHaveLength(1);

      const todo = only("- [x] outer\n  - inner");
      expect(todo.type).toBe("to_do");
      expect(
        (todo as { to_do: { children?: unknown[] } }).to_do.children,
      ).toHaveLength(1);
    });

    it("reads a GFM table as a table with its rows", () => {
      expect(only("| A | B |\n| --- | --- |\n| 1 | 2 |")).toEqual({
        object: "block",
        type: "table",
        table: {
          table_width: 2,
          has_column_header: true,
          children: [
            {
              object: "block",
              type: "table_row",
              table_row: {
                cells: [
                  [{ type: "text", text: { content: "A" } }],
                  [{ type: "text", text: { content: "B" } }],
                ],
              },
            },
            {
              object: "block",
              type: "table_row",
              table_row: {
                cells: [
                  [{ type: "text", text: { content: "1" } }],
                  [{ type: "text", text: { content: "2" } }],
                ],
              },
            },
          ],
        },
      });
    });

    it("leaves a pipe line that opens no table as the paragraph it renders as", () => {
      expect(only("| a | b | and no delimiter row").type).toBe("paragraph");
    });

    it("keeps a bookmark's link, which markdown spells as a paragraph", () => {
      expect(only("[Example](https://example.com/)")).toEqual({
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [
            {
              type: "text",
              text: {
                content: "Example",
                link: { url: "https://example.com/" },
              },
            },
          ],
        },
      });
    });

    it("joins the lines of one paragraph rather than splitting it", () => {
      expect(only("first line\nsecond line")).toEqual({
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [
            { type: "text", text: { content: "first line\nsecond line" } },
          ],
        },
      });
    });
  });

  describe("block syntax with no Notion equivalent", () => {
    const rejects = (markdown: string) =>
      expect(() => markdownToBlocks(markdown)).toThrow(/unsupported markdown/);

    it("throws rather than downgrading it to a paragraph", () => {
      rejects("# Title");
      rejects("##### Five");
      rejects("###### Six");
      rejects("    an indented code block");
      rejects("\tan indented code block");
      rejects("Heading\n===");
      rejects("Heading\n---");
      // Notion creates one level of nesting per request.
      rejects("- a\n  - b\n    - c");
      rejects("> quoted\n>\n> - a\n>   - b");
    });

    it("refuses an image, which points at a path Notion cannot fetch", () => {
      expect(() => markdownToBlocks("![A diagram](/images/x.png)")).toThrow(
        /unsupported inline markdown/,
      );
    });

    // The line number, never the line: the message is printed to a log and the
    // line that reached a refusal is the odd one in the post. See
    // error-redaction.test.ts.
    it("numbers the line it refused without repeating it", () => {
      expect(() => markdownToBlocks("Prose.\n\n# Title")).toThrow(/line 3/);
      expect(() => markdownToBlocks("# Title")).not.toThrow(/Title/);
    });
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
