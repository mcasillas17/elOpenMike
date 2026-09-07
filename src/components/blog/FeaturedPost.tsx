import Link from "next/link";
import type { PostMeta } from "@/lib/blog";
import { tagSlug } from "@/lib/blog";
import { routes } from "@/lib/site";
import { Tag } from "@/components/ui/Tag";

export function FeaturedPost({ post }: { post: PostMeta }) {
  const dateLabel = new Date(post.date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  return (
    <article className="relative border-y border-edge bg-surface/40 p-6 sm:p-8">
      <p className="relative text-xs font-semibold uppercase tracking-[0.2em] text-web-strong">
        Latest
      </p>
      <h2 className="mt-3 max-w-3xl font-display text-2xl font-extrabold leading-tight text-ink sm:text-3xl">
        <Link
          href={routes.blogPost(post.slug)}
          className="after:absolute after:inset-0 after:content-[''] hover:text-web-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-web"
        >
          {post.title}
        </Link>
      </h2>
      <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">
        {post.excerpt}
      </p>
      <p className="mt-5 text-sm text-muted">
        {dateLabel} · {post.readingMinutes} min read
      </p>
      {post.tags.length > 0 && (
        <div className="relative z-10 mt-3 flex flex-wrap gap-1.5">
          {post.tags.map((tag) => (
            <Link
              key={tag}
              href={routes.blogTag(tagSlug(tag))}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web"
            >
              <Tag>{tag}</Tag>
            </Link>
          ))}
        </div>
      )}
    </article>
  );
}
