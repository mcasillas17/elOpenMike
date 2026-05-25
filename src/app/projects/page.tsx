import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { projects } from "@/data/projects";

export const metadata: Metadata = {
  title: "Projects",
  description: "Things I've built — personal projects and open-source work.",
};

export default function ProjectsPage() {
  return (
    <Container className="py-20">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-web-strong">
        Work
      </p>
      <h1 className="mt-2 font-display text-4xl font-extrabold sm:text-5xl">
        Projects
      </h1>
      <p className="mt-3 max-w-xl text-muted">
        A few things I&rsquo;ve designed and built.
      </p>
      <div className="mt-10 flex flex-col gap-6">
        {projects.map((p) => (
          <ProjectCard key={p.slug} project={p} />
        ))}
      </div>
    </Container>
  );
}
