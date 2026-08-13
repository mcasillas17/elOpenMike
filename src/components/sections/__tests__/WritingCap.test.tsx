import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { PostMeta } from "@/lib/blog";

// The repo only ships two posts, so rendering the real loader can never show
// the cap doing anything: `slice(3)` of two posts is empty and the assertion
// passes even if the section rendered all of them. Five fixture posts make the
// limit and the ordering observable.
const posts: PostMeta[] = [
  "newest",
  "second",
  "third",
  "fourth",
  "oldest",
].map((slug, index) => ({
  slug,
  title: `Post ${slug}`,
  date: `2026-0${5 - index}-10`,
  excerpt: `Excerpt ${slug}`,
  tags: ["AI"],
  readingMinutes: 3,
}));

vi.mock("@/lib/blog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/blog")>();
  return { ...actual, getAllPosts: vi.fn(() => posts) };
});

import { Writing } from "@/components/sections/Writing";
import { getAllPosts } from "@/lib/blog";

// Post titles sit one level below the section's "Latest posts" h2.
const titles = (container: HTMLElement) =>
  [...container.querySelectorAll("article h3")].map((h) => h.textContent);

describe("Writing section with more posts than it shows", () => {
  it("renders exactly three cards", () => {
    const { container } = render(<Writing />);
    expect(container.querySelectorAll("article")).toHaveLength(3);
  });

  it("renders the three newest, in order", () => {
    const { container } = render(<Writing />);
    expect(titles(container)).toEqual([
      "Post newest",
      "Post second",
      "Post third",
    ]);
  });

  it("leaves the older posts out entirely", () => {
    render(<Writing />);
    for (const slug of ["fourth", "oldest"]) {
      expect(screen.queryByText(`Post ${slug}`)).not.toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: `Post ${slug}` }),
      ).not.toBeInTheDocument();
    }
  });

  it("takes the order the loader gives it rather than re-sorting", () => {
    vi.mocked(getAllPosts).mockReturnValueOnce([
      posts[2],
      posts[0],
      posts[4],
      posts[1],
    ]);
    const { container } = render(<Writing />);
    expect(titles(container)).toEqual([
      "Post third",
      "Post newest",
      "Post oldest",
    ]);
  });

  it("still links every card it does render", () => {
    render(<Writing />);
    expect(
      screen.getByRole("link", { name: "Post newest" }),
    ).toHaveAttribute("href", "/blog/newest");
  });

  it("renders nothing at all when there are no posts", () => {
    vi.mocked(getAllPosts).mockReturnValueOnce([]);
    const { container } = render(<Writing />);
    expect(container.querySelector("#writing")).toBeNull();
  });
});
