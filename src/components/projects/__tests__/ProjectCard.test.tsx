import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProjectCard } from "@/components/projects/ProjectCard";
import type { Project } from "@/data/projects";

const base: Project = {
  slug: "demo",
  title: "Demo Project",
  summary: "A short summary.",
  year: "2025",
  tags: ["CLI", "Open source"],
  stack: ["TypeScript", "Node"],
  highlights: ["does a thing"],
  images: [],
};

describe("ProjectCard", () => {
  it("links the title to the project detail page", () => {
    render(<ProjectCard project={base} />);
    expect(
      screen.getByRole("link", { name: "Demo Project" }),
    ).toHaveAttribute("href", "/projects/demo");
  });

  it("renders summary and tags", () => {
    render(<ProjectCard project={base} />);
    expect(screen.getByText("A short summary.")).toBeInTheDocument();
    expect(screen.getByText("CLI")).toBeInTheDocument();
    expect(screen.getByText("Open source")).toBeInTheDocument();
  });

  it("renders Live and Source links when urls are present", () => {
    render(
      <ProjectCard
        project={{
          ...base,
          liveUrl: "https://live.example.com",
          repoUrl: "https://github.com/x/y",
        }}
      />,
    );
    expect(screen.getByRole("link", { name: /live demo/i })).toHaveAttribute(
      "href",
      "https://live.example.com",
    );
    const source = screen.getByRole("link", { name: /source/i });
    expect(source).toHaveAttribute("href", "https://github.com/x/y");
    expect(source).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("omits Live/Source links when urls are absent", () => {
    render(<ProjectCard project={base} />);
    expect(screen.queryByRole("link", { name: /live demo/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /source/i })).toBeNull();
  });

  it("shows the gradient fallback (no img) when there is no image", () => {
    render(<ProjectCard project={base} />);
    expect(screen.queryByRole("img")).toBeNull();
  });
});
