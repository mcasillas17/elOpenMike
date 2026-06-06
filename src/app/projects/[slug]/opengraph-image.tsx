import { renderOgImage, ogSize, ogContentType } from "@/lib/og";
import { getAllSlugs, getProject } from "@/data/projects";

export const alt = "elOpenMike project";
export const size = ogSize;
export const contentType = ogContentType;
export const dynamicParams = false;

export function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const title = getProject(slug)?.title;
  return renderOgImage({ title, caption: "elOpenMike — projects" });
}
