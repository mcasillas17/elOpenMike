import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Hero } from "@/components/sections/Hero";

describe("Hero", () => {
  it("renders the name and tagline", () => {
    render(<Hero />);
    expect(screen.getByText(/Casillas/)).toBeInTheDocument();
    expect(
      screen.getByText("Builder by day, open-mic by night."),
    ).toBeInTheDocument();
  });

  it("renders View work and résumé CTAs", () => {
    render(<Hero />);
    expect(
      screen.getByRole("link", { name: /view my work/i }),
    ).toHaveAttribute("href", "#experience");
    expect(
      screen.getByRole("link", { name: /résumé/i }),
    ).toHaveAttribute("href", "/resume.pdf");
  });
});
