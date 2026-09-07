import { notFound } from "next/navigation";
import { getAllTags } from "@/lib/blog";
import { renderOgImage, ogSize, ogContentType } from "@/lib/og";

export const alt = "elOpenMike writing by topic";
export const size = ogSize;
export const contentType = ogContentType;
export const dynamicParams = false;

export function generateStaticParams() {
  return getAllTags().map((tag) => ({ slug: tag.slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tag = getAllTags().find((entry) => entry.slug === slug);
  if (!tag) notFound();
  return renderOgImage({
    title: tag.name,
    caption: `Notes and essays on ${tag.name}.`,
    label: "Topic",
  });
}
