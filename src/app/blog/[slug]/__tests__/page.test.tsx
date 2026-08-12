import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { getAllPosts, getPostSlugs } from "@/lib/blog";

vi.mock("next-mdx-remote/rsc", () => ({
  compileMDX: vi.fn(async () => ({ content: null })),
}));
vi.mock("rehype-pretty-code", () => ({ default: () => () => {} }));
vi.mock("remark-gfm", () => ({ default: () => () => {} }));

import PostPage, {
  generateStaticParams,
  generateMetadata,
} from "@/app/blog/[slug]/page";

const sample = getAllPosts()[0];

describe("/blog/[slug] page", () => {
  it("generateStaticParams returns every slug", () => {
    expect(generateStaticParams()).toEqual(
      getPostSlugs().map((slug) => ({ slug })),
    );
  });

  it("generateMetadata sets the post title and description", async () => {
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: sample.slug }),
    });
    expect(meta.title).toBe(sample.title);
    expect(meta.description).toBe(sample.excerpt);
  });

  it("shows the excerpt and publication context before the article body", async () => {
    render(await PostPage({ params: Promise.resolve({ slug: sample.slug }) }));

    expect(screen.getByText(sample.excerpt)).toBeInTheDocument();
    expect(screen.getByText(/Published/i)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`${sample.readingMinutes} min read`, "i"))).toBeInTheDocument();
    if (sample.updated && sample.updated !== sample.date) {
      expect(screen.getByText(/Updated/i)).toBeInTheDocument();
    }
  });

  it("keeps back and topic links touch-sized", async () => {
    render(await PostPage({ params: Promise.resolve({ slug: sample.slug }) }));

    expect(screen.getByRole("link", { name: /back to blog/i })).toHaveClass(
      "min-h-11",
    );
    if (sample.tags.length > 0) {
      expect(screen.getByRole("link", { name: sample.tags[0] })).toHaveClass(
        "min-h-11",
        "min-w-11",
      );
    }
  });

  it("calls notFound for an unknown slug (throws)", async () => {
    await expect(
      PostPage({ params: Promise.resolve({ slug: "nope-not-real" }) }),
    ).rejects.toThrow();
  });
});
