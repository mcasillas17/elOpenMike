import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { PostCard } from "@/components/blog/PostCard";
import type { PostMeta } from "@/lib/blog";

vi.mock("next-mdx-remote/rsc", () => ({
  compileMDX: vi.fn(async () => ({ content: null })),
}));
vi.mock("rehype-pretty-code", () => ({ default: () => () => {} }));
vi.mock("remark-gfm", () => ({ default: () => () => {} }));
vi.mock("@/lib/blog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/blog")>();
  return { ...actual, getPost: vi.fn(), getAllPosts: vi.fn(), getAllTags: vi.fn() };
});

import * as blog from "@/lib/blog";
import BlogPage from "@/app/blog/page";
import PostPage from "@/app/blog/[slug]/page";
import TagPage, {
  generateStaticParams as tagParams,
} from "@/app/blog/tag/[slug]/page";

// Tags are optional. The Notion database's Tags column can be empty, and a post
// published from an empty one has `tags: []` in its frontmatter — which every
// component here already renders correctly, and which nothing tested.
//
// The end-to-end suite was where that showed: it opened /blog, took the first
// `a[href^="/blog/tag/"]` on the page and read its text, so a blog whose posts
// happened to carry no tags failed on a locator rather than on anything about
// the site. A post with no tags is a post, not a broken one.

const tagless: PostMeta = {
  slug: "quiet-post",
  title: "A post with nothing to file it under",
  date: "2026-05-20",
  excerpt: "No tags on this one.",
  tags: [],
  readingMinutes: 4,
};

const tagged: PostMeta = {
  slug: "filed-post",
  title: "A post somebody filed",
  date: "2026-04-01",
  excerpt: "This one is tagged.",
  tags: ["AI"],
  readingMinutes: 2,
};

const tagLinks = (container: HTMLElement) =>
  [...container.querySelectorAll('a[href^="/blog/tag/"]')];

describe("a post card with no tags", () => {
  it("renders the post, and no tag list at all", () => {
    const { container } = render(<PostCard post={tagless} />);

    expect(
      screen.getByRole("link", { name: tagless.title }),
    ).toHaveAttribute("href", `/blog/${tagless.slug}`);
    expect(screen.getByText(tagless.excerpt)).toBeInTheDocument();
    expect(tagLinks(container)).toHaveLength(0);
  });

  it("still links the tags of the card beside it", () => {
    const { container } = render(<PostCard post={tagged} />);

    expect(tagLinks(container).map((link) => link.getAttribute("href"))).toEqual(
      ["/blog/tag/ai"],
    );
  });
});

describe("a blog whose posts carry no tags at all", () => {
  beforeEach(() => {
    vi.mocked(blog.getAllPosts).mockReturnValue([tagless]);
    vi.mocked(blog.getAllTags).mockReturnValue([]);
  });

  it("lists every post and offers no tag page to go to", () => {
    const { container } = render(<BlogPage />);

    expect(
      screen.getByRole("link", { name: tagless.title }),
    ).toHaveAttribute("href", `/blog/${tagless.slug}`);
    expect(tagLinks(container)).toHaveLength(0);
  });

  it("builds no tag pages, which is a blog rather than a broken build", () => {
    expect(tagParams()).toEqual([]);
  });

  it("has no tag page to serve, so one asked for is a 404", async () => {
    await expect(
      TagPage({ params: Promise.resolve({ slug: "ai" }) }),
    ).rejects.toThrow();
  });
});

describe("a post page for a post with no tags", () => {
  it("renders the post rather than an empty tag list", async () => {
    vi.mocked(blog.getPost).mockReturnValue({
      meta: tagless,
      body: "Body of the post.",
    });
    vi.mocked(blog.getAllPosts).mockReturnValue([tagless]);

    const { container } = render(
      await PostPage({ params: Promise.resolve({ slug: tagless.slug }) }),
    );

    expect(
      screen.getByRole("heading", { level: 1 }).textContent,
    ).toContain("nothing to file it under");
    expect(tagLinks(container)).toHaveLength(0);
  });

  it("still links the tags of a post that has them", async () => {
    vi.mocked(blog.getPost).mockReturnValue({
      meta: tagged,
      body: "Body of the post.",
    });
    vi.mocked(blog.getAllPosts).mockReturnValue([tagged]);

    const { container } = render(
      await PostPage({ params: Promise.resolve({ slug: tagged.slug }) }),
    );

    expect(tagLinks(container).map((link) => link.getAttribute("href"))).toEqual(
      ["/blog/tag/ai"],
    );
  });
});
