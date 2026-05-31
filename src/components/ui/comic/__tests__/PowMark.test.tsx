import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PowMark } from "@/components/ui/comic/PowMark";

describe("PowMark", () => {
  it("renders the word", () => {
    render(<PowMark word="THWIP!" />);
    expect(screen.getByText("THWIP!")).toBeInTheDocument();
  });

  it("is aria-hidden", () => {
    render(<PowMark word="ZAP!" />);
    expect(screen.getByText("ZAP!").getAttribute("aria-hidden")).toBe("true");
  });

  it("applies the requested rotation via inline style", () => {
    render(<PowMark word="BAMF!" rotate={-6} />);
    const el = screen.getByText("BAMF!");
    expect(el.style.transform).toContain("rotate(-6deg)");
  });
});
