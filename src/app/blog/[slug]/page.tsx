import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { compileMDX } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import rehypePrettyCode, {
  type Options as PrettyCodeOptions,
} from "rehype-pretty-code";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import { Container } from "@/components/ui/Container";
import { Tag } from "@/components/ui/Tag";
import {
  getPost,
  getPostSlugs,
  tagSlug,
  getAdjacentPosts,
  getRelatedPosts,
} from "@/lib/blog";
import { mdxComponents } from "@/components/blog/mdx-components";
import { PostNav } from "@/components/blog/PostNav";
import { PostFooter } from "@/components/blog/PostFooter";
import { ArticleJsonLd } from "@/components/seo/ArticleJsonLd";
import { routes, alternatesFor } from "@/lib/site";

const prettyCodeOptions: PrettyCodeOptions = {
  theme: "github-dark",
  keepBackground: true,
};

export const dynamicParams = false;

export function generateStaticParams() {
  return getPostSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return {};
  return {
    title: post.meta.title,
    description: post.meta.excerpt,
    alternates: alternatesFor(routes.blogPost(slug)),
  };
}

function accentedTitle(title: string) {
  const parts = title.split(" ");
  if (parts.length < 2) return title;
  const last = parts[parts.length - 1];
  const rest = parts.slice(0, -1).join(" ");
  return (
    <>
      {rest} <span className="text-spidey">{last}</span>
    </>
  );
}

function dateLabel(date: string) {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default async function PostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  const { content } = await compileMDX({
    source: post.body,
    components: mdxComponents,
    options: {
      mdxOptions: {
        remarkPlugins: [remarkGfm],
        rehypePlugins: [
          rehypeSlug,
          [
            rehypeAutolinkHeadings,
            {
              behavior: "after",
              group: {
                type: "element",
                tagName: "div",
                properties: { className: ["heading-group"] },
                children: [],
              },
              properties: {
                className: ["heading-anchor"],
                ariaLabel: "Link to this section",
              },
              content: { type: "text", value: "#" },
            },
          ],
          [rehypePrettyCode, prettyCodeOptions],
        ],
      },
    },
  });

  const publishedLabel = dateLabel(post.meta.date);
  const updatedLabel =
    post.meta.updated && post.meta.updated !== post.meta.date
      ? dateLabel(post.meta.updated)
      : undefined;

  return (
    <Container className="py-16">
      <div className="mx-auto max-w-3xl">
        <ArticleJsonLd
          slug={slug}
          title={post.meta.title}
          description={post.meta.excerpt}
          date={post.meta.date}
          tags={post.meta.tags}
          updated={post.meta.updated}
        />
        <Link
          href={routes.blog}
          className="inline-flex min-h-11 items-center rounded text-sm text-muted hover:text-web-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web"
        >
          ← Back to blog
        </Link>
        <p className="mt-6 text-xs font-medium uppercase tracking-[0.2em] text-web-strong">
          Published {publishedLabel}
          {updatedLabel && <> · Updated {updatedLabel}</>}
          <> · {post.meta.readingMinutes} min read</>
        </p>
        <h1 className="mt-2 font-display text-4xl font-extrabold sm:text-5xl">
          {accentedTitle(post.meta.title)}
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted">
          {post.meta.excerpt}
        </p>
        {post.meta.tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {post.meta.tags.map((t) => (
              <Link
                key={t}
                href={routes.blogTag(tagSlug(t))}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web"
              >
                <Tag>{t}</Tag>
              </Link>
            ))}
          </div>
        )}
        <div className="blog-prose mt-10">{content}</div>
        <PostFooter related={getRelatedPosts(slug)} />
        <PostNav {...getAdjacentPosts(slug)} />
      </div>
    </Container>
  );
}
