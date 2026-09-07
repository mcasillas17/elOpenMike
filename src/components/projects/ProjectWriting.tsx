import { getPostsForProject } from "@/lib/blog";
import { PostCard } from "@/components/blog/PostCard";

export function ProjectWriting({ projectSlug }: { projectSlug: string }) {
  const posts = getPostsForProject(projectSlug);
  if (posts.length === 0) return null;

  return (
    <section aria-labelledby="project-writing" className="mt-10 border-t border-edge pt-8">
      <h2 id="project-writing" className="font-display text-2xl font-bold">
        {posts.length === 1 ? "The story behind this project" : "Stories behind this project"}
      </h2>
      <div className="mt-6">
        {posts.map((post) => <PostCard key={post.slug} post={post} headingLevel={3} />)}
      </div>
    </section>
  );
}
