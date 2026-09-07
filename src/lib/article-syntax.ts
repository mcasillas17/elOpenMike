export type ArticleHeading = { id: string; title: string; level: 2 | 3 };

type SyntaxNode = {
  type: string;
  name?: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  attributes?: unknown[];
  children?: SyntaxNode[];
};

function text(node: SyntaxNode): string {
  return node.value ?? node.children?.map(text).join("") ?? "";
}

function caption(node: SyntaxNode): string | undefined {
  if (node.name !== "ArticleCode") return;
  const label = node.children?.find((child) => child.name === "ArticleCaption");
  return label ? text(label).trim().toLowerCase() : undefined;
}

export function remarkArticleBlocks() {
  return function transform(node: SyntaxNode) {
    if (!node.children) return;
    for (const child of node.children) transform(child);

    // Summaries are phrasing content, even when the source used blank lines.
    if (node.name === "ArticleSummary") {
      node.children = node.children.flatMap((child) =>
        child.type === "paragraph" ? child.children ?? [] : [child],
      );
    }

    const grouped: SyntaxNode[] = [];
    for (let index = 0; index < node.children.length; index += 1) {
      const current = node.children[index];
      const next = node.children[index + 1];
      if (caption(current) === "before" && next && caption(next) === "after") {
        grouped.push({
          type: "mdxJsxFlowElement",
          name: "ArticleComparison",
          attributes: [],
          children: [current, next],
        });
        index += 1;
      } else {
        grouped.push(current);
      }
    }
    node.children = grouped;
  };
}

export function articleOutline(headings: ArticleHeading[]) {
  return function rehypeArticleOutline() {
    return function visit(node: SyntaxNode) {
      if (["ArticleToggle", "ArticleCallout", "ArticleReference"].includes(node.name ?? "")) return;
      if (node.type === "element" && ["blockquote", "details", "aside"].includes(node.tagName ?? "")) return;
      if (
        node.type === "element" &&
        (node.tagName === "h1" || node.tagName === "h2" || node.tagName === "h3") &&
        typeof node.properties?.id === "string"
      ) {
        const title = text(node).replace(/\s+/g, " ").trim();
        if (title) headings.push({
          id: node.properties.id,
          title,
          level: node.tagName === "h3" ? 3 : 2,
        });
      }
      node.children?.forEach(visit);
    };
  };
}
