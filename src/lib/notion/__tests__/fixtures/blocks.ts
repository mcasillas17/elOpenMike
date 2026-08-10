import type { MdBlock, RichText } from "../../types";

// Notion omits annotation fields when they're false, so the fixture starts from the full default shape.
export function rt(text: string, opts: Partial<RichText["annotations"]> & { href?: string | null } = {}): RichText {
  const { href, ...annotations } = opts;
  return {
    plain_text: text,
    href: href ?? null,
    annotations: {
      bold: false,
      italic: false,
      strikethrough: false,
      underline: false,
      code: false,
      ...annotations,
    },
  };
}

// Children are already resolved into the tree, matching the shape produced after block expansion.
export function block<T extends Record<string, unknown>>(type: string, payload: T, children: MdBlock[] = []): MdBlock & Record<string, unknown> {
  return {
    id: `${type}-${JSON.stringify(payload).length}-${children.length}`,
    type,
    has_children: children.length > 0,
    [type]: payload,
    children,
  };
}

// A post exercising every construct that could plausibly be unstable across
// runs: nested lists, a table, code, an image, and inline annotations.
export function samplePost(): MdBlock[] {
  return [
    block("heading_1", { rich_text: [rt("A minimal tool")] }),
    block("paragraph", {
      rich_text: [
        rt("Keep the surface small — see "),
        rt("searchDocs", { code: true }),
        rt(" and the "),
        rt("docs", { href: "https://example.com" }),
        rt("."),
      ],
    }),
    block("code", {
      rich_text: [rt("const hits = await index.search(q, { topK: 5 });")],
      language: "typescript",
    }),
    block("bulleted_list_item", { rich_text: [rt("outer")] }, [
      block("bulleted_list_item", { rich_text: [rt("inner")] }),
    ]),
    block("numbered_list_item", { rich_text: [rt("first")] }),
    block("numbered_list_item", { rich_text: [rt("second")] }),
    block("table", { has_column_header: true }, [
      block("table_row", { cells: [[rt("Metric")], [rt("Value")]] }),
      block("table_row", { cells: [[rt("p99")], [rt("120ms")]] }),
    ]),
    block("image", {
      type: "file",
      file: { url: "https://s3/signed" },
      caption: [rt("A diagram")],
    }),
    block("quote", { rich_text: [rt("Then delete the panels you never open.")] }),
  ];
}
