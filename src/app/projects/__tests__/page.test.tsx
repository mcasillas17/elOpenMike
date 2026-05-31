import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ProjectsPage from "@/app/projects/page";
import { projects } from "@/data/projects";

describe("/projects page", () => {
  it("renders 'The Casefile' as the visible h1", () => {
    render(<ProjectsPage />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toMatch(/Casefile/);
  });

  it("renders one card per project, each linked to its detail page", () => {
    render(<ProjectsPage />);
    for (const p of projects) {
      expect(
        screen.getByRole("link", { name: p.title }),
      ).toHaveAttribute("href", `/projects/${p.slug}`);
    }
  });
});
