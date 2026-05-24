import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { Tag } from "@/components/ui/Tag";
import { getProject, getAllSlugs } from "@/data/projects";

export function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const project = getProject(slug);
  if (!project) return {};
  return { title: project.title, description: project.summary };
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const project = getProject(slug);
  if (!project) notFound();

  return (
    <Container className="py-16">
      <div className="mx-auto max-w-3xl">
        <Link href="/projects" className="text-sm text-muted hover:text-web">
          ← Back to projects
        </Link>

        <p className="mt-6 text-xs font-medium uppercase tracking-[0.2em] text-web">
          {project.year}
        </p>
        <h1 className="mt-2 font-display text-4xl font-extrabold sm:text-5xl">
          {project.title}
        </h1>
        <p className="mt-4 text-lg text-ink">{project.summary}</p>

        {project.tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {project.tags.map((t) => (
              <Tag key={t}>{t}</Tag>
            ))}
          </div>
        )}
        {project.stack.length > 0 && (
          <p className="mt-3 text-sm text-web">{project.stack.join(" · ")}</p>
        )}

        {(project.liveUrl || project.repoUrl) && (
          <div className="mt-6 flex flex-wrap gap-3">
            {project.liveUrl && (
              <Button href={project.liveUrl} target="_blank">
                Live demo
              </Button>
            )}
            {project.repoUrl && (
              <Button href={project.repoUrl} target="_blank" variant="secondary">
                View source
              </Button>
            )}
          </div>
        )}

        {project.images[0] && (
          <div className="relative mt-8 aspect-video overflow-hidden rounded-xl border border-edge">
            <Image
              src={project.images[0]}
              alt={`${project.title} screenshot`}
              fill
              sizes="(max-width: 768px) 100vw, 768px"
              className="object-cover"
            />
          </div>
        )}
        {project.images[1] && (
          <div className="relative mt-4 aspect-video overflow-hidden rounded-xl border border-edge">
            <Image
              src={project.images[1]}
              alt={`${project.title} screenshot 2`}
              fill
              sizes="(max-width: 768px) 100vw, 768px"
              className="object-cover"
            />
          </div>
        )}

        {project.highlights.length > 0 && (
          <>
            <h2 className="mt-10 font-display text-lg font-bold">
              What it does
            </h2>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-muted">
              {project.highlights.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Container>
  );
}
