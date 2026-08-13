import type { Tint } from "@/lib/projectVisuals";

export type WorkingEvidence = {
  label: string;
  detail: string;
  href: string;
};

export type WorkingPrinciple = {
  number: string;
  title: string;
  description: string;
  tint: Tint;
  evidence: readonly WorkingEvidence[];
};

// Every principle points to a public implementation, project document, or
// current experience summary. Keep the copy tied to that evidence rather than
// adding broad seniority or outcome claims.
export const howIWork: readonly WorkingPrinciple[] = [
  {
    number: "01",
    title: "Make the seams explicit",
    description:
      "I make responsibility and interfaces clear. TuringAgent separates its orchestrator, agent runtime, MCP services, and client.",
    tint: "blue",
    evidence: [
      {
        label: "TuringAgent architecture",
        detail:
          "TuringAgent splits ownership across the orchestrator, agent runtime, MCP services, and client.",
        href: "https://github.com/mcasillas17/TuringAgent/blob/main/docs/architecture/tech-stack.md",
      },
    ],
  },
  {
    number: "02",
    title: "Keep a human gate on state changes",
    description:
      "I keep automated writes reviewable: TuringAgent's sandboxed file mutations wait for a user approval bound to the requested tool and arguments.",
    tint: "red",
    evidence: [
      {
        label: "Approval-gated file tools",
        detail:
          "Sandboxed file changes require approval bound to the requested tool and arguments.",
        href: "https://github.com/mcasillas17/TuringAgent/blob/main/docs/mcp-security-and-integration.md",
      },
    ],
  },
  {
    number: "03",
    title: "Treat operational clarity as a feature",
    description:
      "I give runtime state a place to be inspected. TuringAgent records events and audit state; my telemetry note starts with the error and dependency questions an engineer needs answered.",
    tint: "green",
    evidence: [
      {
        label: "TuringAgent runtime",
        detail: "The orchestrator owns events and audit records for each run.",
        href: "https://github.com/mcasillas17/TuringAgent",
      },
      {
        label: "Telemetry note",
        detail: "It starts from error rate by route and slow dependencies.",
        href: "/blog/observability-engineers-read",
      },
    ],
  },
  {
    number: "04",
    title: "Write things down for the handoff",
    description:
      "In cross-team platform work, I’ve contributed reusable APIs, migrations, and partner-facing documentation. Separately, TuringAgent publishes its architecture, security model, and verification steps.",
    tint: "purple",
    evidence: [
      {
        label: "Microsoft résumé",
        detail:
          "Reusable APIs, large migrations, and partner-facing documentation from Microsoft platform work.",
        href: "/resume.pdf",
      },
      {
        label: "TuringAgent docs and checks",
        detail:
          "Architecture, security, and a test/build/smoke verification matrix live with the project.",
        href: "https://github.com/mcasillas17/TuringAgent#documentation",
      },
    ],
  },
];
