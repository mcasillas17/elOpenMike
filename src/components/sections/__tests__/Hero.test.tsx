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
    expect(site.availability.length).toBeLessThan(65);
  });

  it("introduces the person and gives selected work a direct entry point", () => {
    render(<Hero />);
    expect(screen.getByRole("img", { name: /Miguel Casillas/ })).toHaveAttribute(
      "src",
      expect.stringContaining("miguel"),
    );
    expect(screen.getByRole("link", { name: /view projects/i })).toHaveAttribute(
      "href",
      "/#projects",
    );
    expect(screen.getByText("Microsoft since 2018")).toBeInTheDocument();
    expect(screen.getByText("Computer Engineering, ITAM")).toBeInTheDocument();
  });

  it("offers recruiter-ready resume and contact CTAs", () => {
    render(<Hero />);
    expect(
      screen.getByRole("link", { name: "Download résumé (PDF)" }),
    ).toHaveAttribute("href", site.resumeHref);
    expect(
      screen.getByRole("link", { name: "Download résumé (PDF)" }),
    ).toHaveAttribute("download");
    expect(screen.getByRole("link", { name: "Email" })).toHaveAttribute(
      "href",
      site.recruitingContact.emailHref,
    );
    expect(screen.getByRole("link", { name: "LinkedIn" })).toBeInTheDocument();
    const github = screen.getByRole("link", { name: "GitHub" });
    expect(github).toHaveAttribute("href", "https://github.com/mcasillas17");
    expect(github).toHaveAttribute("target", "_blank");
  });
});
