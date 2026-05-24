import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Header } from "@/components/layout/Header";

describe("Header", () => {
  it("renders the name and a nav link to Experience", () => {
    render(<Header />);
    expect(
      screen.getByRole("link", { name: /Miguel Casillas/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Experience" }),
    ).toHaveAttribute("href", "/#experience");
  });

  it("renders a resume link", () => {
    render(<Header />);
    expect(
      screen.getByRole("link", { name: /resume/i }),
    ).toHaveAttribute("href", "/resume.pdf");
  });

  it("marks the current section's nav link as active", () => {
    render(<Header />);
    // Experience is ids[0], so it is active on initial render.
    expect(screen.getByRole("link", { name: "Experience" })).toHaveClass(
      "text-web",
    );
  });
});
