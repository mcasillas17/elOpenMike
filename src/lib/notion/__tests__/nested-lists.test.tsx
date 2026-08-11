import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { compileMDX } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import type { ReactElement } from "react";
import { blocksToMarkdown } from "../blocks-to-md";
import { block, rt } from "./fixtures/blocks";
import type { MdBlock } from "@/lib/notion/types";

// Nesting was indented two spaces per level regardless of the parent's marker.
// That is right under "- ", whose content starts at column 2, and wrong under
// "1. ", whose content starts at column 3 — CommonMark closes the item and
// starts a *sibling* list instead of a nested one, so a sub-list under a
// numbered step rendered as a separate list beside it.

const ctx = { imagePath: (id: string) => `/images/${id}.png` };

const bullet = (text: string, children: MdBlock[] = []) =>
  block("bulleted_list_item", { rich_text: [rt(text)] }, children);

const numbered = (text: string, children: MdBlock[] = []) =>
  block("numbered_list_item", { rich_text: [rt(text)] }, children);

const todo = (text: string, checked: boolean, children: MdBlock[] = []) =>
  block("to_do", { rich_text: [rt(text)], checked }, children);

async function renderMdx(source: string): Promise<HTMLElement> {
  const { content } = await compileMDX({
    source,
    options: { mdxOptions: { remarkPlugins: [remarkGfm] } },
  });
  return render(content as ReactElement).container;
}

describe("child indentation follows the parent marker's content column", () => {
  it("indents a bullet child of a numbered item by three columns", () => {
    expect(blocksToMarkdown([numbered("One", [bullet("Child")])], ctx)).toBe(
      "1. One\n   - Child\n",
    );
  });

  it("indents a numbered child of a numbered item by three columns", () => {
    expect(blocksToMarkdown([numbered("One", [numbered("Inner")])], ctx)).toBe(
      "1. One\n   1. Inner\n",
    );
  });

  it("widens the indent for a two-digit ordinal", () => {
    const items = Array.from({ length: 10 }, (_, i) =>
      i === 9 ? numbered("Ten", [bullet("Child")]) : numbered(`Item ${i + 1}`),
    );
    expect(blocksToMarkdown(items, ctx)).toBe(
      "1. Item 1\n2. Item 2\n3. Item 3\n4. Item 4\n5. Item 5\n" +
        "6. Item 6\n7. Item 7\n8. Item 8\n9. Item 9\n10. Ten\n    - Child\n",
    );
  });

  it("keeps bullet nesting at two columns", () => {
    expect(blocksToMarkdown([bullet("Parent", [bullet("Child")])], ctx)).toBe(
      "- Parent\n  - Child\n",
    );
  });

  it("keeps a task item's children at two columns, since the checkbox is content", () => {
    expect(
      blocksToMarkdown([todo("Done", true, [bullet("Child")])], ctx),
    ).toBe("- [x] Done\n  - Child\n");
  });

  it("mixes bullet and numbered levels, each following its own parent", () => {
    expect(
      blocksToMarkdown(
        [bullet("Parent", [numbered("Inner", [bullet("Deep")])])],
        ctx,
      ),
    ).toBe("- Parent\n  1. Inner\n     - Deep\n");
    expect(
      blocksToMarkdown(
        [numbered("One", [numbered("Inner", [bullet("Deep")])])],
        ctx,
      ),
    ).toBe("1. One\n   1. Inner\n      - Deep\n");
  });

  it("indents a numbered item's non-list children to the same column", () => {
    expect(
      blocksToMarkdown(
        [
          numbered("One", [
            block("paragraph", { rich_text: [rt("Details")] }),
            block("code", {
              rich_text: [rt("const x = 1;")],
              language: "javascript",
            }),
          ]),
        ],
        ctx,
      ),
    ).toBe("1. One\n   Details\n   ```js\n   const x = 1;\n   ```\n");
  });
});

describe("what the parsed document actually looks like", () => {
  it("nests the sub-list inside the numbered item rather than beside it", async () => {
    const container = await renderMdx(
      blocksToMarkdown([numbered("One", [bullet("Child")])], ctx),
    );

    expect(container.querySelectorAll("ol")).toHaveLength(1);
    expect(container.querySelectorAll("ol > li")).toHaveLength(1);
    expect(container.querySelectorAll("ol > li > ul > li")).toHaveLength(1);
    expect(container.querySelector("ol > li > ul > li")?.textContent).toBe(
      "Child",
    );
  });

  it("nests under a two-digit ordinal too", async () => {
    const items = Array.from({ length: 10 }, (_, i) =>
      i === 9 ? numbered("Ten", [bullet("Child")]) : numbered(`Item ${i + 1}`),
    );
    const container = await renderMdx(blocksToMarkdown(items, ctx));

    expect(container.querySelectorAll("ol")).toHaveLength(1);
    expect(container.querySelectorAll("ol > li")).toHaveLength(10);
    expect(container.querySelectorAll("ol > li > ul > li")).toHaveLength(1);
  });

  it("nests three levels of mixed markers", async () => {
    const container = await renderMdx(
      blocksToMarkdown(
        [numbered("One", [numbered("Inner", [bullet("Deep")])])],
        ctx,
      ),
    );

    expect(
      container.querySelectorAll("ol > li > ol > li > ul > li"),
    ).toHaveLength(1);
  });

  it("still nests a bullet under a bullet", async () => {
    const container = await renderMdx(
      blocksToMarkdown([bullet("Parent", [bullet("Child")])], ctx),
    );
    expect(container.querySelectorAll("ul")).toHaveLength(2);
    expect(container.querySelectorAll("ul > li > ul > li")).toHaveLength(1);
  });

  it("keeps a numbered item's paragraph child inside the item", async () => {
    const container = await renderMdx(
      blocksToMarkdown(
        [
          numbered("One", [block("paragraph", { rich_text: [rt("Details")] })]),
          numbered("Two"),
        ],
        ctx,
      ),
    );

    expect(container.querySelectorAll("ol")).toHaveLength(1);
    expect(container.querySelectorAll("ol > li")).toHaveLength(2);
    expect(container.querySelectorAll("ol > li")[0].textContent).toBe(
      "One\nDetails",
    );
  });
});
