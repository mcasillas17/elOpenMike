import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import BlogPage from "@/app/blog/page";
import * as blog from "@/lib/blog";
import type { PostMeta } from "@/lib/blog";

// Mock the loader so we can drive both the populated and empty states
// deterministically (the loader itself is tested in src/lib/__tests__/blog.test.ts).
vi.mock("@/lib/blog");

const fixture: PostMeta[] = [
  {
    slug: "first-post",
    title: "First Post",
    date: "2026-05-20",
    excerpt: "A first summary.",
    tags: ["AI"],
    readingMinutes: 3,
  },
  {
    slug: "second-post",
    title: "Second Post",
    date: "2026-04-01",
    excerpt: "A second summary.",
    tags: [],
    readingMinutes: 2,
  },
];

describe("/blog page", () => {
  it("renders the heading and a card per post", () => {
    vi.mocked(blog.getAllPosts).mockReturnValue(fixture);
    vi.mocked(blog.getAllTags).mockReturnValue([
      { name: "AI", slug: "ai", count: 1 },
    ]);
    render(<BlogPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Writing" }),
    ).toBeInTheDocument();
    for (const p of fixture) {
      expect(screen.getByRole("link", { name: p.title })).toHaveAttribute(
        "href",
        `/blog/${p.slug}`,
      );
    }
  });

  it("shows an empty state when there are no posts", () => {
    vi.mocked(blog.getAllPosts).mockReturnValue([]);
    vi.mocked(blog.getAllTags).mockReturnValue([]);
    render(<BlogPage />);
    expect(screen.getByText(/no posts yet/i)).toBeInTheDocument();
  });
});
