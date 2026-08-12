import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BlogTopicNav } from "@/components/blog/BlogTopicNav";
import { getAllTags } from "@/lib/blog";

describe("BlogTopicNav", () => {
  it("marks All as the current view and exposes the archive count", () => {
    render(<BlogTopicNav totalPosts={7} />);

    expect(screen.getByRole("navigation", { name: "Blog topics" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "All posts (7)" }))
      .toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "All posts (7)" }))
      .toHaveClass("min-h-11");
  });

  it("marks the selected topic and retains a way back to all posts", () => {
    const tag = getAllTags()[0];
    render(<BlogTopicNav currentSlug={tag.slug} totalPosts={7} />);

    expect(
      screen.getByRole("link", { name: `${tag.name} (${tag.count})` }),
    ).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "All posts (7)" })).not.toHaveAttribute(
      "aria-current",
    );
  });
});
