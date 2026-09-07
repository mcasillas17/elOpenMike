import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { compileArticle } from "../article";

describe("article compilation", () => {
  it("includes Markdown h1 sections that the renderer demotes to h2", async () => {
    const { content, headings } = await compileArticle("# One\n\n# Two\n\n# Three\n\n# Four");
    const { container } = render(content);
    expect(container.querySelectorAll("h2")).toHaveLength(4);
    expect(headings).toEqual([
      { id: "one", title: "One", level: 2 },
      { id: "two", title: "Two", level: 2 },
      { id: "three", title: "Three", level: 2 },
      { id: "four", title: "Four", level: 2 },
    ]);
  });

  it("collects the actual rendered heading IDs, including duplicates and inline formatting", async () => {
    const { content, headings } = await compileArticle("## A **clear** idea\n\n## A clear idea\n\n### Café\n\n```\n## Not a heading\n```");
    const { container } = render(content);
    expect(headings).toEqual([
      { id: "a-clear-idea", title: "A clear idea", level: 2 },
      { id: "a-clear-idea-1", title: "A clear idea", level: 2 },
      { id: "café", title: "Café", level: 3 },
    ]);
    expect([...container.querySelectorAll("h2,h3")].map((h) => h.id)).toEqual(headings.map((h) => h.id));
  });

  it("does not offer navigation into closed disclosures or asides", async () => {
    const { headings } = await compileArticle("## Visible\n\n<ArticleToggle>\n\n<ArticleSummary>More</ArticleSummary>\n\n## Hidden\n\n</ArticleToggle>\n\n<ArticleCallout>\n\n## Aside\n\n</ArticleCallout>");
    expect(headings.map((heading) => heading.title)).toEqual(["Visible"]);
  });

  it("groups only adjacent, explicitly labelled Before and After code examples", async () => {
    const example = (caption: string, code: string) => `<ArticleCode>\n\n<ArticleCaption>${caption}</ArticleCaption>\n\n\`\`\`ts\n${code}\n\`\`\`\n\n</ArticleCode>`;
    const { content } = await compileArticle(`${example("Before", "const before = 1;")}\n\n${example("After", "const after = 2;")}\n\n${example("Standalone", "const standalone = 3;")}`);
    render(content);
    const comparison = screen.getByRole("region", { name: "Code comparison" });
    expect(comparison.querySelectorAll("pre")).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Copy code" })).toHaveLength(3);
  });

  it("does not pair examples across explanatory prose", async () => {
    const { content } = await compileArticle("<ArticleCode>\n\n<ArticleCaption>Before</ArticleCaption>\n\n```\na\n```\n\n</ArticleCode>\n\nKeep this explanation in order.\n\n<ArticleCode>\n\n<ArticleCaption>After</ArticleCaption>\n\n```\nb\n```\n\n</ArticleCode>");
    render(content);
    expect(screen.queryByRole("region", { name: "Code comparison" })).not.toBeInTheDocument();
  });
});
