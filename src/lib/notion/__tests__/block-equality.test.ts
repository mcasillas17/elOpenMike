import { describe, it, expect } from "vitest";
import type { BlockObjectRequest } from "@notionhq/client";
import { matchBlockPrefix } from "@/lib/notion/block-equality";
import { markdownToBlocks } from "@/lib/notion/md-to-blocks";
import { normalizeBlocks } from "@/lib/notion/limits";
import type { MdBlock } from "@/lib/notion/types";

// Resuming a half-written page means appending to content somebody else may
// have written. The only thing that makes that safe is proving the blocks
// already on the page are exactly the blocks this migration would have written
// first — an exact prefix of the post, nested children and all. Anything else
// is somebody's draft, and the run has to say so rather than append to it.

const desired = (markdown: string): BlockObjectRequest[] =>
  normalizeBlocks(markdownToBlocks(markdown));

let ids = 0;

// A block in the shape Notion answers with: annotations spelled out in full, a
// colour, plain_text beside the text, and children already resolved.
function response(
  type: string,
  payload: Record<string, unknown>,
  children: MdBlock[] = [],
): MdBlock {
  ids += 1;
  return {
    id: `block-${ids}`,
    type,
    has_children: children.length > 0,
    [type]: payload,
    children,
  };
}

type Marks = Partial<{
  bold: boolean;
  italic: boolean;
  strikethrough: boolean;
  underline: boolean;
  code: boolean;
  color: string;
}>;

function run(text: string, marks: Marks = {}) {
  const { color = "default", ...rest } = marks;
  return {
    type: "text",
    text: { content: text, link: null },
    annotations: {
      bold: false,
      italic: false,
      strikethrough: false,
      underline: false,
      code: false,
      color,
      ...rest,
    },
    plain_text: text,
    href: null,
  };
}

const paragraph = (text: string, marks: Marks = {}) =>
  response("paragraph", { rich_text: [run(text, marks)], color: "default" });

const matched = (result: ReturnType<typeof matchBlockPrefix>) =>
  result.kind === "prefix" ? result.matched : `diverged: ${result.reason}`;

describe("blocks Notion already holds, measured against the post", () => {
  it("reads an empty page as a prefix of every post", () => {
    expect(matchBlockPrefix(desired("One.\n\nTwo.\n"), [])).toEqual({
      kind: "prefix",
      matched: 0,
    });
  });

  it("reads an empty page as the whole of an empty post", () => {
    expect(matchBlockPrefix([], [])).toEqual({ kind: "prefix", matched: 0 });
  });

  it("counts the blocks that already landed", () => {
    const blocks = desired("One.\n\nTwo.\n\nThree.\n");

    expect(matched(matchBlockPrefix(blocks, [paragraph("One.")]))).toBe(1);
    expect(
      matched(matchBlockPrefix(blocks, [paragraph("One."), paragraph("Two.")])),
    ).toBe(2);
  });

  it("reads a complete page as a full-length prefix", () => {
    const blocks = desired("One.\n\nTwo.\n");
    const result = matchBlockPrefix(blocks, [
      paragraph("One."),
      paragraph("Two."),
    ]);

    expect(result).toEqual({ kind: "prefix", matched: 2 });
  });

  it("refuses a page holding blocks the post does not have", () => {
    const result = matchBlockPrefix(desired("One.\n"), [
      paragraph("One."),
      paragraph("Something the author wrote."),
    ]);

    expect(result.kind).toBe("diverged");
    if (result.kind !== "diverged") throw new Error("expected divergence");
    expect(result.index).toBe(1);
    expect(result.reason).toMatch(/2 blocks|1 block|more/i);
  });

  it("refuses a page whose text differs from the post's", () => {
    const result = matchBlockPrefix(desired("One.\n\nTwo.\n"), [
      paragraph("Not one."),
    ]);

    expect(result.kind).toBe("diverged");
    if (result.kind !== "diverged") throw new Error("expected divergence");
    expect(result.index).toBe(0);
  });

  it("refuses a page whose block types differ from the post's", () => {
    const result = matchBlockPrefix(desired("## One\n"), [paragraph("One")]);

    expect(result.kind).toBe("diverged");
    if (result.kind !== "diverged") throw new Error("expected divergence");
    expect(result.reason).toMatch(/paragraph/);
    expect(result.reason).toMatch(/heading_1/);
  });

  it("refuses a page carrying a block Notion has but the migration never writes", () => {
    const result = matchBlockPrefix(desired("One.\n"), [
      response("image", { type: "file", file: { url: "https://s3/x" } }),
    ]);

    expect(result.kind).toBe("diverged");
  });
});

describe("the formatting a run carries", () => {
  it("matches the annotations the migration wrote", () => {
    expect(
      matched(
        matchBlockPrefix(desired("**bold**\n"), [
          paragraph("bold", { bold: true }),
        ]),
      ),
    ).toBe(1);
  });

  it("refuses a run the author styled differently", () => {
    expect(
      matchBlockPrefix(desired("**bold**\n"), [
        paragraph("bold", { italic: true }),
      ]).kind,
    ).toBe("diverged");
  });

  it("refuses a run the author coloured, which the migration never does", () => {
    expect(
      matchBlockPrefix(desired("plain\n"), [
        paragraph("plain", { color: "red" }),
      ]).kind,
    ).toBe("diverged");
  });

  it("matches a link by its destination", () => {
    const remote = response("paragraph", {
      rich_text: [
        {
          ...run("docs"),
          text: { content: "docs", link: { url: "https://example.com/" } },
          href: "https://example.com/",
        },
      ],
      color: "default",
    });

    expect(
      matched(
        matchBlockPrefix(desired("[docs](https://example.com/)\n"), [remote]),
      ),
    ).toBe(1);
    expect(
      matchBlockPrefix(desired("[docs](https://example.com/other)\n"), [remote])
        .kind,
    ).toBe("diverged");
  });

  // Notion is free to store one stretch of formatting as one run or several;
  // the migration itself splits a run longer than 2000 characters. Two runs
  // that render identically are one run, so the comparison merges before it
  // compares — otherwise a long paragraph could never be resumed.
  it("reads runs split at a boundary as the one run they render as", () => {
    const long = "a".repeat(2500);
    const remote = response("paragraph", {
      rich_text: [run(long.slice(0, 2000)), run(long.slice(2000))],
      color: "default",
    });

    expect(matched(matchBlockPrefix(desired(`${long}\n`), [remote]))).toBe(1);
  });

  it("ignores a run holding no text at all", () => {
    const remote = response("paragraph", {
      rich_text: [run("One."), run("")],
      color: "default",
    });

    expect(matched(matchBlockPrefix(desired("One.\n"), [remote]))).toBe(1);
  });
});

describe("blocks that carry more than their text", () => {
  it("matches a code block on its language as well as its body", () => {
    const code = (language: string) =>
      response("code", {
        rich_text: [run("const a = 1;")],
        language,
        caption: [],
      });

    expect(
      matched(
        matchBlockPrefix(desired("```ts\nconst a = 1;\n```\n"), [
          code("typescript"),
        ]),
      ),
    ).toBe(1);
    expect(
      matchBlockPrefix(desired("```ts\nconst a = 1;\n```\n"), [code("rust")])
        .kind,
    ).toBe("diverged");
  });

  it("matches a to-do on whether it is checked", () => {
    const todo = (checked: boolean) =>
      response("to_do", {
        rich_text: [run("Done")],
        checked,
        color: "default",
      });

    expect(matched(matchBlockPrefix(desired("- [x] Done\n"), [todo(true)]))).toBe(
      1,
    );
    expect(
      matchBlockPrefix(desired("- [x] Done\n"), [todo(false)]).kind,
    ).toBe("diverged");
  });

  it("refuses a heading the author made toggleable", () => {
    const heading = (is_toggleable: boolean) =>
      response("heading_1", {
        rich_text: [run("One")],
        color: "default",
        is_toggleable,
      });

    expect(matched(matchBlockPrefix(desired("## One\n"), [heading(false)]))).toBe(
      1,
    );
    expect(
      matchBlockPrefix(desired("## One\n"), [heading(true)]).kind,
    ).toBe("diverged");
  });

  it("refuses a code block the author captioned", () => {
    const remote = response("code", {
      rich_text: [run("const a = 1;")],
      language: "typescript",
      caption: [run("mine")],
    });

    expect(
      matchBlockPrefix(desired("```ts\nconst a = 1;\n```\n"), [remote]).kind,
    ).toBe("diverged");
  });
});

describe("the children a block nests", () => {
  const nestedList = () =>
    response("bulleted_list_item", { rich_text: [run("outer")], color: "default" }, [
      response("bulleted_list_item", {
        rich_text: [run("inner")],
        color: "default",
      }),
    ]);

  it("matches a nested list item by its children too", () => {
    expect(
      matched(matchBlockPrefix(desired("- outer\n  - inner\n"), [nestedList()])),
    ).toBe(1);
  });

  it("refuses a nested child the author changed", () => {
    const remote = response(
      "bulleted_list_item",
      { rich_text: [run("outer")], color: "default" },
      [
        response("bulleted_list_item", {
          rich_text: [run("something else")],
          color: "default",
        }),
      ],
    );

    expect(
      matchBlockPrefix(desired("- outer\n  - inner\n"), [remote]).kind,
    ).toBe("diverged");
  });

  it("refuses a block the author nested something extra under", () => {
    const remote = response(
      "bulleted_list_item",
      { rich_text: [run("outer")], color: "default" },
      [
        response("bulleted_list_item", {
          rich_text: [run("inner")],
          color: "default",
        }),
        response("bulleted_list_item", {
          rich_text: [run("mine")],
          color: "default",
        }),
      ],
    );

    expect(
      matchBlockPrefix(desired("- outer\n  - inner\n"), [remote]).kind,
    ).toBe("diverged");
  });

  it("refuses a block whose children never landed", () => {
    const remote = response("bulleted_list_item", {
      rich_text: [run("outer")],
      color: "default",
    });

    expect(
      matchBlockPrefix(desired("- outer\n  - inner\n"), [remote]).kind,
    ).toBe("diverged");
  });

  it("matches a table by its shape and every cell of every row", () => {
    const row = (cells: string[][]) =>
      response("table_row", {
        cells: cells.map((cell) => cell.map((value) => run(value))),
      });
    const table = (rows: MdBlock[]) =>
      response(
        "table",
        { table_width: 2, has_column_header: true, has_row_header: false },
        rows,
      );

    const markdown = "| A | B |\n| --- | --- |\n| 1 | 2 |\n";
    expect(
      matched(
        matchBlockPrefix(desired(markdown), [
          table([row([["A"], ["B"]]), row([["1"], ["2"]])]),
        ]),
      ),
    ).toBe(1);
    expect(
      matchBlockPrefix(desired(markdown), [
        table([row([["A"], ["B"]]), row([["1"], ["9"]])]),
      ]).kind,
    ).toBe("diverged");
  });
});
