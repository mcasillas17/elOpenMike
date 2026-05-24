# elOpenMike — Plan 2: Projects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Projects showcase — a home preview (top 3), a `/projects` list, and `/projects/[slug]` detail pages — using concise typed data and the existing design system.

**Architecture:** Typed `projects.ts` data (mirrors `experience.ts`) drives a reusable hybrid horizontal `ProjectCard` (image-left/details-right, whole-card-clickable via the stretched-link pattern). A home `Projects` section shows the first 3; `/projects` lists all; `/projects/[slug]` is an async server component with `generateStaticParams`/`generateMetadata`/`notFound`. New primitives: `Tag` and inline `icons`.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, next/image, next/link, Vitest + RTL. Package manager: **pnpm**.

**Spec:** `docs/superpowers/specs/2026-05-23-elopenmike-projects-design.md`

**Conventions:**
- Run all commands from the worktree root (absolute paths; the shell does not persist `cd`). Single test file: `pnpm exec vitest run <path>`; all tests: `pnpm test`; build: `pnpm run build`.
- Reuse the design system: `Section`, `Container`, `Button`/`LinkButton` (`@/components/ui/Button`), `WebCorner`. Tokens: `bg-canvas`, `bg-surface`, `border-edge`, `text-spidey`, `text-web`, `text-muted`, `text-ink`, `bg-spidey-dark`, `font-display`, `font-body`. NEVER use the arbitrary `font-[family-name:...]` syntax — use `font-display`/`font-body`.
- `Button` is polymorphic: `<Button href=... target="_blank">` renders an `<a>` and auto-adds `rel="noopener noreferrer"` for `target="_blank"`; `<LinkButton href="/route">` uses next/link.
- Commits: Conventional Commits ending with:
  ```
  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  ```

---

## File Structure

```
src/
  data/
    projects.ts                      # CREATE: Project type, projects[], getProject, getAllSlugs
    __tests__/projects.test.ts       # CREATE
  components/
    ui/
      Tag.tsx                        # CREATE: chip primitive
      icons.tsx                      # CREATE: GitHubIcon, ExternalLinkIcon
      __tests__/Tag.test.tsx         # CREATE
      __tests__/icons.test.tsx       # CREATE
    projects/
      ProjectCard.tsx                # CREATE: hybrid horizontal card (stretched-link)
      __tests__/ProjectCard.test.tsx # CREATE
    sections/
      Projects.tsx                   # CREATE: home preview (first 3 + View all)
      __tests__/Projects.test.tsx    # CREATE
  app/
    page.tsx                         # MODIFY: add <Projects /> after <Experience />
    __tests__/page.test.tsx          # MODIFY: also assert Projects heading
    projects/
      page.tsx                       # CREATE: /projects list
      __tests__/page.test.tsx        # CREATE
      [slug]/
        page.tsx                     # CREATE: detail (async, generateStaticParams/Metadata/notFound)
        __tests__/page.test.tsx      # CREATE
  lib/
    site.ts                          # MODIFY: add Projects nav item
public/
  images/projects/.gitkeep          # CREATE
README.md                           # MODIFY: personalize note for projects
```

---

## Task 1: Tag primitive + icons

**Files:**
- Create: `src/components/ui/Tag.tsx`, `src/components/ui/icons.tsx`
- Test: `src/components/ui/__tests__/Tag.test.tsx`, `src/components/ui/__tests__/icons.test.tsx`

- [ ] **Step 1: Write the failing Tag test** — `src/components/ui/__tests__/Tag.test.tsx`
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Tag } from "@/components/ui/Tag";

describe("Tag", () => {
  it("renders its label", () => {
    render(<Tag>Open source</Tag>);
    expect(screen.getByText("Open source")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it — `pnpm exec vitest run src/components/ui/__tests__/Tag.test.tsx`** → FAIL (cannot resolve `@/components/ui/Tag`).

- [ ] **Step 3: Implement Tag** — `src/components/ui/Tag.tsx`
```tsx
import type { ReactNode } from "react";

// Small pill label used for project tags.
export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block rounded-full border border-edge px-2.5 py-0.5 text-xs text-muted">
      {children}
    </span>
  );
}
```

- [ ] **Step 4: Run the Tag test** → PASS (1).

- [ ] **Step 5: Write the failing icons test** — `src/components/ui/__tests__/icons.test.tsx`
```tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { GitHubIcon, ExternalLinkIcon } from "@/components/ui/icons";

describe("icons", () => {
  it("render as decorative (aria-hidden) svgs", () => {
    const { container, rerender } = render(<GitHubIcon />);
    let svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute("aria-hidden", "true");

    rerender(<ExternalLinkIcon />);
    svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });
});
```

- [ ] **Step 6: Run it** → FAIL (cannot resolve `@/components/ui/icons`).

- [ ] **Step 7: Implement icons** — `src/components/ui/icons.tsx`
```tsx
type IconProps = { className?: string };

export function GitHubIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="currentColor"
      className={className}
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

export function ExternalLinkIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
    </svg>
  );
}
```

- [ ] **Step 8: Run all tests** → `pnpm test` → all pass.

- [ ] **Step 9: Commit**
```bash
git add -A
git commit -m "feat: add Tag chip primitive and GitHub/external-link icons

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Projects data + helpers

**Files:**
- Create: `src/data/projects.ts`
- Test: `src/data/__tests__/projects.test.ts`

- [ ] **Step 1: Write the failing data test** — `src/data/__tests__/projects.test.ts`
```ts
import { describe, it, expect } from "vitest";
import { projects, getProject, getAllSlugs } from "@/data/projects";

describe("projects data", () => {
  it("has well-formed entries", () => {
    expect(projects.length).toBeGreaterThan(0);
    for (const p of projects) {
      expect(p.slug).toBeTruthy();
      expect(p.title).toBeTruthy();
      expect(p.summary).toBeTruthy();
      expect(p.year).toBeTruthy();
      expect(Array.isArray(p.tags)).toBe(true);
      expect(Array.isArray(p.stack)).toBe(true);
      expect(Array.isArray(p.highlights)).toBe(true);
      expect(Array.isArray(p.images)).toBe(true);
    }
  });

  it("has unique slugs", () => {
    const slugs = projects.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("getProject returns the matching project or undefined", () => {
    expect(getProject(projects[0].slug)?.slug).toBe(projects[0].slug);
    expect(getProject("definitely-not-a-slug")).toBeUndefined();
  });

  it("getAllSlugs covers every project", () => {
    expect(getAllSlugs().sort()).toEqual(projects.map((p) => p.slug).sort());
  });
});
```

- [ ] **Step 2: Run it** → FAIL (cannot resolve `@/data/projects`).

- [ ] **Step 3: Implement the data** — `src/data/projects.ts` (placeholder content the owner replaces)
```ts
export type Project = {
  slug: string; // URL segment + React key
  title: string;
  summary: string; // one-liner (card + detail)
  year: string; // e.g. "2025"
  tags: string[]; // chips
  stack: string[]; // tech list
  highlights: string[]; // "What it does" bullets (detail page)
  liveUrl?: string;
  repoUrl?: string;
  images: string[]; // /images/projects/...; images[0] is the primary
};

// Placeholder projects — replace slugs/titles/content and add real screenshots
// under public/images/projects/. Array order controls display order and which
// three appear in the home preview.
export const projects: Project[] = [
  {
    slug: "web-slinger-cli",
    title: "Web-Slinger CLI",
    summary:
      "A fast terminal tool that scaffolds and deploys side projects in one command.",
    year: "2025",
    tags: ["CLI", "DevTools", "Open source"],
    stack: ["TypeScript", "Node", "oclif"],
    highlights: [
      "One-command scaffold from opinionated templates.",
      "Auto-creates the repo and a first deploy.",
      "Plugin system so you can add your own templates.",
    ],
    repoUrl: "https://github.com/mcasillas17",
    images: [],
  },
  {
    slug: "turing-tracker",
    title: "Turing Tracker",
    summary:
      "A workout and dog-walk logger with streaks and charts. Named after a very good blue merle.",
    year: "2024",
    tags: ["Web app", "Full-stack"],
    stack: ["Next.js", "Postgres", "Chart.js"],
    highlights: [
      "Log workouts and walks; track streaks.",
      "Charts for weekly volume and consistency.",
    ],
    liveUrl: "https://example.com",
    repoUrl: "https://github.com/mcasillas17",
    images: [],
  },
  {
    slug: "another-project",
    title: "Another Project",
    summary:
      "Replace these placeholders with your real work — title, summary, tags, stack, links, and screenshots.",
    year: "2023",
    tags: ["Web"],
    stack: ["React"],
    highlights: ["Describe what it does in 2–4 short bullets."],
    images: [],
  },
];

export function getProject(slug: string): Project | undefined {
  return projects.find((p) => p.slug === slug);
}

export function getAllSlugs(): string[] {
  return projects.map((p) => p.slug);
}
```

- [ ] **Step 4: Run the data test** → PASS (4).

- [ ] **Step 5: Commit**
```bash
git add -A
git commit -m "feat: add typed projects data model and lookup helpers

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: ProjectCard (hybrid horizontal, stretched-link)

**Files:**
- Create: `src/components/projects/ProjectCard.tsx`
- Test: `src/components/projects/__tests__/ProjectCard.test.tsx`

- [ ] **Step 1: Write the failing test** — `src/components/projects/__tests__/ProjectCard.test.tsx`
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProjectCard } from "@/components/projects/ProjectCard";
import type { Project } from "@/data/projects";

const base: Project = {
  slug: "demo",
  title: "Demo Project",
  summary: "A short summary.",
  year: "2025",
  tags: ["CLI", "Open source"],
  stack: ["TypeScript", "Node"],
  highlights: ["does a thing"],
  images: [],
};

describe("ProjectCard", () => {
  it("links the title to the project detail page", () => {
    render(<ProjectCard project={base} />);
    expect(
      screen.getByRole("link", { name: "Demo Project" }),
    ).toHaveAttribute("href", "/projects/demo");
  });

  it("renders summary and tags", () => {
    render(<ProjectCard project={base} />);
    expect(screen.getByText("A short summary.")).toBeInTheDocument();
    expect(screen.getByText("CLI")).toBeInTheDocument();
    expect(screen.getByText("Open source")).toBeInTheDocument();
  });

  it("renders Live and Source links when urls are present", () => {
    render(
      <ProjectCard
        project={{
          ...base,
          liveUrl: "https://live.example.com",
          repoUrl: "https://github.com/x/y",
        }}
      />,
    );
    expect(screen.getByRole("link", { name: /live demo/i })).toHaveAttribute(
      "href",
      "https://live.example.com",
    );
    const source = screen.getByRole("link", { name: /source/i });
    expect(source).toHaveAttribute("href", "https://github.com/x/y");
    expect(source).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("omits Live/Source links when urls are absent", () => {
    render(<ProjectCard project={base} />);
    expect(screen.queryByRole("link", { name: /live demo/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /source/i })).toBeNull();
  });

  it("shows the gradient fallback (no img) when there is no image", () => {
    render(<ProjectCard project={base} />);
    expect(screen.queryByRole("img")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it** → FAIL (cannot resolve `@/components/projects/ProjectCard`).

- [ ] **Step 3: Implement ProjectCard** — `src/components/projects/ProjectCard.tsx`
```tsx
import Image from "next/image";
import Link from "next/link";
import type { Project } from "@/data/projects";
import { Tag } from "@/components/ui/Tag";
import { GitHubIcon, ExternalLinkIcon } from "@/components/ui/icons";

// Hybrid horizontal card: image-left / details-right (stacks on mobile).
// Whole card is clickable via the stretched-link pattern: the title link's
// ::after overlay covers the card; the Live/Source anchors sit above it
// (relative z-10) so they remain independently clickable. No nested <a>.
export function ProjectCard({ project }: { project: Project }) {
  const cover = project.images[0];
  return (
    <article className="relative grid overflow-hidden rounded-2xl border border-edge bg-surface transition-colors hover:border-web sm:grid-cols-[38%_1fr]">
      <div className="relative aspect-video sm:aspect-auto sm:h-full">
        {cover ? (
          <Image
            src={cover}
            alt={`${project.title} screenshot`}
            fill
            sizes="(max-width: 640px) 100vw, 38vw"
            className="object-cover"
          />
        ) : (
          <div
            aria-hidden="true"
            className="h-full w-full"
            style={{
              backgroundColor: "#11151f",
              backgroundImage:
                "radial-gradient(circle at 30% 30%, rgba(27,111,227,.35), transparent 60%), radial-gradient(circle at 75% 70%, rgba(230,36,41,.30), transparent 55%)",
            }}
          />
        )}
      </div>

      <div className="p-5 sm:p-6">
        <h3 className="font-display text-xl font-bold">
          <Link
            href={`/projects/${project.slug}`}
            className="after:absolute after:inset-0 after:content-[''] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web"
          >
            {project.title}
          </Link>
        </h3>
        <p className="mt-1.5 text-sm text-muted">{project.summary}</p>

        {project.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {project.tags.map((t) => (
              <Tag key={t}>{t}</Tag>
            ))}
          </div>
        )}

        {project.stack.length > 0 && (
          <p className="mt-3 text-xs text-web">{project.stack.join(" · ")}</p>
        )}

        {(project.liveUrl || project.repoUrl) && (
          <div className="relative z-10 mt-4 flex flex-wrap gap-2">
            {project.liveUrl && (
              <a
                href={project.liveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-spidey px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-spidey-dark"
              >
                <ExternalLinkIcon className="h-3.5 w-3.5" /> Live demo
              </a>
            )}
            {project.repoUrl && (
              <a
                href={project.repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-edge px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-web hover:text-web"
              >
                <GitHubIcon className="h-3.5 w-3.5" /> Source
              </a>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
```

- [ ] **Step 4: Run the ProjectCard test** → PASS (5).

- [ ] **Step 5: Run all tests + build** → `pnpm test && pnpm run build` → all green, EXIT 0.

- [ ] **Step 6: Commit**
```bash
git add -A
git commit -m "feat: add ProjectCard hybrid horizontal card with stretched link

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: /projects list page

**Files:**
- Create: `src/app/projects/page.tsx`
- Test: `src/app/projects/__tests__/page.test.tsx`

- [ ] **Step 1: Write the failing test** — `src/app/projects/__tests__/page.test.tsx`
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ProjectsPage from "@/app/projects/page";
import { projects } from "@/data/projects";

describe("/projects page", () => {
  it("renders the page heading and a card per project", () => {
    render(<ProjectsPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Projects" }),
    ).toBeInTheDocument();
    for (const p of projects) {
      expect(
        screen.getByRole("link", { name: p.title }),
      ).toHaveAttribute("href", `/projects/${p.slug}`);
    }
  });
});
```

- [ ] **Step 2: Run it** → FAIL (cannot resolve `@/app/projects/page`).

- [ ] **Step 3: Implement the list page** — `src/app/projects/page.tsx`
```tsx
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
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-web">
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
```

- [ ] **Step 4: Run the test** → PASS (1).

- [ ] **Step 5: Commit**
```bash
git add -A
git commit -m "feat: add /projects list page

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: /projects/[slug] detail page

App Router note: in Next 15/16, `params` is a **Promise** and must be awaited; the page component is `async`.

**Files:**
- Create: `src/app/projects/[slug]/page.tsx`
- Test: `src/app/projects/[slug]/__tests__/page.test.tsx`

- [ ] **Step 1: Write the failing test** — `src/app/projects/[slug]/__tests__/page.test.tsx`
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ProjectDetailPage, {
  generateStaticParams,
  generateMetadata,
} from "@/app/projects/[slug]/page";
import { getAllSlugs } from "@/data/projects";

describe("/projects/[slug] detail page", () => {
  it("generateStaticParams returns every slug", () => {
    expect(generateStaticParams()).toEqual(
      getAllSlugs().map((slug) => ({ slug })),
    );
  });

  it("renders a known project", async () => {
    const ui = await ProjectDetailPage({
      params: Promise.resolve({ slug: "web-slinger-cli" }),
    });
    render(ui);
    expect(
      screen.getByRole("heading", { level: 1, name: /Web-Slinger CLI/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /back to projects/i }),
    ).toHaveAttribute("href", "/projects");
  });

  it("sets metadata title to the project name", async () => {
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: "web-slinger-cli" }),
    });
    expect(meta.title).toBe("Web-Slinger CLI");
  });

  it("calls notFound for an unknown slug (throws)", async () => {
    await expect(
      ProjectDetailPage({ params: Promise.resolve({ slug: "nope" }) }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run it** → FAIL (cannot resolve `@/app/projects/[slug]/page`).

- [ ] **Step 3: Implement the detail page** — `src/app/projects/[slug]/page.tsx`
```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { Tag } from "@/components/ui/Tag";
import { getProject, getAllSlugs } from "@/data/projects";

export function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const project = getProject(slug);
  if (!project) return {};
  return { title: project.title, description: project.summary };
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const project = getProject(slug);
  if (!project) notFound();

  return (
    <Container className="py-16">
      <div className="mx-auto max-w-3xl">
        <Link href="/projects" className="text-sm text-muted hover:text-web">
          ← Back to projects
        </Link>

        <p className="mt-6 text-xs font-medium uppercase tracking-[0.2em] text-web">
          {project.year}
        </p>
        <h1 className="mt-2 font-display text-4xl font-extrabold sm:text-5xl">
          {project.title}
        </h1>
        <p className="mt-4 text-lg text-ink">{project.summary}</p>

        {project.tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {project.tags.map((t) => (
              <Tag key={t}>{t}</Tag>
            ))}
          </div>
        )}
        {project.stack.length > 0 && (
          <p className="mt-3 text-sm text-web">{project.stack.join(" · ")}</p>
        )}

        {(project.liveUrl || project.repoUrl) && (
          <div className="mt-6 flex flex-wrap gap-3">
            {project.liveUrl && (
              <Button href={project.liveUrl} target="_blank">
                Live demo
              </Button>
            )}
            {project.repoUrl && (
              <Button href={project.repoUrl} target="_blank" variant="secondary">
                View source
              </Button>
            )}
          </div>
        )}

        {project.images[0] && (
          <div className="relative mt-8 aspect-video overflow-hidden rounded-xl border border-edge">
            <Image
              src={project.images[0]}
              alt={`${project.title} screenshot`}
              fill
              sizes="(max-width: 768px) 100vw, 768px"
              className="object-cover"
            />
          </div>
        )}
        {project.images[1] && (
          <div className="relative mt-4 aspect-video overflow-hidden rounded-xl border border-edge">
            <Image
              src={project.images[1]}
              alt={`${project.title} screenshot 2`}
              fill
              sizes="(max-width: 768px) 100vw, 768px"
              className="object-cover"
            />
          </div>
        )}

        {project.highlights.length > 0 && (
          <>
            <h2 className="mt-10 font-display text-lg font-bold">
              What it does
            </h2>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-muted">
              {project.highlights.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Container>
  );
}
```

- [ ] **Step 4: Run the detail test** → PASS (4).

- [ ] **Step 5: Run all tests + build** → `pnpm test && pnpm run build` → all green, EXIT 0. The build route table should list `/projects` and `/projects/[slug]` (prerendered for each slug).

- [ ] **Step 6: Commit**
```bash
git add -A
git commit -m "feat: add /projects/[slug] detail page with static params and metadata

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Projects home preview + wire into home + nav

**Files:**
- Create: `src/components/sections/Projects.tsx`
- Test: `src/components/sections/__tests__/Projects.test.tsx`
- Modify: `src/app/page.tsx`, `src/app/__tests__/page.test.tsx`, `src/lib/site.ts`

- [ ] **Step 1: Write the failing Projects section test** — `src/components/sections/__tests__/Projects.test.tsx`
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Projects } from "@/components/sections/Projects";
import { projects } from "@/data/projects";

describe("Projects (home preview)", () => {
  it("renders the section heading and a 'View all' link to /projects", () => {
    render(<Projects />);
    expect(
      screen.getByRole("heading", { name: "Projects" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /view all projects/i }),
    ).toHaveAttribute("href", "/projects");
  });

  it("renders the first three projects", () => {
    render(<Projects />);
    for (const p of projects.slice(0, 3)) {
      expect(
        screen.getByRole("link", { name: p.title }),
      ).toHaveAttribute("href", `/projects/${p.slug}`);
    }
  });
});
```

- [ ] **Step 2: Run it** → FAIL (cannot resolve `@/components/sections/Projects`).

- [ ] **Step 3: Implement the section** — `src/components/sections/Projects.tsx`
```tsx
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
```

- [ ] **Step 4: Run the Projects section test** → PASS (2).

- [ ] **Step 5: Wire into the home page** — overwrite `src/app/page.tsx`
```tsx
import { Hero } from "@/components/sections/Hero";
import { Experience } from "@/components/sections/Experience";
import { Projects } from "@/components/sections/Projects";

export default function Home() {
  return (
    <>
      <Hero />
      <Experience />
      <Projects />
    </>
  );
}
```

- [ ] **Step 6: Update the home page test** — overwrite `src/app/__tests__/page.test.tsx`
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Home from "@/app/page";

describe("Home page", () => {
  it("renders hero name, experience and projects sections", () => {
    render(<Home />);
    expect(screen.getByText(/Casillas/)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Experience" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Projects" }),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Add the nav item** — in `src/lib/site.ts`, change the `nav` array to:
```ts
  nav: [
    { label: "Experience", href: "#experience" },
    { label: "Projects", href: "#projects" },
  ] as NavItem[],
```

- [ ] **Step 8: Run all tests + build** → `pnpm test && pnpm run build` → all green, EXIT 0.

- [ ] **Step 9: Commit**
```bash
git add -A
git commit -m "feat: add Projects home preview, wire into home page and nav

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Images dir, README, final verification

**Files:**
- Create: `public/images/projects/.gitkeep`
- Modify: `README.md`

- [ ] **Step 1: Create the projects image directory**
```bash
mkdir -p public/images/projects
touch public/images/projects/.gitkeep
```

- [ ] **Step 2: Update the "Content to personalize" section in `README.md`** — replace that section's list with:
```markdown
## Content to personalize

- `src/data/experience.ts` — your roles and accomplishments.
- `src/data/projects.ts` — your projects (slug, summary, tags, stack, links); add screenshots under `public/images/projects/` and reference them in each project's `images` array.
- `public/resume.pdf` — your real résumé (replace the placeholder).
- `src/lib/site.ts` — name, tagline, role, and social links (incl. the LinkedIn URL placeholder).
```
Leave the rest of the README unchanged.

- [ ] **Step 3: Final verification** → `pnpm test && pnpm run build`
Expected: all tests pass; build EXIT 0; route table includes `/`, `/projects`, `/projects/[slug]` (one prerendered entry per slug), and `/_not-found`.

- [ ] **Step 4: Commit**
```bash
git add -A
git commit -m "chore: add projects image dir and personalize notes

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Done criteria for Plan 2

- `pnpm run build` succeeds; `pnpm test` green.
- Home page shows a Projects preview (first 3 cards + "View all projects →") after Experience; header nav includes "Projects".
- `/projects` lists all projects as hybrid horizontal cards; each card is fully clickable to its detail page, with working independent Live/Source links.
- `/projects/[slug]` renders the concise detail layout; unknown slugs show the themed 404; each project is statically prerendered with a correct `<title>`.

## Manual verification (after implementation)

```bash
pnpm dev
```
At `http://localhost:3000`, confirm:
- [ ] Projects preview appears after Experience; "Projects" nav link smooth-scrolls and highlights.
- [ ] Cards show the gradient fallback (until you add screenshots); whole card click → detail page; Live/Source buttons open in a new tab independently.
- [ ] `/projects` lists all; `/projects/web-slinger-cli` renders detail; `/projects/bogus` shows the themed 404.
- [ ] Layout works at mobile width (image on top) and desktop (image left).
```
