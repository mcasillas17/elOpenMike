import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Projects } from "@/components/sections/Projects";
import { projects } from "@/data/projects";

describe("Projects (home section)", () => {
  it("renders the 'Selected Projects' heading", () => {
    render(<Projects />);
    expect(
      screen.getByRole("heading", { name: "Selected Projects" }),
    ).toBeInTheDocument();
  });

  it("renders a 'View All Issues' link to /projects", () => {
    render(<Projects />);
    expect(
      screen.getByRole("link", { name: /view all issues/i }),
    ).toHaveAttribute("href", "/projects");
  });

  it("renders up to the first 4 projects, each linked to its detail page", () => {
    render(<Projects />);
    for (const p of projects.slice(0, 4)) {
      expect(
        screen.getByRole("link", { name: p.title }),
      ).toHaveAttribute("href", `/projects/${p.slug}`);
    }
  });
});
