import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CaseStudy } from "@/components/projects/CaseStudy";
import type { CaseStudy as CaseStudyData } from "@/data/projects";

const fixture: CaseStudyData = {
  problem: "A constrained problem with a traceable implementation path.",
  whatIBuilt: ["A server-rendered case-study presentation."],
  constraints: ["The content must be tied to public source evidence."],
  architecture: {
    flowLabel: "Input moves through a local worker to a reviewed result.",
    nodes: [
      { title: "Input", detail: "Begins the data flow." },
      { title: "Worker", detail: "Processes the input." },
      { title: "Result", detail: "Returns the reviewed result." },
    ],
  },
  decisions: [
    { title: "Stay static", detail: "No client bundle is needed for this reading flow." },
  ],
  verification: [
    { title: "Automated test", detail: "A test protects the content contract." },
  ],
  status: "Current status is stated without unsupported outcome claims.",
  lessons: ["Keep the evidence visible beside the claims."],
  evidence: [
    {
      label: "Source evidence",
      href: "https://example.com/source",
      detail: "A public implementation reference.",
    },
  ],
};

describe("CaseStudy", () => {
  it("renders an accessible architecture visual and source evidence", () => {
    render(<CaseStudy caseStudy={fixture} />);

    expect(
      screen.getByRole("figure", { name: /architecture.*data flow/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Input moves through a local worker to a reviewed result.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Source evidence" })).toHaveAttribute(
      "href",
      "https://example.com/source",
    );
    expect(screen.getByRole("link", { name: "Source evidence" })).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );
  });

  it("surfaces a compact current-status signal before the detailed sections", () => {
    render(<CaseStudy caseStudy={fixture} />);

    const status = screen.getByRole("note", { name: "Current status" });
    expect(status).toHaveTextContent(fixture.status);
    expect(status.compareDocumentPosition(screen.getByRole("heading", { name: "What I built" }))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("uses level-two headings so the page h1 remains unique", () => {
    render(<CaseStudy caseStudy={fixture} />);

    expect(screen.getByRole("heading", { level: 2, name: "Problem" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "What I built" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Evidence & current status" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  });
});
