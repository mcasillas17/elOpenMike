import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PostFooter } from "@/components/blog/PostFooter";
import type { PostMeta } from "@/lib/blog";
import { site } from "@/lib/site";

const related: PostMeta = {
  slug: "related-post",
  title: "A related field note",
  date: "2026-07-01",
  excerpt: "Related summary.",
  tags: ["AI"],
  readingMinutes: 3,
};

describe("PostFooter", () => {
  it("offers topic-related reading and ways to keep in touch", () => {
    render(<PostFooter related={[related]} />);

    expect(screen.getByRole("heading", { name: "Keep reading" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: related.title })).toHaveAttribute(
      "href",
      "/blog/related-post",
    );
    expect(screen.getByText(/Miguel Casillas/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /follow via rss/i })).toHaveAttribute(
      "href",
      "/feed.xml",
    );
    expect(screen.getByRole("link", { name: /send an email/i })).toHaveAttribute(
      "href",
      site.contact.emailHref,
    );
  });

  it("omits the related-reading region when no post shares a topic", () => {
    render(<PostFooter related={[]} />);
    expect(screen.queryByRole("heading", { name: "Keep reading" })).not.toBeInTheDocument();
    expect(screen.getByText(/Miguel Casillas/)).toBeInTheDocument();
  });
});
