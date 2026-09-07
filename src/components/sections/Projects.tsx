import { Section } from "@/components/ui/Section";
import { ComicLinkButton } from "@/components/ui/comic/ComicButton";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { projects, featuredProjects } from "@/data/projects";
import { routes } from "@/lib/site";

export function Projects() {
  return (
    <Section id="projects" eyebrow="Work" title="Selected Projects">
      <p className="mb-7 max-w-xl leading-relaxed text-muted">
        From private AI systems to tools for a more intentional day.
        A few things I&apos;ve designed and built.
      </p>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {featuredProjects.map((project, position) => {
          const index = projects.indexOf(project);
          return (
            <ProjectCard
              key={project.slug}
              project={project}
              index={index}
              variant={position < 2 ? "feature" : "uniform"}
              issueNumber={String(projects.length - index).padStart(2, "0")}
              headingLevel={3}
            />
          );
        })}
      </div>
      <div className="mt-8">
        <ComicLinkButton href={routes.projects} variant="primary">
          All projects →
        </ComicLinkButton>
      </div>
    </Section>
  );
}
