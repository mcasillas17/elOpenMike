import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Tag } from "@/components/ui/Tag";

describe("Tag", () => {
  it("renders its label", () => {
    render(<Tag>Open source</Tag>);
    expect(screen.getByText("Open source")).toBeInTheDocument();
  });
});
