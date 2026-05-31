import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Halftone } from "@/components/ui/comic/Halftone";

describe("Halftone", () => {
  it("renders an aria-hidden, pointer-events-none overlay", () => {
    const { container } = render(<Halftone />);
    const el = container.firstChild as HTMLElement;
    expect(el).toBeTruthy();
    expect(el.getAttribute("aria-hidden")).toBe("true");
    expect(el.className).toMatch(/pointer-events-none/);
    expect(el.className).toMatch(/absolute/);
  });

  it("respects an opacity multiplier", () => {
    const { container } = render(<Halftone opacity={0.5} />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.opacity).toBe("0.5");
  });
});
