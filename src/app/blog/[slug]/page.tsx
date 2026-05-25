import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { compileMDX } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import rehypePrettyCode, {
  type Options as PrettyCodeOptions,
} from "rehype-pretty-code";
import { Container } from "@/components/ui/Container";
import { Tag } from "@/components/ui/Tag";
import { getPost, getPostSlugs } from "@/lib/blog";
import { mdxComponents } from "@/components/blog/mdx-components";

const prettyCodeOptions: PrettyCodeOptions = {
  theme: "github-dark",
  keepBackground: true,
};

export const dynamicParams = false;

export function generateStaticParams() {
  return getPostSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return {};
  return { title: post.meta.title, description: post.meta.excerpt };
}

function accentedTitle(title: string) {
  const parts = title.split(" ");
  if (parts.length < 2) return title;
  const last = parts[parts.length - 1];
  const rest = parts.slice(0, -1).join(" ");
  return (
    <>
      {rest} <span className="text-spidey">{last}</span>
    </>
  );
}

export default async function PostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  const { content } = await compileMDX({
    source: post.body,
    components: mdxComponents,
    options: {
      mdxOptions: {
        remarkPlugins: [remarkGfm],
        rehypePlugins: [[rehypePrettyCode, prettyCodeOptions]],
      },
    },
  });

  const dateLabel = new Date(post.meta.date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC", // dates are date-only; render in UTC so they don't shift a day
  });

  return (
    <Container className="py-16">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/blog"
          className="rounded text-sm text-muted hover:text-web focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web"
        >
          ← Back to blog
        </Link>
        <p className="mt-6 text-xs font-medium uppercase tracking-[0.2em] text-web">
          {dateLabel} · {post.meta.readingMinutes} min read
        </p>
        <h1 className="mt-2 font-display text-4xl font-extrabold sm:text-5xl">
          {accentedTitle(post.meta.title)}
        </h1>
        {post.meta.tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {post.meta.tags.map((t) => (
              <Tag key={t}>{t}</Tag>
            ))}
          </div>
        )}
        <div className="mt-8">{content}</div>
      </div>
    </Container>
  );
}
