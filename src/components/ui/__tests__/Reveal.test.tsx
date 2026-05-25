import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Reveal } from "@/components/ui/Reveal";

afterEach(() => vi.unstubAllGlobals());

describe("Reveal", () => {
  it("renders its children", () => {
    render(<Reveal>hello world</Reveal>);
    expect(screen.getByText("hello world")).toBeInTheDocument();
  });

  it("adds is-visible when it intersects", () => {
    let cb: (entries: { isIntersecting: boolean }[]) => void = () => {};
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(c: typeof cb) { cb = c; }
        observe() { cb([{ isIntersecting: true }]); }
        disconnect() {}
        unobserve() {}
        takeRecords() { return []; }
      },
    );
    const { container } = render(<Reveal>content</Reveal>);
    expect(container.firstChild).toHaveClass("is-visible");
  });
});
