import Link from "next/link";
import type { PostMeta } from "@/lib/blog";
import { Tag } from "@/components/ui/Tag";

export function PostCard({ post }: { post: PostMeta }) {
  const dateLabel = new Date(post.date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC", // dates are date-only; render in UTC so they don't shift a day
  });
  return (
    <article className="relative border-t border-edge py-6 first:border-t-0 first:pt-0">
      <p className="text-xs text-muted">
        {dateLabel} · {post.readingMinutes} min read
      </p>
      <h2 className="mt-1 font-display text-xl font-bold text-ink">
        <Link
          href={`/blog/${post.slug}`}
          className="after:absolute after:inset-0 after:content-[''] hover:text-web-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web"
        >
          {post.title}
        </Link>
      </h2>
      <p className="mt-1.5 text-sm text-muted">{post.excerpt}</p>
      {post.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {post.tags.map((t) => (
            <Tag key={t}>{t}</Tag>
          ))}
        </div>
      )}
    </article>
  );
}
