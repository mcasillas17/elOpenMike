import Link from "next/link";
import type { Project } from "@/data/projects";
import { ComicPanel } from "@/components/ui/comic/ComicPanel";
import { IssueTag } from "@/components/ui/comic/IssueTag";
import { PowMark } from "@/components/ui/comic/PowMark";
import { getTint, getMark } from "@/lib/projectVisuals";
import { routes } from "@/lib/site";

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
  tall: "text-lg",
  wide: "text-lg",
  aux: "text-lg",
  uniform: "text-lg",
  small: "text-sm",
};

const SHOW_SUMMARY: Record<ProjectCardVariant, boolean> = {
  large: true,
  feature: true,
  tall: true,
  wide: true,
  aux: true,
  uniform: true,
  small: false,
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
    <ComicPanel tint={tint} className={`h-full w-full ${className}`}>
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
      <div className="absolute inset-x-4 bottom-3 z-10">
        <Heading
          className={`font-display font-black leading-none ${TITLE_SIZE[variant]}`}
          style={{ textShadow: "var(--text-shadow-card-title)" }}
        >
          <Link
            href={routes.projectDetail(project.slug)}
            className="after:absolute after:inset-0 after:content-['']"
          >
            {project.title}
          </Link>
        </Heading>
        {SHOW_SUMMARY[variant] && (
          <p
            className={`mt-1.5 max-w-[90%] ${
              isFeatured ? "text-sm text-ink" : "text-xs text-muted"
            }`}
          >
            {project.summary}
          </p>
        )}
      </div>
    </ComicPanel>
  );
}
