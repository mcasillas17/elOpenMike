import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { compileMDX } from "next-mdx-remote/rsc";
import { mdxComponents } from "../mdx-components";

async function article(source: string) {
  const { content } = await compileMDX({ source, components: mdxComponents });
  return render(content);
}

describe("rich article blocks", () => {
  beforeEach(() => {
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
      configurable: true,
      value() { this.setAttribute("open", ""); },
    });
    Object.defineProperty(HTMLDialogElement.prototype, "close", {
      configurable: true,
      value() { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); },
    });
  });

  it("distinguishes warning callouts from quoted prose", async () => {
    await article('<ArticleCallout tone="warning" icon="!">\n\nKeep a human approval step.\n\n</ArticleCallout>\n\n> A useful quotation.');
    expect(screen.getByRole("note", { name: "Warning" })).toHaveTextContent("Keep a human approval step.");
    expect(screen.getByText("A useful quotation.").closest("blockquote")).not.toBeNull();
  });

  it("keeps rich toggle summaries and nested content in a native disclosure", async () => {
    await article("<ArticleToggle>\n\n<ArticleSummary>Read the **tradeoff**</ArticleSummary>\n\nDetails stay available.\n\n</ArticleToggle>");
    const summary = screen.getByText("tradeoff").closest("summary")!;
    const details = summary.closest("details");
    expect(details).not.toHaveAttribute("open");
    expect(summary.querySelector("strong")).toHaveTextContent("tradeoff");
    fireEvent.click(summary);
    expect(details).toHaveAttribute("open");
    expect(screen.getByText("Details stay available.")).toBeVisible();
  });

  it("renders visible figure captions and a keyboard-dismissable full-size viewer", async () => {
    await article('<ArticleFigure>\n\n![A diagram](/images/projects/websnag-dashboard.png)\n\n<ArticleCaption>A **caption** with context.</ArticleCaption>\n\n</ArticleFigure>');
    expect(screen.getByRole("figure").querySelector("figcaption")).toHaveTextContent("A caption with context.");
    const expand = screen.getByRole("button", { name: /expand image/i });
    fireEvent.click(expand);
    expect(screen.getByRole("dialog", { name: "Full-size image" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Zoom image" }));
    expect(screen.getByRole("button", { name: "Fit image" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("dialog").querySelector("img")).toHaveStyle({ width: "200%" });
    fireEvent.click(screen.getByRole("button", { name: "Close image" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(expand).toHaveFocus();
  });

  it("reports a malformed figure rather than silently failing to open it", async () => {
    await article("<ArticleFigure>\n\n<ArticleCaption>No image supplied.</ArticleCaption>\n\n</ArticleFigure>");
    fireEvent.click(screen.getByRole("button", { name: /expand image/i }));
    expect(screen.getByRole("alert")).toHaveTextContent("This figure has no image to expand.");
  });

  it("retains captions and copy controls on code examples", async () => {
    await article('<ArticleCode>\n\n<ArticleCaption>Before</ArticleCaption>\n\n```ts\nconst value = 1;\n```\n\n</ArticleCode>');
    expect(screen.getByRole("figure").querySelector("figcaption")).toHaveTextContent("Before");
    expect(screen.getByRole("button", { name: "Copy code" })).toBeInTheDocument();
    expect(screen.getByText("const value = 1;")).toBeInTheDocument();
  });

  it("keeps references as real navigable links, without a preview-fetch dependency", async () => {
    await article('<ArticleReference>\n\n[Source documentation](https://example.com/docs)\n\n</ArticleReference>');
    expect(screen.getByRole("note", { name: "Reference" })).toContainElement(
      screen.getByRole("link", { name: "Source documentation" }),
    );
    expect(screen.getByRole("link", { name: "Source documentation" })).toHaveAttribute("href", "https://example.com/docs");
  });
});
