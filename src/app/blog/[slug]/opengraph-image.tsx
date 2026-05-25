import { renderOgImage, ogSize, ogContentType } from "@/lib/og";
import { getAllPosts, getPostSlugs } from "@/lib/blog";

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
  const title = getAllPosts().find((p) => p.slug === slug)?.title;
  return renderOgImage(title);
}
