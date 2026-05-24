import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Home from "@/app/page";
import { about } from "@/data/about";

describe("Home page", () => {
  it("renders all home sections", () => {
    render(<Home />);
    expect(screen.getByText(/Casillas/)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Experience" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Projects" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: about.headline }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Stand-up" }),
    ).toBeInTheDocument();
  });
});
