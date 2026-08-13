export type Role = {
  company: string;
  title: string;
  start: string; // e.g. "2023"
  end: string; // e.g. "Present"
  location?: string;
  highlights: string[];
  stack?: string[];
};

// Roles at Microsoft (Redmond), most recent first. Highlights preserve the
// concrete work documented in the public résumé while omitting internal system
// names and unsupported impact claims.
export const experience: Role[] = [
  {
    company: "Microsoft",
    title: "Software Engineer II",
    start: "2024",
    end: "Present",
    location: "Redmond, WA",
    highlights: [
      "Built an MCP server that enables agentic workflows to use content-suggestion and campaign-insight scenarios across multiple data sources and APIs.",
      "Delivered explainability pipelines for model-driven content insights and campaign diagnostics, with end-to-end telemetry, dashboards, and partner-facing documentation.",
      "Modernized CI/CD to YAML pipelines with artifact signing, secret scanning, production-branch triggers, gated approvals, and compliance checks.",
    ],
    stack: ["C#", "TypeScript", "MCP", "Azure DevOps"],
  },
  {
    company: "Microsoft",
    title: "Software Engineer",
    start: "2022",
    end: "2024",
    location: "Redmond, WA",
    highlights: [
      "Completed a migration for a campaign-metadata portal used by Microsoft products to create campaign IDs.",
      "Integrated Exchange email delivery for commercial campaign scenarios involving Microsoft and external partners.",
      "Automated creation and updates of data consumed by the campaign-metadata portal.",
    ],
    stack: ["C#", "Azure", "Exchange"],
  },
  {
    company: "Microsoft",
    title: "Software Engineer",
    start: "2019",
    end: "2022",
    location: "Redmond, WA",
    highlights: [
      "Contributed to the general-availability release of a scheduling service for enterprise customers.",
      "Decoupled scheduling services to expose reusable APIs for other Outlook products.",
      "Implemented a time-suggestions API used by Outlook Mobile on iOS and web, including flexible working hours in the Find Meeting Times API.",
    ],
    stack: ["C#", "REST APIs"],
  },
  {
    company: "Microsoft",
    title: "Software Engineer",
    start: "2018",
    end: "2019",
    location: "Redmond, WA",
    highlights: [
      "Migrated SDK build systems for new platforms and processors, enabling partners such as Defender to adopt a new SDK version.",
      "Built an Objective-C wrapper around a C++ SDK for partner teams on Mac.",
      "Implemented diagnostic-level filtering and improved the C# wrapper used to send telemetry through the C++ layer.",
    ],
    stack: ["C++", "Objective-C", "C#"],
  },
];
