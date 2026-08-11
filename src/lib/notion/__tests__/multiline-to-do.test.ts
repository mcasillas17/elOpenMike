import { describe, expect, it } from "vitest";
import { markdownToBlocks } from "@/lib/notion/md-to-blocks";
import { blocksToMarkdown } from "@/lib/notion/blocks-to-md";
import type { MdBlock, RichText } from "@/lib/notion/types";
import { block, rt } from "./fixtures/blocks";

// A Notion to-do holds more than one line as often as any other block does: a
// shift+enter inside the item, or a paragraph pasted into it. The sync writes
// that out the way CommonMark reads it back — the marker on the first line, the
// rest at the item's content column:
//
//     - [x] first line
//       second line
//
// The migration then read the *whole* item, newline and all, against a checkbox
// pattern anchored to the start and end of the string. It never matched, so the
// item stopped being a to-do: at best it came back as a bullet whose text began
// with a literal "[x] ", and in fact it came back as nothing at all, because
// `[x]` opens no link and the inline reader refuses a bracket that does not.
// One task item with a second line therefore failed the entire post.
//
// The marker belongs to the item's first logical line and the rest is the
// item's text, which is what these hold to.

type MigrationBlock = ReturnType<typeof markdownToBlocks>[number];

const only = (markdown: string): MigrationBlock => {
  const blocks = markdownToBlocks(markdown);
  expect(blocks).toHaveLength(1);
  return blocks[0];
};

type ToDoPayload = {
  rich_text: Array<{ text: { content: string; link?: { url: string } | null }; annotations?: Record<string, boolean> }>;
  checked: boolean;
  children?: MigrationBlock[];
};

const toDo = (markdown: string): ToDoPayload => {
  const parsed = only(markdown) as { type: string; to_do?: ToDoPayload };
  expect(parsed.type).toBe("to_do");
  return parsed.to_do as ToDoPayload;
};

// The text the item carries, as one string — a run boundary is an annotation
// question, not a line-ending one.
const plain = (payload: ToDoPayload): string =>
  payload.rich_text.map((run) => run.text.content).join("");

describe("a to-do whose text runs past its first line", () => {
  it("keeps the checkbox and both lines when it is checked", () => {
    const payload = toDo("- [x] first line\n  second line\n");

    expect(payload.checked).toBe(true);
    expect(plain(payload)).toBe("first line\nsecond line");
    expect(payload.children).toBeUndefined();
  });

  it("keeps the checkbox and both lines when it is not", () => {
    const payload = toDo("- [ ] first line\n  second line\n");

    expect(payload.checked).toBe(false);
    expect(plain(payload)).toBe("first line\nsecond line");
  });

  it("reads an uppercase X the same way", () => {
    expect(toDo("- [X] first\n  second\n").checked).toBe(true);
  });

  // A file written on Windows, or fetched through a transport that rewrote its
  // line endings, arrives with \r\n. markdownToBlocks normalizes them, so the
  // continuation has to be found after that and not before.
  it("reads the same item out of CRLF input", () => {
    const payload = toDo("- [x] first line\r\n  second line\r\n");

    expect(payload.checked).toBe(true);
    expect(plain(payload)).toBe("first line\nsecond line");
  });

  it("carries the annotations and links the continuation holds", () => {
    const payload = toDo(
      "- [ ] **bold** start\n  see [docs](https://example.com) and `code`\n",
    );

    expect(payload.checked).toBe(false);
    expect(
      payload.rich_text.map((run) => [
        run.text.content,
        run.text.link?.url ?? null,
        run.annotations?.bold === true,
        run.annotations?.code === true,
      ]),
    ).toEqual([
      ["bold", null, true, false],
      [" start\nsee ", null, false, false],
      ["docs", "https://example.com", false, false],
      [" and ", null, false, false],
      ["code", null, false, true],
    ]);
  });

  it("still nests the blocks written under it", () => {
    const payload = toDo("- [x] first line\n  second line\n  - child\n");

    expect(payload.checked).toBe(true);
    expect(plain(payload)).toBe("first line\nsecond line");
    expect(payload.children).toEqual([
      {
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: [{ type: "text", text: { content: "child" } }],
        },
      },
    ]);
  });

  it("keeps a second paragraph as the child block it is written as", () => {
    const payload = toDo("- [x] first line\n\n  second paragraph\n");

    expect(payload.checked).toBe(true);
    expect(plain(payload)).toBe("first line");
    expect(payload.children).toEqual([
      {
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [{ type: "text", text: { content: "second paragraph" } }],
        },
      },
    ]);
  });

  it("reads a checkbox with nothing beside it, whose text starts on the next line", () => {
    const payload = toDo("- [x]\n  second line\n");

    expect(payload.checked).toBe(true);
    expect(plain(payload)).toBe("\nsecond line");
  });
});

describe("a bracket that is not this item's checkbox", () => {
  // The marker is read from the first logical line only. A continuation that
  // happens to open with a bracket is text the author wrote, and reading it as
  // a marker would silently move the item's own words into a checkbox.
  it("leaves a continuation opening with a bracket as text", () => {
    const payload = toDo("- [ ] task\n  \\[x\\] not a marker\n");

    expect(payload.checked).toBe(false);
    expect(plain(payload)).toBe("task\n[x] not a marker");
  });

  it("does not turn a bullet into a to-do because its second line looks like one", () => {
    const parsed = only("- first line\n  \\[x\\] second line\n") as {
      type: string;
      bulleted_list_item: { rich_text: Array<{ text: { content: string } }> };
    };

    expect(parsed.type).toBe("bulleted_list_item");
    expect(
      parsed.bulleted_list_item.rich_text
        .map((run) => run.text.content)
        .join(""),
    ).toBe("first line\n[x] second line");
  });

  it("still reads an escaped bracket on the first line as text", () => {
    expect(only("- \\[x\\] escaped\n  second line\n").type).toBe(
      "bulleted_list_item",
    );
  });

  it("still requires whitespace after the checkbox", () => {
    expect(only("- \\[x\\]no space\n  second line\n").type).toBe(
      "bulleted_list_item",
    );
  });

  // A numbered item's content column is its own, and GFM's checkbox is a task
  // *list* item's — an ordered item is not one.
  it("leaves an ordered item alone whatever its lines start with", () => {
    const parsed = only("1. \\[x\\] first\n   second\n") as { type: string };
    expect(parsed.type).toBe("numbered_list_item");
  });
});

// The two converters are inverses. What the sync writes out of a Notion page
// has to migrate back into the same page.
describe("a Notion to-do written out and read back", () => {
  const roundTrip = (blocks: MdBlock[]) =>
    markdownToBlocks(blocksToMarkdown(blocks, { imagePath: () => "" }));

  const runs = (...values: RichText[]) => values;

  it("comes back as the same to-do, checkbox and line endings and all", () => {
    const original = block("to_do", {
      rich_text: runs(rt("first line\nsecond line")),
      checked: true,
    });

    expect(roundTrip([original])).toEqual([
      {
        object: "block",
        type: "to_do",
        to_do: {
          rich_text: [
            { type: "text", text: { content: "first line\nsecond line" } },
          ],
          checked: true,
        },
      },
    ]);
  });

  it("comes back unchecked when it went out unchecked", () => {
    const original = block("to_do", {
      rich_text: runs(rt("first line\nsecond line")),
      checked: false,
    });

    const [parsed] = roundTrip([original]) as Array<{
      type: string;
      to_do: ToDoPayload;
    }>;

    expect(parsed.type).toBe("to_do");
    expect(parsed.to_do.checked).toBe(false);
    expect(plain(parsed.to_do)).toBe("first line\nsecond line");
  });

  it("keeps annotations, links and the child blocks under it", () => {
    const original = block(
      "to_do",
      {
        rich_text: runs(
          rt("first", { bold: true }),
          rt(" line\nsee "),
          rt("docs", { href: "https://example.com" }),
        ),
        checked: true,
      },
      [block("bulleted_list_item", { rich_text: runs(rt("child")) })],
    );

    const [parsed] = roundTrip([original]) as Array<{
      type: string;
      to_do: ToDoPayload;
    }>;

    expect(parsed.type).toBe("to_do");
    expect(parsed.to_do.checked).toBe(true);
    expect(
      parsed.to_do.rich_text.map((run) => [
        run.text.content,
        run.text.link?.url ?? null,
        run.annotations?.bold === true,
      ]),
    ).toEqual([
      ["first", null, true],
      [" line\nsee ", null, false],
      ["docs", "https://example.com", false],
    ]);
    expect(parsed.to_do.children).toEqual([
      {
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: [{ type: "text", text: { content: "child" } }],
        },
      },
    ]);
  });

  // The item's own words include ones that would otherwise be read as markup
  // on a line of their own — a bracket among them.
  it("keeps a continuation the escaper had to defuse", () => {
    const original = block("to_do", {
      rich_text: runs(rt("task\n[x] not a marker")),
      checked: false,
    });

    const [parsed] = roundTrip([original]) as Array<{
      type: string;
      to_do: ToDoPayload;
    }>;

    expect(parsed.type).toBe("to_do");
    expect(parsed.to_do.checked).toBe(false);
    expect(plain(parsed.to_do)).toBe("task\n[x] not a marker");
  });
});
