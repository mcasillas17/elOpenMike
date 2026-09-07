import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ArticleReader } from "../ArticleReader";
import type { ArticleHeading } from "@/lib/article-syntax";

const headings: ArticleHeading[] = [
  { id: "problem", title: "The problem", level: 2 },
  { id: "approach", title: "An approach", level: 2 },
  { id: "tradeoffs", title: "Tradeoffs", level: 3 },
  { id: "references", title: "References", level: 2 },
];

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});
afterEach(() => vi.restoreAllMocks());

describe("ArticleReader", () => {
  it("does not add a contents panel or progress controls to short notes", () => {
    render(<ArticleReader headings={headings.slice(0, 1)}><h2 id="problem">A short note</h2></ArticleReader>);
    expect(screen.queryByText("On this page")).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("links to the compiled headings and exposes reading progress for longer articles", async () => {
    render(<ArticleReader headings={headings}>{headings.map((h) => <h2 key={h.id} id={h.id}>{h.title}</h2>)}</ArticleReader>);
    await waitFor(() => expect(screen.getByRole("navigation", { name: "On this page" })).toBeVisible());
    for (const heading of headings) {
      expect(screen.getByRole("link", { name: heading.title })).toHaveAttribute("href", `#${heading.id}`);
    }
    expect(screen.getByRole("progressbar", { name: "Reading progress" })).toHaveAttribute("aria-valuemax", "100");
  });

  it("starts compact on mobile and can be expanded with native controls", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    render(<ArticleReader headings={headings}><p>Body</p></ArticleReader>);
    const summary = screen.getByText("On this page").closest("summary")!;
    expect(summary.closest("details")).not.toHaveAttribute("open");
    fireEvent.click(summary);
    await waitFor(() => expect(summary.closest("details")).toHaveAttribute("open"));
    expect(screen.getByRole("link", { name: "References" })).toBeVisible();
  });

  it("tracks the last reached heading rather than only headings intersecting a narrow band", async () => {
    let scroll = 0;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.hasAttribute("data-article-content")) return new DOMRect(0, 100 - scroll, 700, 2000);
      const index = headings.findIndex((heading) => heading.id === this.id);
      return new DOMRect(0, index < 0 ? 0 : [120, 600, 1100, 1800][index] - scroll, 700, 40);
    });
    render(<ArticleReader headings={headings}>{headings.map((heading) => <h2 key={heading.id} id={heading.id}>{heading.title}</h2>)}</ArticleReader>);
    await waitFor(() => expect(screen.getByRole("link", { name: "The problem" })).toHaveAttribute("aria-current", "location"));
    scroll = 1000;
    fireEvent.scroll(window);
    await waitFor(() => expect(screen.getByRole("link", { name: "Tradeoffs" })).toHaveAttribute("aria-current", "location"));
    const progress = Number(screen.getByRole("progressbar").getAttribute("aria-valuenow"));
    expect(progress).toBeGreaterThan(0);
    expect(progress).toBeLessThan(100);
  });
});
