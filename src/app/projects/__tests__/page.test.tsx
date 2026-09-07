import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
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
    expect(screen.getAllByRole("article")).toHaveLength(13);
    for (const p of projects) {
      expect(
        screen.getByRole("link", { name: p.title }),
      ).toHaveAttribute("href", `/projects/${p.slug}`);
    }
  });

  it("groups the archive under accessible category headings and jump links", () => {
    render(<ProjectsPage />);
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual([
      "Products", "Developer tools", "Games",
    ]);
    const navigation = screen.getByRole("navigation", { name: "Project categories" });
    for (const [id, label] of [
      ["products", "Products"], ["developer-tools", "Developer tools"], ["games", "Games"],
    ]) {
      expect(within(navigation).getByRole("link", { name: label })).toHaveAttribute("href", `#${id}`);
      const section = screen.getByRole("region", { name: label });
      const entries = projects.filter((project) => project.category === id);
      expect(within(section).getAllByRole("article")).toHaveLength(entries.length);
      for (const project of entries) {
        const heading = within(section).getByRole("heading", { level: 3, name: project.title });
        expect(heading.closest("article")).toHaveTextContent(
          `№${String(projects.length - projects.indexOf(project)).padStart(2, "0")}`,
        );
      }
    }
    expect(screen.queryByText(/newest first/i)).not.toBeInTheDocument();
  });
});
