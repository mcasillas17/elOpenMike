import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Projects } from "@/components/sections/Projects";
import { projects } from "@/data/projects";

describe("Projects (home preview)", () => {
  it("renders the section heading and a 'View all' link to /projects", () => {
    render(<Projects />);
    expect(
      screen.getByRole("heading", { name: "Projects" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /view all projects/i }),
    ).toHaveAttribute("href", "/projects");
  });

  it("renders the first three projects", () => {
    render(<Projects />);
    for (const p of projects.slice(0, 3)) {
      expect(
        screen.getByRole("link", { name: p.title }),
      ).toHaveAttribute("href", `/projects/${p.slug}`);
    }
  });
});
