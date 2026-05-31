import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ComicPanel } from "@/components/ui/comic/ComicPanel";

describe("ComicPanel", () => {
  it("renders children", () => {
    render(
      <ComicPanel tint="blue">
        <span>hello</span>
      </ComicPanel>,
    );
    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  it("renders a halftone overlay", () => {
    const { container } = render(
      <ComicPanel tint="blue">
        <span>hello</span>
      </ComicPanel>,
    );
    // Halftone is a child div with aria-hidden="true" and absolute inset-0.
    const halftone = container.querySelector(
      '[aria-hidden="true"].pointer-events-none.absolute',
    );
    expect(halftone).toBeTruthy();
  });

  it("renders as an <article>", () => {
    const { container } = render(
      <ComicPanel tint="cover">
        <span>x</span>
      </ComicPanel>,
    );
    expect(container.firstChild?.nodeName).toBe("ARTICLE");
  });

  it("merges extra className without dropping base classes", () => {
    const { container } = render(
      <ComicPanel tint="blue" className="h-32">
        <span>x</span>
      </ComicPanel>,
    );
    const el = container.firstChild as HTMLElement;
    expect(el.className).toMatch(/h-32/);
    expect(el.className).toMatch(/border-/); // base panel border still present
  });
});
