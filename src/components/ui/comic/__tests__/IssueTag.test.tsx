import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { IssueTag } from "@/components/ui/comic/IssueTag";

describe("IssueTag", () => {
  it("renders the issue number with a № prefix", () => {
    render(<IssueTag number="04" />);
    expect(screen.getByText(/№04/)).toBeInTheDocument();
  });

  it("appends a label when provided", () => {
    render(<IssueTag number="01" label="NEW" />);
    expect(screen.getByText(/№01 · NEW/)).toBeInTheDocument();
  });

  it("uses the requested background variant class", () => {
    const { container } = render(
      <IssueTag number="02" variant="blue" />,
    );
    const el = container.firstChild as HTMLElement;
    expect(el.className).toMatch(/bg-web/);
  });

  it("applies the requested rotation", () => {
    const { container } = render(
      <IssueTag number="03" rotate={2} />,
    );
    const el = container.firstChild as HTMLElement;
    expect(el.style.transform).toContain("rotate(2deg)");
  });
});
