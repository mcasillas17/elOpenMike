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

  it("renders the approved six-project selection with stable issue numbers", () => {
    render(<Projects />);
    const cards = screen.getAllByRole("article");
    expect(cards.map((card) => card.querySelector("h3")?.textContent)).toEqual([
      "ScoreArc", "WallCrawl", "TuringCare", "WebSnag", "TuringAgent", "Watchslinger",
    ]);
    expect(cards[4]).toHaveTextContent(/A local-first AI agent/);
    expect(cards[0]).toHaveTextContent("№08");
    expect(cards[1]).toHaveTextContent("№07");
    expect(cards[2]).toHaveTextContent("№02");
    expect(cards[3]).toHaveTextContent("№06");
    expect(cards[4]).toHaveTextContent("№03");
    expect(cards[5]).toHaveTextContent("№13");
    expect(cards[0].querySelector(".h-60")).toBeInTheDocument();
    expect(cards[1].querySelector(".h-60")).toBeInTheDocument();
    for (const card of cards.slice(2)) {
      expect(card.querySelector(".h-44")).toBeInTheDocument();
    }
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
