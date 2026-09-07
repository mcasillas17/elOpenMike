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
import { ProjectPreview } from "@/components/projects/ProjectPreview";
import { ProjectNavigation } from "@/components/projects/ProjectNavigation";
import { ProjectWriting } from "@/components/projects/ProjectWriting";
import { getProject, getAllSlugs, projects } from "@/data/projects";
import { getTint } from "@/lib/projectVisuals";
import { routes, alternatesFor } from "@/lib/site";

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
  return {
    title: project.title,
    description: project.summary,
    alternates: alternatesFor(routes.projectDetail(slug)),
  };
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
  const usesPortraitMedia = project.mediaLayout === "portrait";

  return (
    <Container className="py-16">
      <div className="mx-auto max-w-4xl">
        <Link
          href={routes.projects}
          className="inline-flex min-h-11 items-center rounded px-1 text-sm text-muted hover:text-web-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web"
        >
          ← Back to The Casefile
        </Link>

        <div className={`mt-6 ${usesPortraitMedia ? "grid items-start gap-7 md:grid-cols-[1.2fr_0.8fr]" : ""}`}>
          <div>
            <ComicPanel tint={tint} className="border-[4px] p-5 sm:p-7">
              <IssueTag number={issueNumber} label={project.year} variant="red" rotate={-2} />
              <div className="relative z-10">
                <h1
                  className="mt-6 font-display text-4xl font-black leading-none sm:text-5xl"
                  style={{ textShadow: "var(--text-shadow-cover-title)" }}
                >
                  {accentedTitle(project.title)}
                </h1>
                <p className="mt-3 max-w-prose text-base text-ink">{project.summary}</p>
                {project.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {project.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-block rounded border border-white/20 bg-black/55 px-2 py-0.5 text-xs text-ink"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                {project.stack.length > 0 && (
                  <p className="mt-3 text-sm text-web-strong">{project.stack.join(" · ")}</p>
                )}
              </div>
            </ComicPanel>
            {(project.liveUrl || project.repoUrl) && (
              <div className="mt-6 flex flex-wrap gap-3">
                {project.liveUrl && (
                  <ComicButton href={project.liveUrl} target="_blank" variant="primary">
                    Live demo
                  </ComicButton>
                )}
                {project.repoUrl && (
                  <ComicButton href={project.repoUrl} target="_blank" variant="ghost">
                    View Source
                  </ComicButton>
                )}
              </div>
            )}
          </div>

          {project.youtubeId && (
            <div className="mt-8 border-[3px] border-panel-border shadow-panel-lg">
              <YouTubeEmbed youtubeId={project.youtubeId} title={`${project.title} — trailer`} />
            </div>
          )}
          {!project.youtubeId && project.images.length > 0 && (
            <figure
              className={`${
                usesPortraitMedia ? "mx-auto w-full max-w-sm" : "mt-8"
              }`}
            >
              <div className="overflow-hidden border-[3px] border-panel-border shadow-panel-lg">
                <Carousel
                  images={project.images}
                  altPrefix={`${project.title} screenshot`}
                  aspectClassName={usesPortraitMedia ? "aspect-[9/16]" : "aspect-video"}
                  imageFit={project.imageFit ?? (usesPortraitMedia ? "contain" : "cover")}
                />
              </div>
              {project.mediaCredit && (
                <figcaption className="mt-2 text-xs leading-relaxed text-muted">
                  <a href={project.mediaCredit.href} className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-web-strong">
                    {project.mediaCredit.label}
                  </a>
                </figcaption>
              )}
            </figure>
          )}
        </div>

        {!project.youtubeId && project.images.length === 0 && project.preview && (
          <div className="mt-7 h-56 overflow-hidden border border-edge bg-surface/50">
            <ProjectPreview project={project} />
          </div>
        )}

        {project.highlights.length > 0 && (
          <section className="mt-10" aria-labelledby="project-features">
            <h2 id="project-features">
              <span
                className="inline-block border-2 border-panel-border bg-white px-2.5 py-1 font-display text-sm font-black uppercase tracking-widest text-black"
                style={{ boxShadow: "var(--shadow-panel-accent)" }}
              >
                What it does
              </span>
            </h2>
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
          </section>
        )}

        {project.vision && (
          <section className="mt-10 border-t border-edge pt-8" aria-labelledby="project-vision">
            <h2 id="project-vision" className="font-display text-2xl font-black text-ink">
              Vision
            </h2>
            <p className="mt-4 max-w-prose text-lg leading-relaxed text-muted">{project.vision}</p>
          </section>
        )}
        <ProjectWriting projectSlug={slug} />
        <ProjectNavigation project={project} />
      </div>
    </Container>
  );
}
