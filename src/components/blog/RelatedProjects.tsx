import Link from "next/link";
import { getProject } from "@/data/projects";
import { routes } from "@/lib/site";

export function RelatedProjects({ projectSlugs }: { projectSlugs: readonly string[] }) {
  if (projectSlugs.length === 0) return null;
  const linkedProjects = projectSlugs.map((slug) => {
    const project = getProject(slug);
    if (!project) throw new Error("Related projects require valid public project references.");
    return project;
  });

  return (
    <nav aria-label="Projects in this article" className="mt-10 border-t border-edge pt-6">
      <p className="font-display text-base font-semibold">Projects in this article</p>
      <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
        {linkedProjects.map((project) => (
          <li key={project.slug}>
            <Link href={routes.projectDetail(project.slug)} className="text-link text-sm">
              {project.title} <span aria-hidden="true" className="ml-1">→</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
