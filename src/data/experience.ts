export type Role = {
  company: string;
  title: string;
  start: string; // e.g. "2023"
  end: string; // e.g. "Present"
  location?: string;
  highlights: string[];
  stack?: string[];
};

// A single consolidated entry for the whole Microsoft tenure (rather than one
// card per role like the résumé). Highlights are a high-level overview of focus
// + strengths — intentionally no internal/proprietary project or system names.
export const experience: Role[] = [
  {
    company: "Microsoft",
    title: "Software Engineer II",
    start: "2018",
    end: "Present",
    location: "Redmond, WA",
    highlights: [
      "Six+ years building backend services and APIs at Microsoft — across cross-platform telemetry SDKs, Outlook calendar & scheduling, campaign & platform tooling, and, most recently, large-scale email and push messaging with AI/agent tooling.",
      "Focus: AI-powered systems, distributed systems, data-grounded analytics, and observability — building services that stay fast, scalable, and understandable as they grow.",
      "Strengths: scalable service & API design across many data sources, end-to-end telemetry and observability, large migrations delivered without disrupting downstream consumers, and modern, secure CI/CD.",
    ],
    stack: ["C#", "TypeScript", "C++", "Azure", "MCP", "REST APIs"],
  },
];
