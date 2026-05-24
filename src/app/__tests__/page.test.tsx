import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Home from "@/app/page";

describe("Home page", () => {
  it("renders hero name, experience and projects sections", () => {
    render(<Home />);
    expect(screen.getByText(/Casillas/)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Experience" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Projects" }),
    ).toBeInTheDocument();
  });
});
