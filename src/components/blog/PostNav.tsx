import Link from "next/link";
import type { PostMeta } from "@/lib/blog";
import { routes } from "@/lib/site";

// Posts are newest-first, so `prev` is the newer neighbour and `next` the older.
export function PostNav({ prev, next }: { prev?: PostMeta; next?: PostMeta }) {
  if (!prev && !next) return null;

  return (
    <nav
      aria-label="More posts"
      className="mt-16 grid gap-4 border-t border-edge pt-8 sm:grid-cols-2"
    >
      {prev && (
        <Link
          href={routes.blogPost(prev.slug)}
          className="rounded-xl border border-edge p-4 hover:border-web focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web"
        >
          <span className="text-xs uppercase tracking-[0.2em] text-muted">
            ← Newer post
          </span>
          <span className="mt-1 block font-display font-bold text-ink">
            {prev.title}
          </span>
        </Link>
      )}
      {next && (
        <Link
          href={routes.blogPost(next.slug)}
          className="rounded-xl border border-edge p-4 hover:border-web focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web sm:col-start-2 sm:text-right"
        >
          <span className="text-xs uppercase tracking-[0.2em] text-muted">
            Older post →
          </span>
          <span className="mt-1 block font-display font-bold text-ink">
            {next.title}
          </span>
        </Link>
      )}
    </nav>
  );
}
