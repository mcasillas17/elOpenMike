import Link from "next/link";
import type { PostMeta } from "@/lib/blog";
import { tagSlug } from "@/lib/blog";
import { Tag } from "@/components/ui/Tag";
import { routes } from "@/lib/site";

export function PostCard({
  post,
  headingLevel = 2,
}: {
  post: PostMeta;
  headingLevel?: 2 | 3;
}) {
  const Heading: "h2" | "h3" = headingLevel === 3 ? "h3" : "h2";
  const dateLabel = new Date(post.date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC", // dates are date-only; render in UTC so they don't shift a day
  });
  return (
    <article className="relative border-t border-edge py-6 first:border-t-0 first:pt-0 motion-safe:transition-transform motion-safe:hover:-translate-y-0.5">
      <p className="text-xs text-muted">
        {dateLabel} · {post.readingMinutes} min read
      </p>
      <Heading className="mt-1 font-display text-xl font-bold text-ink">
        <Link
          href={routes.blogPost(post.slug)}
          className="after:absolute after:inset-0 after:content-[''] hover:text-web-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web"
        >
          {post.title}
        </Link>
      </Heading>
      <p className="mt-1.5 text-sm text-muted">{post.excerpt}</p>
      {post.tags.length > 0 && (
        <div className="relative z-10 mt-3 flex flex-wrap gap-1.5">
          {post.tags.map((t) => (
            <Link
              key={t}
              href={routes.blogTag(tagSlug(t))}
              className="rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web"
            >
              <Tag>{t}</Tag>
            </Link>
          ))}
        </div>
      )}
    </article>
  );
}
