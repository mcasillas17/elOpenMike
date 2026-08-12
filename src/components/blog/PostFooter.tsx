import Link from "next/link";
import type { PostMeta } from "@/lib/blog";
import { routes, site } from "@/lib/site";

export function PostFooter({ related }: { related: PostMeta[] }) {
  const email = site.socials.find((social) => social.label === "Email")?.href;

  return (
    <footer className="mt-16 border-t border-edge pt-10">
      {related.length > 0 && (
        <section aria-labelledby="related-posts-title">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-web-strong">
            More on these topics
          </p>
          <h2
            id="related-posts-title"
            className="mt-2 font-display text-2xl font-bold text-ink"
          >
            Keep reading
          </h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {related.map((post) => (
              <li key={post.slug}>
                <Link
                  href={routes.blogPost(post.slug)}
                  className="block rounded-xl border border-edge p-4 font-display font-bold text-ink transition-colors hover:border-web hover:text-web-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web"
                >
                  {post.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <aside className={`${related.length > 0 ? "mt-10" : ""} rounded-2xl border border-edge bg-surface/70 p-6`}>
        <p className="font-display text-lg font-bold text-ink">
          Written by {site.name}
        </p>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
          {site.headline}
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <a
            href={routes.feed}
            className="inline-flex min-h-11 items-center rounded-lg border border-edge px-4 text-sm font-medium text-ink hover:border-web hover:text-web-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web"
          >
            Follow via RSS
          </a>
          {email && (
            <a
              href={email}
              className="inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-medium text-muted hover:text-web-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web"
            >
              Send an email
            </a>
          )}
        </div>
      </aside>
    </footer>
  );
}
