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
  const feature = projects[0];
  const aux = projects[1];
  const rest = projects.slice(2);

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

      {(feature || aux) && (
        <div className="mt-10 grid grid-cols-1 gap-3 md:grid-cols-3 md:grid-rows-[220px] md:gap-2">
          {feature && (
            <div className="md:col-span-2 min-h-[200px] md:min-h-0">
              <ProjectCard
                project={feature}
                index={0}
                variant="feature"
                issueNumber={String(total).padStart(2, "0")}
              />
            </div>
          )}
          {aux && (
            <div className="md:col-span-1 min-h-[160px] md:min-h-0">
              <ProjectCard
                project={aux}
                index={1}
                variant="aux"
                issueNumber={String(total - 1).padStart(2, "0")}
              />
            </div>
          )}
        </div>
      )}

      {rest.length > 0 && (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 md:gap-2">
          {rest.map((p, idx) => {
            const i = idx + 2;
            return (
              <div key={p.slug} className="aspect-[4/3]">
                <ProjectCard
                  project={p}
                  index={i}
                  variant="uniform"
                  issueNumber={String(total - i).padStart(2, "0")}
                />
              </div>
            );
          })}
        </div>
      )}
    </Container>
  );
}
