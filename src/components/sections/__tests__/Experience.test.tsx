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

  it("renders each role's company, title, and focus", () => {
    render(<Experience />);
    for (const role of experience) {
      // company can repeat across roles (e.g. multiple roles at one employer)
      expect(screen.getAllByText(role.company).length).toBeGreaterThan(0);
      expect(screen.getAllByText(role.title).length).toBeGreaterThan(0);
      expect(screen.getByText(role.focus)).toBeInTheDocument();
    }
  });

  it("includes a resume download link", () => {
    render(<Experience />);
    expect(
      screen.getByRole("link", { name: "Download résumé (PDF)" }),
    ).toHaveAttribute("href", "/resume.pdf");
  });

  it("renders each role's highlights and tech stack", () => {
    render(<Experience />);
    for (const role of experience) {
      for (const highlight of role.highlights) {
        expect(screen.getByText(highlight)).toBeInTheDocument();
      }
      if (role.stack && role.stack.length > 0) {
        expect(
          screen.getByText(role.stack.join(" · ")),
        ).toBeInTheDocument();
      }
    }
  });
});
