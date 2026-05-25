import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import BlogPage from "@/app/blog/page";
import { getAllPosts } from "@/lib/blog";

describe("/blog page", () => {
  it("renders the heading and a card per post", () => {
    render(<BlogPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Blog" }),
    ).toBeInTheDocument();
    for (const p of getAllPosts()) {
      expect(screen.getByRole("link", { name: p.title })).toHaveAttribute(
        "href",
        `/blog/${p.slug}`,
      );
    }
  });
});
