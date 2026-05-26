export type Role = {
  company: string;
  title: string;
  start: string; // e.g. "2023"
  end: string; // e.g. "Present"
  location?: string;
  highlights: string[];
  stack?: string[];
};

// Grouped by title/level. Each role gets a couple of clean summary bullets —
// what you focused on, no internal/proprietary project or system names.
export const experience: Role[] = [
  {
    company: "Microsoft",
    title: "Software Engineer II",
    start: "2024",
    end: "Present",
    location: "Redmond, WA",
    highlights: [
      "Backend services and APIs for large-scale email and push messaging, including AI/agent tooling that surfaces content and insights.",
      "Scalable service design across many data sources, with end-to-end telemetry and observability and modern, secure CI/CD pipelines.",
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
      "Cross-team platform work, API and algorithm design, and large migrations delivered without disrupting downstream consumers.",
    ],
    stack: ["C#", "C++", "Azure", "REST APIs"],
  },
];
