import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Writing } from "@/components/sections/Writing";
import { getAllPosts } from "@/lib/blog";

describe("Writing section", () => {
  it("renders at most the three most recent posts", () => {
    render(<Writing />);
    const shown = getAllPosts().slice(0, 3);
    for (const post of shown) {
      expect(screen.getByText(post.title)).toBeInTheDocument();
    }
    for (const post of getAllPosts().slice(3)) {
      expect(screen.queryByText(post.title)).not.toBeInTheDocument();
    }
  });

  it("links to the full blog", () => {
    render(<Writing />);
    expect(
      screen.getByRole("link", { name: /read all posts/i }),
    ).toHaveAttribute("href", "/blog");
  });

  it("anchors the section for the nav", () => {
    const { container } = render(<Writing />);
    expect(container.querySelector("#writing")).not.toBeNull();
  });
});
