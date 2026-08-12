import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PostCard } from "@/components/blog/PostCard";
import type { PostMeta } from "@/lib/blog";

const post: PostMeta = {
  slug: "demo-post",
  title: "Demo Post",
  date: "2026-05-20",
  excerpt: "A short summary.",
  tags: ["AI"],
  readingMinutes: 4,
};

describe("PostCard", () => {
  it("links the title to the post and shows meta", () => {
    render(<PostCard post={post} />);
    expect(screen.getByRole("link", { name: "Demo Post" })).toHaveAttribute(
      "href",
      "/blog/demo-post",
    );
    expect(screen.getByText("A short summary.")).toBeInTheDocument();
    expect(screen.getByText("AI")).toBeInTheDocument();
    expect(screen.getByText(/min read/)).toBeInTheDocument();
  });

  it("uses the requested heading level when nested under a section title", () => {
    render(<PostCard post={post} headingLevel={3} />);
    expect(
      screen.getByRole("heading", { level: 3, name: "Demo Post" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { level: 2, name: "Demo Post" }),
    ).not.toBeInTheDocument();
  });

  it("keeps tag links touch-sized", () => {
    render(<PostCard post={post} />);
    expect(screen.getByRole("link", { name: "AI" })).toHaveClass("min-h-11");
  });
});
