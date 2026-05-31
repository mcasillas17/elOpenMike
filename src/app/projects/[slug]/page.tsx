import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { ComicPanel } from "@/components/ui/comic/ComicPanel";
import { IssueTag } from "@/components/ui/comic/IssueTag";
import {
  ComicButton,
} from "@/components/ui/comic/ComicButton";
import { Carousel } from "@/components/ui/Carousel";
import { YouTubeEmbed } from "@/components/comedy/YouTubeEmbed";
import { getProject, getAllSlugs, projects } from "@/data/projects";
import { getTint } from "@/lib/projectVisuals";

function accentedTitle(title: string): ReactNode {
  const parts = title.split(" ");
  if (parts.length < 2) return title;
  const last = parts[parts.length - 1];
  const rest = parts.slice(0, -1).join(" ");
  return (
    <>
      {rest} <span className="text-spidey-strong">{last}</span>
    </>
  );
}

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

  const index = projects.findIndex((p) => p.slug === slug);
  const issueNumber = String(projects.length - index).padStart(2, "0");
  const tint = getTint(project, index);

  return (
    <Container className="py-16">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/projects"
          className="rounded text-sm text-muted hover:text-web-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web"
        >
          ← Back to The Casefile
        </Link>

        {/* Cover panel */}
        <ComicPanel tint={tint} className="mt-6 border-[4px] p-7 sm:p-8">
          <IssueTag
            number={issueNumber}
            label={project.year}
            variant="red"
            rotate={-2}
          />
          <div className="relative z-10">
            <h1
              className="mt-6 font-display text-4xl font-black leading-none sm:text-5xl"
              style={{ textShadow: "0 2px 12px rgba(0,0,0,0.7)" }}
            >
              {accentedTitle(project.title)}
            </h1>
            <p className="mt-3 max-w-prose text-base text-ink">
              {project.summary}
            </p>
            {project.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {project.tags.map((t) => (
                  <span
                    key={t}
                    className="inline-block rounded border border-white/20 bg-black/55 px-2 py-0.5 text-xs text-ink"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
            {project.stack.length > 0 && (
              <p className="mt-3 text-sm text-web-strong">
                {project.stack.join(" · ")}
              </p>
            )}
          </div>
        </ComicPanel>

        {(project.liveUrl || project.repoUrl) && (
          <div className="mt-6 flex flex-wrap gap-3">
            {project.liveUrl && (
              <ComicButton
                href={project.liveUrl}
                target="_blank"
                variant="primary"
              >
                Live demo
              </ComicButton>
            )}
            {project.repoUrl && (
              <ComicButton
                href={project.repoUrl}
                target="_blank"
                variant="ghost"
              >
                View Source
              </ComicButton>
            )}
          </div>
        )}

        {project.youtubeId && (
          <div className="mt-8 border-[3px] border-panel-border" style={{ boxShadow: "4px 4px 0 var(--color-panel-shadow)" }}>
            <YouTubeEmbed
              youtubeId={project.youtubeId}
              title={`${project.title} — trailer`}
            />
          </div>
        )}

        {!project.youtubeId && project.images.length > 0 && (
          <div className="mt-8 border-[3px] border-panel-border overflow-hidden" style={{ boxShadow: "4px 4px 0 var(--color-panel-shadow)" }}>
            <Carousel
              images={project.images}
              altPrefix={`${project.title} screenshot`}
              aspectClassName="aspect-video"
            />
          </div>
        )}

        {project.highlights.length > 0 && (
          <>
            <div className="mt-10">
              <span
                className="inline-block border-2 border-panel-border bg-white px-2.5 py-1 font-display text-sm font-black uppercase tracking-widest text-black"
                style={{ boxShadow: "2px 2px 0 var(--color-web)" }}
              >
                What it does
              </span>
            </div>
            <div className="mt-5 flex flex-col gap-3">
              {project.highlights.map((h, i) => (
                <ComicPanel key={h} tint="blue" className="px-5 py-4 pl-16">
                  <span
                    aria-hidden="true"
                    className="absolute left-3.5 top-3 font-display text-3xl font-black leading-none text-spidey"
                    style={{ fontFamily: "ui-monospace, SFMono-Regular, monospace" }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <p className="relative z-10 text-base text-ink">{h}</p>
                </ComicPanel>
              ))}
            </div>
          </>
        )}
      </div>
    </Container>
  );
}
