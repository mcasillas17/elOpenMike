import { renderOgImage, ogSize, ogContentType } from "@/lib/og";
import { getPost, getPostSlugs } from "@/lib/blog";
import { notFound } from "next/navigation";

export const alt = "elOpenMike blog post";
export const size = ogSize;
export const contentType = ogContentType;
export const dynamicParams = false;

export function generateStaticParams() {
  return getPostSlugs().map((slug) => ({ slug }));
}

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();
  return renderOgImage({ title: post.meta.title, caption: post.meta.excerpt, label: "Article" });
}
