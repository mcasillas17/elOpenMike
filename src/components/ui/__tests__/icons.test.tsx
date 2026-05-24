import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { GitHubIcon, ExternalLinkIcon } from "@/components/ui/icons";

describe("icons", () => {
  it("render as decorative (aria-hidden) svgs", () => {
    const { container, rerender } = render(<GitHubIcon />);
    let svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute("aria-hidden", "true");

    rerender(<ExternalLinkIcon />);
    svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });
});
