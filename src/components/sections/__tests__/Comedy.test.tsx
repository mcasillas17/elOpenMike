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
    const { container } = render(<Comedy />);
    expect(
      screen.getByRole("button", { name: `Play: ${clips[0].title}` }),
    ).toBeInTheDocument();
    expect(container.querySelector("img")).not.toBeNull();
    expect(container.querySelector("figcaption")).toHaveTextContent(clips[0].title);
    expect(screen.getByRole("link", { name: /watch on youtube/i })).toHaveAttribute(
      "href",
      `https://www.youtube.com/watch?v=${clips[0].youtubeId}`,
    );
  });

  it("calls the 2023 set featured, not recent", () => {
    render(<Comedy />);
    expect(screen.getByText(/featured set/i)).toBeInTheDocument();
    expect(screen.queryByText(/recent set/i)).not.toBeInTheDocument();
  });
});
