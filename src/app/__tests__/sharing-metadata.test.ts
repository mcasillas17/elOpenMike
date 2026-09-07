import { describe, expect, it, vi } from "vitest";
import type { Metadata } from "next";
import { metadata as root } from "@/app/layout";
import { metadata as home } from "@/app/page";
import { metadata as blog } from "@/app/blog/page";
import { metadata as projectsPage } from "@/app/projects/page";
import { metadata as comedy } from "@/app/comedy/page";
import { generateMetadata as projectMetadata } from "@/app/projects/[slug]/page";
import { generateMetadata as postMetadata } from "@/app/blog/[slug]/page";
import { generateMetadata as tagMetadata } from "@/app/blog/tag/[slug]/page";
import { projects } from "@/data/projects";
import { getAllPosts, getAllTags } from "@/lib/blog";
import { absoluteUrl, routes, site } from "@/lib/site";

vi.mock("@/lib/fonts", () => ({
  sora: { variable: "sora" },
  inter: { variable: "inter" },
}));
vi.mock("next-mdx-remote/rsc", () => ({
  compileMDX: vi.fn(async () => ({ content: null })),
}));
vi.mock("rehype-pretty-code", () => ({ default: () => () => {} }));
vi.mock("remark-gfm", () => ({ default: () => () => {} }));

function expectSharing(meta: Metadata, path: string, title: string, description: string) {
  expect(meta.openGraph).toMatchObject({
    title,
    description,
    url: absoluteUrl(path),
    siteName: "elOpenMike",
    locale: "en_US",
  });
  expect(meta.twitter).toMatchObject({ card: "summary_large_image", title, description });
  expect(meta.alternates?.canonical).toBe(path);
  expect(meta.alternates?.types).toHaveProperty("application/rss+xml");
}

describe("public link previews", () => {
  it("gives the homepage a canonical identity", () => {
    expectSharing(home, routes.home, "Miguel Casillas — Software Engineer", String(home.description));
  });

  it("does not give non-content routes the homepage canonical", () => {
    expect(root.alternates?.canonical).toBeUndefined();
    expect(root.openGraph).not.toHaveProperty("url");
  });

  it.each([
    [routes.blog, blog, "Blog"],
    [routes.projects, projectsPage, "Projects"],
    [routes.comedy, comedy, "Comedy"],
  ] as const)("gives %s its own social text", (path, meta, title) => {
    expectSharing(meta, path, title, String(meta.description));
    expect(meta.openGraph).toHaveProperty("type", "website");
  });

  it("uses every project's title and summary, not the homepage copy", async () => {
    for (const project of projects) {
      const meta = await projectMetadata({ params: Promise.resolve({ slug: project.slug }) });
      expectSharing(meta, routes.projectDetail(project.slug), project.title, project.summary);
    }
  });

  it("uses article text, type and publication context", async () => {
    for (const post of getAllPosts()) {
      const meta = await postMetadata({ params: Promise.resolve({ slug: post.slug }) });
      expectSharing(meta, routes.blogPost(post.slug), post.title, post.excerpt);
      expect(meta.openGraph).toMatchObject({
        type: "article",
        publishedTime: post.date,
        modifiedTime: post.updated ?? post.date,
        authors: [site.name],
        tags: post.tags,
      });
    }
  });

  it("uses the topic's name on filtered archives", async () => {
    for (const tag of getAllTags()) {
      const meta = await tagMetadata({ params: Promise.resolve({ slug: tag.slug }) });
      expectSharing(meta, routes.blogTag(tag.slug), `${tag.name} — Blog`, `Posts tagged ${tag.name}.`);
    }
  });
});
