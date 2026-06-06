import { Section } from "@/components/ui/Section";
import { ComicLinkButton } from "@/components/ui/comic/ComicButton";
import {
  ProjectCard,
  type ProjectCardVariant,
} from "@/components/projects/ProjectCard";
import { projects } from "@/data/projects";
import { routes } from "@/lib/site";

// Hybrid 6-column grid: large + tall side-by-side on top, wide + small on
// bottom. Collapses to single column below md.
const HOME_VARIANTS: readonly ProjectCardVariant[] = [
  "large",
  "tall",
  "wide",
  "small",
];

const CELL_CLASS: readonly string[] = [
  "md:col-span-4 md:row-span-2 min-h-[200px]",
  "md:col-span-2 md:row-span-2 min-h-[160px]",
  "md:col-span-4 md:row-span-1 min-h-[140px]",
  "md:col-span-2 md:row-span-1 min-h-[140px]",
];

export function Projects() {
  const featured = projects.slice(0, 4);
  const total = projects.length;

  return (
    <Section id="projects" eyebrow="Work" title="Selected Projects">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-6 md:grid-rows-[140px_140px_140px] md:gap-2">
        {featured.map((p, i) => (
          <div key={p.slug} className={CELL_CLASS[i]}>
            <ProjectCard
              project={p}
              index={i}
              variant={HOME_VARIANTS[i] ?? "small"}
              issueNumber={String(total - i).padStart(2, "0")}
            />
          </div>
        ))}
      </div>
      <div className="mt-8">
        <ComicLinkButton href={routes.projects} variant="primary">
          View All Issues →
        </ComicLinkButton>
      </div>
    </Section>
  );
}
