import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  ComicButton,
  ComicLinkButton,
} from "@/components/ui/comic/ComicButton";

describe("ComicButton", () => {
  it("renders an external <a> with the provided href and children", () => {
    render(
      <ComicButton href="https://example.com">Live demo</ComicButton>,
    );
    const link = screen.getByRole("link", { name: "Live demo" });
    expect(link).toHaveAttribute("href", "https://example.com");
  });

  it("sets rel='noopener noreferrer' when target='_blank' and rel is absent", () => {
    render(
      <ComicButton href="https://example.com" target="_blank">
        Source
      </ComicButton>,
    );
    expect(screen.getByRole("link", { name: "Source" })).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );
  });

  it("applies the ghost variant class when requested", () => {
    render(
      <ComicButton href="https://example.com" variant="ghost">
        Source
      </ComicButton>,
    );
    expect(screen.getByRole("link", { name: "Source" }).className).toMatch(
      /bg-surface/,
    );
  });
});

describe("ComicLinkButton", () => {
  it("renders an internal link with the provided href", () => {
    render(
      <ComicLinkButton href="/projects">
        View All Issues
      </ComicLinkButton>,
    );
    expect(
      screen.getByRole("link", { name: "View All Issues" }),
    ).toHaveAttribute("href", "/projects");
  });
});
