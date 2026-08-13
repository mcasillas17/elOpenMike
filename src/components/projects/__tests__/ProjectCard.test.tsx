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
  liveUrl: "https://live.example.com",
  repoUrl: "https://github.com/x/y",
};

describe("ProjectCard", () => {
  for (const variant of [
    "large",
    "tall",
    "wide",
    "small",
    "feature",
    "aux",
    "uniform",
  ] as const) {
    it(`(${variant}) links the title to the project detail page`, () => {
      render(
        <ProjectCard
          project={base}
          index={0}
          variant={variant}
          issueNumber="04"
          headingLevel={3}
        />,
      );
      expect(
        screen.getByRole("link", { name: "Demo Project" }),
      ).toHaveAttribute("href", "/projects/demo");
    });
  }

  it("renders the summary in non-small variants", () => {
    render(
      <ProjectCard
        project={base}
        index={1}
        variant="uniform"
        issueNumber="03"
        headingLevel={3}
      />,
    );
    expect(screen.getByText("A short summary.")).toBeInTheDocument();
  });

  it("uses the heading level supplied by its page context", () => {
    const { rerender } = render(
      <ProjectCard
        project={base}
        index={0}
        variant="large"
        issueNumber="04"
        headingLevel={3}
      />,
    );
    expect(screen.getByRole("heading", { level: 3, name: "Demo Project" })).toBeInTheDocument();

    rerender(
      <ProjectCard
        project={base}
        index={0}
        variant="feature"
        issueNumber="04"
        headingLevel={2}
      />,
    );
    expect(screen.getByRole("heading", { level: 2, name: "Demo Project" })).toBeInTheDocument();
  });

  it("omits the summary in the small variant", () => {
    render(
      <ProjectCard
        project={base}
        index={3}
        variant="small"
        issueNumber="01"
        headingLevel={3}
      />,
    );
    expect(screen.queryByText("A short summary.")).toBeNull();
  });

  it("never renders Live demo or Source links on listing variants", () => {
    render(
      <ProjectCard
        project={base}
        index={0}
        variant="large"
        issueNumber="04"
        headingLevel={3}
      />,
    );
    expect(screen.queryByRole("link", { name: /live demo/i })).toBeNull();
    expect(
      screen.queryByRole("link", { name: /^source$/i }),
    ).toBeNull();
  });

  it("never renders tag pills on listing variants", () => {
    render(
      <ProjectCard
        project={base}
        index={0}
        variant="large"
        issueNumber="04"
        headingLevel={3}
      />,
    );
    expect(screen.queryByText("CLI")).toBeNull();
    expect(screen.queryByText("Open source")).toBeNull();
  });

  it("renders the issue number with the № prefix", () => {
    render(
      <ProjectCard
        project={base}
        index={0}
        variant="large"
        issueNumber="04"
        headingLevel={3}
      />,
    );
    expect(screen.getByText(/№04/)).toBeInTheDocument();
  });

  it("always renders a POW mark for the first project (index 0)", () => {
    render(
      <ProjectCard
        project={base}
        index={0}
        variant="large"
        issueNumber="04"
        headingLevel={3}
      />,
    );
    // The MARKS pool: THWIP! BAMF! ZAP! BOOM! KAPOW! SNIKT!
    const found = [
      "THWIP!",
      "BAMF!",
      "ZAP!",
      "BOOM!",
      "KAPOW!",
      "SNIKT!",
    ].some((m) => screen.queryByText(m) !== null);
    expect(found).toBe(true);
  });
});
