import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Hero } from "@/components/sections/Hero";
import { site } from "@/lib/site";

describe("Hero", () => {
  it("renders the name, headline, tagline, and availability", () => {
    render(<Hero />);
    expect(screen.getByText(new RegExp(site.lastName))).toBeInTheDocument();
    expect(screen.getByText(site.headline)).toBeInTheDocument();
    expect(screen.getByText(site.tagline)).toBeInTheDocument();
    expect(screen.getByText(site.availability)).toBeInTheDocument();
  });

  it("renders Resume, Email, and LinkedIn CTAs", () => {
    render(<Hero />);
    expect(
      screen.getByRole("link", { name: /resume/i }),
    ).toHaveAttribute("href", site.resumeHref);
    expect(screen.getByRole("link", { name: "Email" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "LinkedIn" })).toBeInTheDocument();
  });
});
