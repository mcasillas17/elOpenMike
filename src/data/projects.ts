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
  youtubeId?: string; // optional trailer/demo embedded on the detail page
  images: string[]; // /images/projects/...; carousel on the detail page only
};

// Real projects (pulled from github.com/mcasillas17). Array order controls
// display order: the first four appear in the home Projects section as a
// hybrid comic-panel grid (large + tall + wide + small); the first two also
// headline the /projects featured row. Listing surfaces don't render
// screenshots — `images` shows up on the detail page carousel only.
export const projects: Project[] = [
  {
    slug: "turingagent",
    title: "TuringAgent",
    summary:
      "A local-first AI orchestration platform — a Flutter client and Go gRPC backend that run a private assistant stack with model routing, streaming, MCP tools, and approval-gated actions.",
    year: "2026",
    tags: ["AI", "Full-stack", "Open source"],
    stack: ["Go", "gRPC", "Flutter", "Ollama", "MCP", "Docker"],
    highlights: [
      "Go gRPC orchestrator for sessions, messages, runs, events, and approvals.",
      "Connects to local or OpenAI-compatible models (Ollama by default).",
      "MCP tool servers for safe system tools and approval-gated sandboxed file access.",
      "Flutter client with chat, streamed responses, and approval cards.",
    ],
    repoUrl: "https://github.com/mcasillas17/TuringAgent",
    images: [],
  },
  {
    slug: "turingcare",
    title: "TuringCare",
    summary:
      "A humane, force-free dog-training support platform — owners keep a structured behavior journal, find science-based trainers, and export a shareable “Behavior Brief” PDF.",
    year: "2026",
    tags: ["Web app", "Full-stack"],
    stack: ["TypeScript", "Next.js", "Node", "PostgreSQL", "Drizzle"],
    highlights: [
      "Structured behavior journal for puppy and newly-adopted-dog owners.",
      "Exportable “Behavior Brief” PDF to share with a trainer.",
      "Directory to find science-based, force-free trainers.",
    ],
    repoUrl: "https://github.com/mcasillas17/TuringCare",
    images: [],
  },
  {
    slug: "light-master",
    title: "Light Master",
    summary:
      "A Unity platformer where enemy behavior is evolved with genetic programming over behavior trees.",
    year: "2019",
    tags: ["Game", "AI", "Unity"],
    stack: ["Unity", "C#", "HLSL"],
    highlights: [
      "Side-scrolling platformer built in Unity (C#).",
      "Enemy behavior trees are evolved using genetic programming.",
    ],
    repoUrl: "https://github.com/mcasillas17/Light_Master",
    youtubeId: "0RjQiMqRIoE",
    images: [
      "/images/projects/light-master-1.jpg",
      "/images/projects/light-master-2.jpg",
      "/images/projects/light-master-3.jpg",
      "/images/projects/light-master-4.jpg",
    ],
  },
];

export function getProject(slug: string): Project | undefined {
  return projects.find((p) => p.slug === slug);
}

export function getAllSlugs(): string[] {
  return projects.map((p) => p.slug);
}
