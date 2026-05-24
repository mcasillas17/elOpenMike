export type Role = {
  company: string;
  title: string;
  start: string; // e.g. "2023"
  end: string; // e.g. "Present"
  location?: string;
  highlights: string[];
  stack?: string[];
};

// Roles at Microsoft (Redmond), most recent first. Highlights are a high-level
// overview of focus + strengths per role — intentionally no internal/
// proprietary project or system names.
export const experience: Role[] = [
  {
    company: "Microsoft",
    title: "Software Engineer II — Messaging & AI Platform",
    start: "2024",
    end: "Present",
    location: "Redmond, WA",
    highlights: [
      "Focus: backend services and APIs for large-scale email and push messaging, including AI/agent tooling that surfaces content and insights.",
      "Strengths: scalable service design across many data sources, end-to-end telemetry and observability, and modernizing CI/CD with strong pipeline security.",
    ],
    stack: ["C#", "TypeScript", "MCP", "Azure DevOps"],
  },
  {
    company: "Microsoft",
    title: "Software Engineer — Campaign Platform Tooling",
    start: "2022",
    end: "2024",
    location: "Redmond, WA",
    highlights: [
      "Focus: platform and portal tooling used across product teams, plus email-delivery integrations for commercial scenarios.",
      "Strengths: cross-team platform work, data automation, and large migrations delivered without disrupting downstream consumers.",
    ],
    stack: ["C#", "Azure", "Exchange"],
  },
  {
    company: "Microsoft",
    title: "Software Engineer — Outlook Calendar & Scheduling",
    start: "2019",
    end: "2022",
    location: "Redmond, WA",
    highlights: [
      "Focus: calendar and scheduling for Outlook — shipping an enterprise scheduling service to general availability and exposing internal services as reusable APIs.",
      "Strengths: API design, algorithm work on meeting-time suggestions, and shipping reliable services for enterprise customers.",
    ],
    stack: ["C#", "REST APIs"],
  },
  {
    company: "Microsoft",
    title: "Software Engineer — Telemetry SDKs",
    start: "2018",
    end: "2019",
    location: "Redmond, WA",
    highlights: [
      "Focus: cross-platform telemetry SDKs — build systems, language wrappers (C++, Objective-C, C#), and diagnostics.",
      "Strengths: systems and SDK engineering across platforms and languages, enabling partner teams to adopt shared infrastructure.",
    ],
    stack: ["C++", "Objective-C", "C#"],
  },
];
