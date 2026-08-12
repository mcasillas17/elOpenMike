import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FeaturedPost } from "@/components/blog/FeaturedPost";
import type { PostMeta } from "@/lib/blog";

const post: PostMeta = {
  slug: "featured-post",
  title: "A featured article",
  date: "2026-08-12",
  excerpt: "The useful promise this article makes to its reader.",
  tags: ["AI", "Distributed Systems"],
  readingMinutes: 6,
};

describe("FeaturedPost", () => {
  it("presents the newest article with its decision-making context", () => {
    render(<FeaturedPost post={post} />);

    expect(screen.getByText("Latest")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: post.title }),
    ).toBeInTheDocument();
    expect(screen.getByText(post.excerpt)).toBeInTheDocument();
    expect(screen.getByText(/6 min read/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "AI" })).toHaveAttribute(
      "href",
      "/blog/tag/ai",
    );
    expect(screen.getByRole("link", { name: "AI" })).toHaveClass("min-h-11");
  });
});
