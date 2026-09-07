import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { projects } from "@/data/projects";
import { routes, alternatesFor } from "@/lib/site";

// Metadata title stays "Projects" for searchability (per spec §1 out-of-scope).
// Visible h1 is "The Casefile."
export const metadata: Metadata = {
  title: "Projects",
  description: "Things I've built — personal projects and open-source work.",
  alternates: alternatesFor(routes.projects),
};

export default function ProjectsPage() {
  const total = projects.length;

  return (
    <Container className="py-20">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-web-strong">
        Work
      </p>
      <h1 className="mt-2 font-display text-4xl font-extrabold sm:text-5xl">
        The <span className="text-spidey">Casefile</span>
      </h1>
      <p className="mt-3 max-w-xl text-muted">
        A few things I&rsquo;ve designed and built &mdash; newest first.
      </p>

      <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2">
        {projects.map((project, index) => (
          <ProjectCard
            key={project.slug}
            project={project}
            index={index}
            variant={index < 2 ? "feature" : "uniform"}
            issueNumber={String(total - index).padStart(2, "0")}
            headingLevel={2}
          />
        ))}
      </div>
    </Container>
  );
}
