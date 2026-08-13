import type { Tint } from "@/lib/projectVisuals";

export type WorkingEvidence = {
  label: string;
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
        href: "https://github.com/mcasillas17/TuringAgent",
      },
      {
        label: "Telemetry note",
        href: "/blog/observability-engineers-read",
      },
    ],
  },
  {
    number: "04",
    title: "Write things down for the handoff",
    description:
      "For cross-team platform work, I pair reusable APIs and migrations that avoid disrupting downstream consumers with written architecture, security, and verification guidance.",
    tint: "purple",
    evidence: [
      {
        label: "Platform APIs and migrations",
        href: "/#experience",
      },
      {
        label: "TuringAgent docs and checks",
        href: "https://github.com/mcasillas17/TuringAgent#documentation",
      },
    ],
  },
];
