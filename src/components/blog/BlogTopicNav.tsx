import Link from "next/link";
import { getAllTags } from "@/lib/blog";
import { routes } from "@/lib/site";

export function BlogTopicNav({
  currentSlug,
  totalPosts,
}: {
  currentSlug?: string;
  totalPosts: number;
}) {
  const tags = getAllTags();
  const linkClass =
    "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web";

  return (
    <nav aria-label="Blog topics" className="mt-8">
      <ul className="flex flex-wrap gap-2">
        <li>
          <Link
            href={routes.blog}
            aria-label={`All posts (${totalPosts})`}
            aria-current={currentSlug === undefined ? "page" : undefined}
            className={`${linkClass} ${
              currentSlug === undefined
                ? "border-web bg-web/10 text-ink"
                : "border-edge text-muted hover:border-web hover:text-ink"
            }`}
          >
            <span>All</span>
            <span className="text-xs text-muted">{totalPosts}</span>
          </Link>
        </li>
        {tags.map((tag) => {
          const selected = tag.slug === currentSlug;
          return (
            <li key={tag.slug}>
              <Link
                href={routes.blogTag(tag.slug)}
                aria-label={`${tag.name} (${tag.count})`}
                aria-current={selected ? "page" : undefined}
                className={`${linkClass} ${
                  selected
                    ? "border-web bg-web/10 text-ink"
                    : "border-edge text-muted hover:border-web hover:text-ink"
                }`}
              >
                <span>{tag.name}</span>
                <span className="text-xs text-muted">{tag.count}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
