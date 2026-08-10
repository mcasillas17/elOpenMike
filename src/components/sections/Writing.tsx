import { Section } from "@/components/ui/Section";
import { LinkButton } from "@/components/ui/Button";
import { PostCard } from "@/components/blog/PostCard";
import { getAllPosts } from "@/lib/blog";
import { routes } from "@/lib/site";

const HOMEPAGE_POST_COUNT = 3;

export function Writing() {
  const posts = getAllPosts().slice(0, HOMEPAGE_POST_COUNT);
  if (posts.length === 0) return null;

  return (
    <Section id="writing" eyebrow="Writing" title="Latest posts">
      <div className="flex flex-col">
        {posts.map((post) => (
          <PostCard key={post.slug} post={post} />
        ))}
      </div>
      <div className="mt-8">
        <LinkButton href={routes.blog} variant="secondary">
          Read all posts →
        </LinkButton>
      </div>
    </Section>
  );
}
