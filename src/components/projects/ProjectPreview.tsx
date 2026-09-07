import Image from "next/image";
import type { Project } from "@/data/projects";

export function ProjectPreview({ project }: { project: Project }) {
  const image = project.images[0];
  if (image) {
    const portrait = project.mediaLayout === "portrait";
    return (
      <div className={`relative h-full overflow-hidden ${portrait ? "pt-5" : ""}`}>
        <div className={portrait
          ? "relative mx-auto h-80 w-44 overflow-hidden rounded-t-2xl border-2 border-edge bg-canvas shadow-panel-lg"
          : "relative h-full"}>
          <Image
            src={image}
            alt={`${project.title} interface preview`}
            fill
            sizes={portrait ? "176px" : "(max-width: 640px) 100vw, 480px"}
            className="object-cover object-top"
          />
        </div>
      </div>
    );
  }

  if (project.preview?.kind === "quote") {
    return (
      <div className="flex h-full flex-col justify-center px-7 py-8">
        <blockquote className="max-w-xs font-display text-3xl font-extrabold leading-tight text-ink">
          &ldquo;{project.preview.quote}&rdquo;
        </blockquote>
        <p className="mt-3 text-sm text-muted">{project.preview.caption}</p>
      </div>
    );
  }

  if (project.preview?.kind === "flow") {
    return (
      <div role="img" aria-label={project.preview.label} className="flex h-full flex-col justify-center gap-5 px-5 py-8">
        <p className="text-sm font-medium text-muted">{project.preview.label}</p>
        <div className="flex items-stretch">
          {project.preview.steps.map((step, index) => (
            <div key={step} className="flex min-w-0 flex-1 items-center">
              {index > 0 && <span aria-hidden="true" className="px-1 text-web-strong">→</span>}
              <span className="flex min-h-16 min-w-0 flex-1 items-center justify-center border border-web/60 bg-canvas/80 px-2 py-3 text-center font-display text-xs font-bold text-ink sm:text-sm">
                {step}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full items-center px-6 py-8">
      <p className="font-display text-xl font-bold leading-relaxed text-ink">
        {project.stack.join(" / ")}
      </p>
    </div>
  );
}
