export type Role = {
  company: string;
  title: string;
  start: string; // e.g. "2023"
  end: string; // e.g. "Present"
  location?: string;
  highlights: string[];
  stack?: string[];
};

// Grouped by title/level (two entries) rather than one card per team like the
// résumé. Highlights are a high-level overview of focus + strengths —
// intentionally no internal/proprietary project or system names.
export const experience: Role[] = [
  {
    company: "Microsoft",
    title: "Software Engineer II",
    start: "2024",
    end: "Present",
    location: "Redmond, WA",
    highlights: [
      "Backend services and APIs for large-scale email and push messaging, including AI/agent tooling that surfaces content and insights.",
      "Focus: AI-powered systems, distributed systems, data-grounded analytics, and observability — building services that stay fast, scalable, and understandable as they grow.",
    ],
    stack: ["C#", "TypeScript", "MCP", "Azure DevOps"],
  },
  {
    company: "Microsoft",
    title: "Software Engineer",
    start: "2018",
    end: "2024",
    location: "Redmond, WA",
    highlights: [
      "Shipped across cross-platform telemetry SDKs, Outlook calendar & scheduling, and campaign & platform tooling — from enterprise scheduling services and reusable APIs to large data migrations.",
      "Strengths: scalable service & API design across many data sources, end-to-end telemetry and observability, and large migrations delivered without disrupting downstream consumers.",
    ],
    stack: ["C#", "C++", "Azure", "REST APIs"],
  },
];
