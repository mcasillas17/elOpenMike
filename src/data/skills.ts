export type SkillGroup = { label: string; items: string[] };

// Grouped skills for the home Skills section. Edit freely to match how you'd
// like recruiters to read your range.
export const skills: SkillGroup[] = [
  {
    label: "Languages",
    items: ["C#", "TypeScript", "Go", "C++", "JavaScript", "SQL"],
  },
  {
    label: "Backend & APIs",
    items: [".NET", "Node.js", "gRPC", "REST APIs", "Distributed systems", "Microservices"],
  },
  {
    label: "AI & agents",
    items: ["LLM & agent tooling", "MCP", "Ollama", "Model routing"],
  },
  {
    label: "Cloud & infra",
    items: ["Azure", "Docker", "CI/CD", "Fly.io"],
  },
  {
    label: "Data & observability",
    items: ["PostgreSQL", "Drizzle ORM", "Telemetry", "Observability"],
  },
  {
    label: "Frontend",
    items: ["React", "Next.js", "Tailwind CSS", "Flutter"],
  },
];
