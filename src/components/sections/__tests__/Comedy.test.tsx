import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Comedy } from "@/components/sections/Comedy";
import { clips } from "@/data/comedy";

describe("Comedy (home teaser)", () => {
  it("renders the Stand-up heading and a Watch more link to /comedy", () => {
    render(<Comedy />);
    expect(
      screen.getByRole("heading", { name: "Stand-up" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /watch more/i }),
    ).toHaveAttribute("href", "/comedy");
  });

  it("features the first clip", () => {
    render(<Comedy />);
    expect(
      screen.getByRole("button", { name: `Play: ${clips[0].title}` }),
    ).toBeInTheDocument();
  });
});
