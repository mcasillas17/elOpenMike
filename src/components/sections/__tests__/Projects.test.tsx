import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Projects } from "@/components/sections/Projects";
import { featuredProjects } from "@/data/projects";

describe("Projects (home section)", () => {
  it("renders the 'Selected Projects' heading", () => {
    render(<Projects />);
    expect(
      screen.getByRole("heading", { name: "Selected Projects" }),
    ).toBeInTheDocument();
  });

  it("renders a clear 'All projects' link to /projects", () => {
    render(<Projects />);
    expect(
      screen.getByRole("link", { name: /all projects/i }),
    ).toHaveAttribute("href", "/projects");
  });

  it("features TuringAgent beside WebSnag rather than burying it as a name-only card", () => {
    render(<Projects />);
    const cards = screen.getAllByRole("article");
    expect(cards.slice(0, 2).map((card) => card.querySelector("h3")?.textContent)).toEqual([
      "WebSnag", "TuringAgent",
    ]);
    expect(screen.getByText(/A private assistant stack/)).toBeInTheDocument();
    expect(cards[1]).toHaveTextContent("№03");
  });

  it("renders the curated projects, each linked to its detail page", () => {
    render(<Projects />);
    for (const p of featuredProjects) {
      expect(
        screen.getByRole("link", { name: p.title }),
      ).toHaveAttribute("href", `/projects/${p.slug}`);
    }
  });
});
