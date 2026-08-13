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
      screen.getByRole("heading", { name: "Selected Projects" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: about.headline }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Stand-up" }),
    ).toBeInTheDocument();
  });

  it("surfaces the writing section", () => {
    const { container } = render(<Home />);
    expect(container.querySelector("#writing")).not.toBeNull();
  });

  it("places How I work after projects and before the supporting sections", () => {
    const { container } = render(<Home />);
    const sections = Array.from(container.querySelectorAll("section"));
    const ids = sections.map((section) => section.id);

    expect(ids.indexOf("projects")).toBeLessThan(ids.indexOf("how-i-work"));
    expect(ids.indexOf("how-i-work")).toBeLessThan(ids.indexOf("skills"));
    expect(ids.indexOf("how-i-work")).toBeLessThan(ids.indexOf("about"));
  });
});
