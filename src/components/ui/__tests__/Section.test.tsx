import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Section } from "@/components/ui/Section";

describe("Section", () => {
  it("renders with the given id and heading", () => {
    const { container } = render(
      <Section id="experience" eyebrow="Career" title="Experience">
        <p>content</p>
      </Section>,
    );
    expect(container.querySelector("#experience")).not.toBeNull();
    expect(
      screen.getByRole("heading", { name: "Experience" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Career")).toBeInTheDocument();
    expect(screen.getByText("content")).toBeInTheDocument();
  });
});
