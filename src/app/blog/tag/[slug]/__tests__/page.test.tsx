import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import TagPage, {
  generateStaticParams,
  generateMetadata,
} from "@/app/blog/tag/[slug]/page";
import { getAllTags, getPostsByTag } from "@/lib/blog";

describe("tag page", () => {
  it("generates a param for every distinct tag", async () => {
    const params = await generateStaticParams();
    expect(params.map((p) => p.slug).sort()).toEqual(
      getAllTags()
        .map((t) => t.slug)
        .sort(),
    );
  });

  it("sets a canonical url and a tag-specific title", async () => {
    const tag = getAllTags()[0];
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: tag.slug }),
    });
    expect(metadata.title).toContain(tag.name);
    expect(metadata.alternates?.canonical).toBe(`/blog/tag/${tag.slug}`);
  });

  it("lists every post carrying the tag", async () => {
    const tag = getAllTags()[0];
    render(await TagPage({ params: Promise.resolve({ slug: tag.slug }) }));
    expect(
      screen.getByRole("heading", { level: 1, name: new RegExp(tag.name, "i") }),
    ).toBeInTheDocument();
    for (const post of getPostsByTag(tag.slug)) {
      expect(screen.getByText(post.title)).toBeInTheDocument();
    }
  });
});
