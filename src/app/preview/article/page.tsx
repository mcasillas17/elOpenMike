import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { ArticleReader } from "@/components/blog/ArticleReader";
import { compileArticle } from "@/lib/article";
import { articleSpecimen, specimenImagePath } from "@/lib/article-specimen";
import { blocksToMarkdown } from "@/lib/notion/blocks-to-md";
import { routes } from "@/lib/site";

export const metadata: Metadata = {
  title: "Article layout specimen",
  robots: { index: false, follow: false },
};

export default async function PreviewPage() {
  if (process.env.ARTICLE_PREVIEW !== "1") notFound();
  const source = blocksToMarkdown(articleSpecimen, {
    imagePath: specimenImagePath,
    onWarning: (message) => { throw new Error(`Article specimen: ${message}`); },
  });
  const { content, headings } = await compileArticle(source);

  return (
    <Container className="py-12 sm:py-16">
      <Link href={routes.blog} className="text-link text-sm">&larr; Back to writing</Link>
      <article>
        <header className="mb-12 mt-8 max-w-3xl">
          <p className="mb-5 inline-block border border-edge px-3 py-2 text-sm text-muted">
            Layout specimen &middot; not a published post
          </p>
          <h1 className="font-display text-4xl font-extrabold leading-tight sm:text-5xl">
            From a Notion page to a <span className="text-spidey">better read.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted">
            One editor. A complete editorial toolkit. This example runs native
            Notion-shaped blocks through the actual sync converter and article renderer.
          </p>
        </header>
        <ArticleReader headings={headings}>{content}</ArticleReader>
        <footer className="mt-14 max-w-3xl border-t border-edge pt-7 text-sm leading-relaxed text-muted">
          This specimen is excluded from the blog, RSS feed, and sitemap.
          Your existing posts and Notion workspace are unchanged.
        </footer>
      </article>
    </Container>
  );
}
