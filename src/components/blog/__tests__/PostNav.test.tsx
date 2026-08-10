import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PostNav } from "@/components/blog/PostNav";
import type { PostMeta } from "@/lib/blog";

const post = (slug: string, title: string): PostMeta => ({
  slug,
  title,
  date: "2026-05-20",
  excerpt: "Summary.",
  tags: [],
  readingMinutes: 3,
});

describe("PostNav", () => {
  it("links both neighbours with their titles", () => {
    render(
      <PostNav
        prev={post("newer", "Newer post")}
        next={post("older", "Older post")}
      />,
    );
    expect(screen.getByRole("link", { name: /Newer post/ })).toHaveAttribute(
      "href",
      "/blog/newer",
    );
    expect(screen.getByRole("link", { name: /Older post/ })).toHaveAttribute(
      "href",
      "/blog/older",
    );
  });

  it("renders only the side that exists", () => {
    render(<PostNav next={post("older", "Older post")} />);
    expect(screen.queryByText(/Previous/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Older post/ })).toBeInTheDocument();
  });

  it("renders nothing when there are no neighbours", () => {
    const { container } = render(<PostNav />);
    expect(container).toBeEmptyDOMElement();
  });

  it("is labelled for assistive tech", () => {
    render(<PostNav prev={post("newer", "Newer post")} />);
    expect(
      screen.getByRole("navigation", { name: /more posts/i }),
    ).toBeInTheDocument();
  });
});
