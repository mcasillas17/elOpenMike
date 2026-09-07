import type { MdBlock, RichText } from "./notion/types";

function text(value: string): RichText {
  return {
    plain_text: value,
    href: null,
    annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false },
  };
}

function block(id: string, type: string, data: Record<string, unknown>, children: MdBlock[] = []): MdBlock {
  return { id, type, [type]: data, children, has_children: children.length > 0 };
}

function paragraph(id: string, value: string) {
  return block(id, "paragraph", { rich_text: [text(value)] });
}

function heading(id: string, value: string) {
  return block(id, "heading_1", { rich_text: [text(value)] });
}

// A synthetic Notion page for local previews and integration tests, never a blog post.
export const articleSpecimen: MdBlock[] = [
  paragraph("intro", "A useful technical article is more than a sequence of paragraphs. It gives the reader a question, a way to picture the answer, and enough evidence to decide whether the idea applies to their own work. This specimen demonstrates that structure using ordinary Notion blocks."),
  heading("idea", "Start with the idea"),
  paragraph("idea-copy", "Write the argument in Notion. Let the website handle the reading experience. A heading becomes a chapter, a callout keeps a caveat near the claim, and an image keeps its caption. You should not have to rebuild the page every time you publish."),
  block("note", "callout", { rich_text: [text("The author owns the meaning. The website owns the presentation.")], icon: { type: "emoji", emoji: "💡" }, color: "blue_background" }),
  heading("mental-model", "Give the reader a mental model"),
  paragraph("diagram-intro", "A diagram is useful when it makes a relationship easier to understand than prose does. Upload it as an image in Notion, add a descriptive caption, and let readers expand and zoom it when the details need more room."),
  block("diagram", "image", { type: "file", file: { url: "https://file.notion.so/specimen.png" }, caption: [text("The publishing path: native Notion blocks become shared article components, then an adaptive reading experience.")] }),
  block("quote", "quote", { rich_text: [text("Good structure makes the argument easier to follow. It should never become the argument.")] }),
  heading("comparison", "Make the tradeoff visible"),
  paragraph("comparison-intro", "These illustrative snippets show two different contracts for a retrieval result. The second makes the absence of evidence explicit. In Notion, give two adjacent code blocks the captions Before and After to present them together."),
  block("before", "code", {
    language: "typescript", caption: [text("Before")],
    rich_text: [text("return hits.map(hit => hit.text).join(\"\\n\");")],
  }),
  block("after", "code", {
    language: "typescript", caption: [text("After")],
    rich_text: [text('if (hits.length === 0) {\n  return { status: "no-evidence", sources: [] };\n}\n\nreturn {\n  status: "grounded",\n  sources: hits.map(({ id, text }) => ({ id, text })),\n};')],
  }),
  heading("caveats", "Keep the caveats close"),
  block("warning", "callout", {
    rich_text: [text("A richer layout cannot supply missing evidence. These examples demonstrate presentation, not measured production results.")],
    color: "red_background", icon: { type: "emoji", emoji: "⚠️" },
  }),
  paragraph("caveats-copy", "State the conditions under which an approach is useful and the conditions under which it is not. Put the essential caveat in the reading flow. Save an optional implementation detail for a disclosure so it does not interrupt everyone else."),
  block("detail", "toggle", { rich_text: [text("Why the implementation detail stays optional")] }, [
    heading("hidden-detail", "A detail, not a chapter"),
    paragraph("detail-copy", "This heading lives inside a closed disclosure, so it does not appear in the reading guide. The content is still present in the page and remains available through a native, keyboard-operable control."),
    block("nested-note", "callout", { rich_text: [text("Nested content keeps its meaning rather than being flattened into unrelated paragraphs.")], color: "default" }),
  ]),
  heading("table", "Make comparisons easy to scan"),
  paragraph("table-copy", "Use a table when the reader needs to compare the same properties across several options. On a phone, the table can scroll within its own boundary rather than forcing the whole page sideways."),
  block("comparison-table", "table", { has_column_header: true, has_row_header: false }, [
    block("table-header", "table_row", { cells: [[text("Notion block")], [text("Reading experience")]] }),
    block("table-callout", "table_row", { cells: [[text("Callout")], [text("A note or warning beside the argument")]] }),
    block("table-image", "table_row", { cells: [[text("Captioned image")], [text("A figure with an expandable, zoomable original")]] }),
    block("table-code", "table_row", { cells: [[text("Before / After code")], [text("A comparison with independent copy controls")]] }),
  ]),
  heading("sources", "Keep the sources attached"),
  paragraph("sources-copy", "A reference should be easy to open and clearly labelled. Bookmark blocks become lightweight source links; the site does not fetch third-party previews or invent descriptions of the destination."),
  block("reference", "bookmark", { url: "https://nextjs.org/docs/app/guides/mdx", caption: [text("Next.js: using Markdown and MDX")] }),
  heading("ending", "Finish with something useful"),
  paragraph("ending-copy", "Choose the blocks the idea needs. A short note can remain short, without a contents panel. A longer article can offer a reading guide, purposeful figures, practical comparisons, and optional detail. The same publishing workflow supports both."),
];

export const specimenImagePath = () => "/images/article-preview/flow.png";
