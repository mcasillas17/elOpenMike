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
