import { renderOgImage, ogSize, ogContentType } from "@/lib/og";
import { getAllSlugs, getProject } from "@/data/projects";
import { notFound } from "next/navigation";

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
  const project = getProject(slug);
  if (!project) notFound();
  return renderOgImage({ title: project.title, caption: project.summary, label: "Project" });
}
