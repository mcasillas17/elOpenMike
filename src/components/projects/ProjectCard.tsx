import Image from "next/image";
import Link from "next/link";
import type { Project } from "@/data/projects";
import { Tag } from "@/components/ui/Tag";
import { GitHubIcon, ExternalLinkIcon } from "@/components/ui/icons";

// Hybrid horizontal card: image-left / details-right (stacks on mobile).
// Whole card is clickable via the stretched-link pattern: the title link's
// ::after overlay covers the card; the Live/Source anchors sit above it
// (relative z-10) so they remain independently clickable. No nested <a>.
export function ProjectCard({ project }: { project: Project }) {
  const cover = project.images[0];
  return (
    <article className="relative grid overflow-hidden rounded-2xl border border-edge bg-surface transition-colors hover:border-web focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-web sm:grid-cols-[38%_1fr]">
      <div className="relative aspect-video sm:aspect-auto sm:h-full">
        {cover ? (
          <Image
            src={cover}
            alt={`${project.title} screenshot`}
            fill
            sizes="(max-width: 640px) 100vw, 38vw"
            className="object-cover"
          />
        ) : (
          <div
            aria-hidden="true"
            className="h-full w-full"
            style={{
              backgroundColor: "#11151f",
              backgroundImage:
                "radial-gradient(circle at 30% 30%, rgba(27,111,227,.35), transparent 60%), radial-gradient(circle at 75% 70%, rgba(230,36,41,.30), transparent 55%)",
            }}
          />
        )}
      </div>

      <div className="p-5 sm:p-6">
        <h3 className="font-display text-xl font-bold">
          <Link
            href={`/projects/${project.slug}`}
            className="after:absolute after:inset-0 after:content-['']"
          >
            {project.title}
          </Link>
        </h3>
        <p className="mt-1.5 text-sm text-muted">{project.summary}</p>

        {project.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {project.tags.map((t) => (
              <Tag key={t}>{t}</Tag>
            ))}
          </div>
        )}

        {project.stack.length > 0 && (
          <p className="mt-3 text-xs text-web">{project.stack.join(" · ")}</p>
        )}

        {(project.liveUrl || project.repoUrl) && (
          <div className="relative z-10 mt-4 flex flex-wrap gap-2">
            {project.liveUrl && (
              <a
                href={project.liveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-spidey px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-spidey-dark"
              >
                <ExternalLinkIcon className="h-3.5 w-3.5" /> Live demo
              </a>
            )}
            {project.repoUrl && (
              <a
                href={project.repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-edge px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-web hover:text-web"
              >
                <GitHubIcon className="h-3.5 w-3.5" /> Source
              </a>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
