import Link from "next/link";
import { projectCategories, projects, type Project } from "@/data/projects";
import { routes } from "@/lib/site";

export function ProjectNavigation({ project }: { project: Project }) {
  const collection = projects.filter((item) => item.category === project.category);
  const index = collection.findIndex((item) => item.slug === project.slug);
  const category = projectCategories.find((item) => item.id === project.category);
  if (index < 0 || !category) throw new Error("Project navigation requires a catalog project.");
  const previous = collection[index - 1];
  const next = collection[index + 1];

  return (
    <nav aria-label="More projects" className="mt-14 border-t border-edge pt-7">
      <Link href={`${routes.projects}#${category.id}`} className="text-link text-sm">
        ← Back to {category.label}
      </Link>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {previous && (
          <Link href={routes.projectDetail(previous.slug)} className="project-navigation-link">
            <span className="text-sm text-muted">← Previous project</span>
            <span className="mt-2 font-display text-xl font-bold text-ink">{previous.title}</span>
          </Link>
        )}
        {next && (
          <Link href={routes.projectDetail(next.slug)} className={`project-navigation-link sm:text-right ${previous ? "" : "sm:col-start-2"}`}>
            <span className="text-sm text-muted">Next project →</span>
            <span className="mt-2 font-display text-xl font-bold text-ink">{next.title}</span>
          </Link>
        )}
      </div>
    </nav>
  );
}
