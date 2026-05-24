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
    ).toHaveAttribute("href", "#experience");
  });

  it("renders a résumé link", () => {
    render(<Header />);
    expect(
      screen.getByRole("link", { name: /résumé/i }),
    ).toHaveAttribute("href", "/resume.pdf");
  });
});
