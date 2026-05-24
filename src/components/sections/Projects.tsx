import { Section } from "@/components/ui/Section";
import { LinkButton } from "@/components/ui/Button";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { projects } from "@/data/projects";

export function Projects() {
  const featured = projects.slice(0, 3);
  return (
    <Section id="projects" eyebrow="Work" title="Projects">
      <div className="flex flex-col gap-6">
        {featured.map((p) => (
          <ProjectCard key={p.slug} project={p} />
        ))}
      </div>
      <div className="mt-8">
        <LinkButton href="/projects" variant="secondary">
          View all projects →
        </LinkButton>
      </div>
    </Section>
  );
}
