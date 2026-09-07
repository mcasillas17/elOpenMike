import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { projects, projectCategories } from "@/data/projects";
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
        Products, developer tools, and games I&rsquo;ve designed, built, and made my own.
      </p>

      <nav aria-label="Project categories" className="mt-6 flex flex-wrap gap-3">
        {projectCategories.map((category) => (
          <a
            key={category.id}
            href={`#${category.id}`}
            className="inline-flex min-h-11 items-center rounded border border-edge px-4 text-sm font-semibold text-web-strong hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web"
          >
            {category.label}
          </a>
        ))}
      </nav>

      {projectCategories.map((category) => (
        <section key={category.id} id={category.id} aria-labelledby={`${category.id}-heading`} className="mt-12 scroll-mt-24">
          <h2 id={`${category.id}-heading`} className="font-display text-2xl font-extrabold text-ink sm:text-3xl">
            {category.label}
          </h2>
          <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
            {projects.filter((project) => project.category === category.id).map((project) => {
              const index = projects.indexOf(project);
              return (
                <ProjectCard
                  key={project.slug}
                  project={project}
                  index={index}
                  variant="uniform"
                  issueNumber={String(total - index).padStart(2, "0")}
                  headingLevel={3}
                />
              );
            })}
          </div>
        </section>
      ))}
    </Container>
  );
}
