import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { PostCard } from "@/components/blog/PostCard";
import { BlogTopicNav } from "@/components/blog/BlogTopicNav";
import { getAllPosts, getAllTags, getPostsByTag } from "@/lib/blog";
import { routes, alternatesFor } from "@/lib/site";

export const dynamicParams = false;

export function generateStaticParams() {
  return getAllTags().map((tag) => ({ slug: tag.slug }));
}

function tagName(slug: string): string | undefined {
  return getAllTags().find((tag) => tag.slug === slug)?.name;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const name = tagName(slug);
  if (!name) return {};
  return {
    title: `${name} — Blog`,
    description: `Posts tagged ${name}.`,
    alternates: alternatesFor(routes.blogTag(slug)),
  };
}

export default async function TagPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const name = tagName(slug);
  if (!name) notFound();

  const posts = getPostsByTag(slug);

  return (
    <Container className="py-20">
      <Link
        href={routes.blog}
        className="rounded text-sm text-muted hover:text-web-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web"
      >
        ← All posts
      </Link>
      <p className="mt-6 text-xs font-medium uppercase tracking-[0.2em] text-web-strong">
        Tagged
      </p>
      <h1 className="mt-2 font-display text-4xl font-extrabold sm:text-5xl">
        {name}
      </h1>
      <p className="mt-3 text-muted">
        {posts.length} {posts.length === 1 ? "post" : "posts"}
      </p>
      <BlogTopicNav currentSlug={slug} totalPosts={getAllPosts().length} />
      <div className="mt-8 flex flex-col">
        {posts.map((post) => (
          <PostCard key={post.slug} post={post} />
        ))}
      </div>
    </Container>
  );
}
