import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { mdxComponents } from "@/components/blog/mdx-components";

describe("mdxComponents", () => {
  it("styles inline code (string child) as a pill", () => {
    const Code = mdxComponents.code;
    const { container } = render(<Code>inline</Code>);
    const el = container.querySelector("code");
    expect(el?.className).toContain("bg-surface");
  });

  it("leaves block code (element children) unstyled for Shiki", () => {
    const Code = mdxComponents.code;
    const { container } = render(
      <Code>
        <span>x</span>
      </Code>,
    );
    const el = container.querySelector("code");
    expect(el?.className ?? "").not.toContain("bg-surface");
  });

  it("renders headings with the display font", () => {
    const H2 = mdxComponents.h2;
    const { container } = render(<H2>Heading</H2>);
    expect(container.querySelector("h2")?.className).toContain("font-display");
  });
});

describe("mdxComponents h4", () => {
  it("renders an h4 with display font styling", () => {
    const H4 = mdxComponents.h4;
    render(<H4>Fourth level</H4>);
    const heading = screen.getByRole("heading", { level: 4 });
    expect(heading).toHaveTextContent("Fourth level");
    expect(heading.className).toContain("font-display");
  });
});
