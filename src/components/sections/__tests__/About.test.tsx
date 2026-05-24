import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { About } from "@/components/sections/About";
import { about } from "@/data/about";

describe("About", () => {
  it("renders the headline, Turing caption, and fact chips", () => {
    render(<About />);
    expect(
      screen.getByRole("heading", { name: about.headline }),
    ).toBeInTheDocument();
    expect(screen.getByText(about.turing.caption)).toBeInTheDocument();
    for (const f of about.facts) {
      expect(screen.getByText(f)).toBeInTheDocument();
    }
  });
});
