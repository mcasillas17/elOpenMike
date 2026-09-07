import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { blocksToMarkdown } from "../notion/blocks-to-md";
import { articleSpecimen, specimenImagePath } from "../article-specimen";
import { compileArticle } from "../article";

describe("Notion to editorial article", () => {
  it("preserves native rich blocks all the way to the production renderer", async () => {
    const source = blocksToMarkdown(articleSpecimen, { imagePath: specimenImagePath });
    const { content, headings } = await compileArticle(source);
    const { container } = render(content);
    expect(headings).toHaveLength(7);
    expect(headings.some((h) => h.title === "A detail, not a chapter")).toBe(false);
    expect(screen.getByRole("note", { name: "Warning" })).toHaveTextContent("missing evidence");
    expect(screen.getByRole("region", { name: "Code comparison" }).querySelectorAll("pre")).toHaveLength(2);
    expect(container.querySelector("figcaption")).toHaveTextContent("The publishing path");
    expect(screen.getByRole("button", { name: "Expand image" })).toBeInTheDocument();
    expect(container.querySelector("details > summary")).toHaveTextContent("Why the implementation detail stays optional");
    expect(screen.getByRole("note", { name: "Reference" })).toHaveTextContent("Next.js");
  });

  it("does not require manually patching the generated article", () => {
    const context = { imagePath: specimenImagePath };
    expect(blocksToMarkdown(articleSpecimen, context)).toBe(blocksToMarkdown(articleSpecimen, context));
  });
});
