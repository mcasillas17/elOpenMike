import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Experience } from "@/components/sections/Experience";
import { experience } from "@/data/experience";

describe("Experience", () => {
  it("renders the section heading", () => {
    render(<Experience />);
    expect(
      screen.getByRole("heading", { name: "Experience" }),
    ).toBeInTheDocument();
  });

  it("renders each role's company and title", () => {
    render(<Experience />);
    for (const role of experience) {
      expect(screen.getByText(role.company)).toBeInTheDocument();
      expect(screen.getAllByText(role.title).length).toBeGreaterThan(0);
    }
  });

  it("includes a résumé download link", () => {
    render(<Experience />);
    expect(
      screen.getByRole("link", { name: /résumé/i }),
    ).toHaveAttribute("href", "/resume.pdf");
  });
});
