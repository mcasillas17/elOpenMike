import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { PostCard } from "@/components/blog/PostCard";
import { FeaturedPost } from "@/components/blog/FeaturedPost";
import { BlogTopicNav } from "@/components/blog/BlogTopicNav";
import { getAllPosts } from "@/lib/blog";
import { routes, alternatesFor } from "@/lib/site";

export const metadata: Metadata = {
  title: "Blog",
  description: "Notes on AI systems, distributed systems, and observability.",
  alternates: alternatesFor(routes.blog),
};

export default function BlogPage() {
  const posts = getAllPosts();
  return (
    <Container className="py-20">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-web-strong">
        Notes &amp; essays
      </p>
      <h1 className="mt-2 font-display text-4xl font-extrabold sm:text-5xl">
        Writing
      </h1>
      <p className="mt-3 max-w-xl text-muted">
        Notes on AI systems, distributed systems, observability — and the
        occasional bit about comedy.
      </p>
      <BlogTopicNav totalPosts={posts.length} />
      {posts.length === 0 ? (
        <p className="mt-10 text-muted">No posts yet.</p>
      ) : (
        <div className="mt-8">
          <FeaturedPost post={posts[0]} />
          <div className="mt-6 flex flex-col">
            {posts.slice(1).map((p) => (
              <PostCard key={p.slug} post={p} />
            ))}
          </div>
        </div>
      )}
    </Container>
  );
}
