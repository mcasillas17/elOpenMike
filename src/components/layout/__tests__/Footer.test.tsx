import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Footer } from "@/components/layout/Footer";

describe("Footer", () => {
  it("renders the site name and social links", () => {
    render(<Footer />);
    expect(screen.getByText(/Miguel Casillas/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /resume/i })).toHaveAttribute(
      "href",
      "/resume.pdf",
    );
    expect(screen.getByRole("link", { name: "GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/mcasillas17",
    );
    expect(screen.getByRole("link", { name: "Email" })).toHaveAttribute(
      "href",
      "mailto:micasillm@gmail.com",
    );
  });

  it("opens external links safely in a new tab", () => {
    render(<Footer />);
    const github = screen.getByRole("link", { name: "GitHub" });
    expect(github).toHaveAttribute("target", "_blank");
    expect(github).toHaveAttribute("rel", "noopener noreferrer");
    // mailto link must NOT get target/rel
    const email = screen.getByRole("link", { name: "Email" });
    expect(email).not.toHaveAttribute("target");
  });

  it("gives every footer action a touch-sized target", () => {
    render(<Footer />);
    for (const link of screen.getAllByRole("link")) {
      expect(link).toHaveClass("min-h-11");
    }
    expect(
      screen.getByRole("button", { name: "Toggle web-slinger mode" }),
    ).toHaveClass("min-h-11", "min-w-11");
  });
});
