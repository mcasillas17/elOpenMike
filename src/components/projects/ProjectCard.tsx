import Link from "next/link";
import type { Project } from "@/data/projects";
import { ComicPanel } from "@/components/ui/comic/ComicPanel";
import { IssueTag } from "@/components/ui/comic/IssueTag";
import { PowMark } from "@/components/ui/comic/PowMark";
import { getTint, getMark } from "@/lib/projectVisuals";
import { routes } from "@/lib/site";
import { ProjectPreview } from "./ProjectPreview";

export type ProjectCardVariant =
  | "large"
  | "tall"
  | "wide"
  | "small"
  | "feature"
  | "aux"
  | "uniform";

export type ProjectCardHeadingLevel = 2 | 3;

type Props = {
  project: Project;
  index: number;
  variant: ProjectCardVariant;
  issueNumber: string;
  headingLevel: ProjectCardHeadingLevel;
  className?: string;
};

const TITLE_SIZE: Record<ProjectCardVariant, string> = {
  large: "text-2xl sm:text-3xl",
  feature: "text-2xl sm:text-3xl",
  tall: "text-xl",
  wide: "text-xl",
  aux: "text-xl",
  uniform: "text-xl",
  small: "text-xl",
};

const ISSUE_VARIANT_BY_INDEX = ["red", "blue", "dark"] as const;
const ISSUE_ROTATE_BY_INDEX = [-3, 2, -1] as const;

export function ProjectCard({
  project,
  index,
  variant,
  issueNumber,
  headingLevel,
  className = "",
}: Props) {
  const tint = getTint(project, index);
  const mark = getMark(project, index);
  const issueVariant =
    ISSUE_VARIANT_BY_INDEX[index % ISSUE_VARIANT_BY_INDEX.length];
  const issueRotate =
    ISSUE_ROTATE_BY_INDEX[index % ISSUE_ROTATE_BY_INDEX.length];
  const isFeatured = variant === "large" || variant === "feature";
  const label = index === 0 && isFeatured ? "NEW" : undefined;
  const Heading = headingLevel === 2 ? "h2" : "h3";

  return (
    <ComicPanel tint={tint} className={`group flex h-full w-full flex-col ${className}`}>
      <IssueTag
        number={issueNumber}
        label={label}
        variant={issueVariant}
        rotate={issueRotate}
      />
      {mark && (
        <PowMark
          word={mark}
          color={index % 2 === 0 ? "spidey" : "web"}
          rotate={isFeatured ? 8 : -6}
        />
      )}
      <div className={`relative shrink-0 border-b border-edge bg-canvas/60 ${isFeatured ? "h-60 sm:h-64" : "h-44"}`}>
        <ProjectPreview project={project} />
      </div>
      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <Heading
          className={`font-display font-black leading-none ${TITLE_SIZE[variant]}`}
          style={{ textShadow: "var(--text-shadow-card-title)" }}
        >
          <Link
            href={routes.projectDetail(project.slug)}
            className="after:absolute after:inset-0 after:z-10 after:content-[''] group-hover:text-web-strong"
          >
            {project.title}
          </Link>
        </Heading>
        <p className="mt-3 text-sm leading-relaxed text-ink">
          {project.cardSummary ?? project.summary}
        </p>
        <p aria-hidden="true" className="mt-auto pt-5 text-sm font-semibold text-web-strong">
          Explore project <span className="inline-block transition-transform motion-safe:group-hover:translate-x-1">→</span>
        </p>
      </div>
    </ComicPanel>
  );
}
