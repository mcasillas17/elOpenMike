import { describe, it, expect, vi } from "vitest";
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

  it("calls notFound for an unknown slug (throws)", async () => {
    await expect(
      PostPage({ params: Promise.resolve({ slug: "nope-not-real" }) }),
    ).rejects.toThrow();
  });
});
