import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { HowIWork } from "@/components/sections/HowIWork";
import { howIWork } from "@/data/howIWork";

describe("HowIWork", () => {
  it("makes each engineering principle and its supporting evidence available", () => {
    render(<HowIWork />);

    const section = document.getElementById("how-i-work");
    expect(section).toHaveAttribute("aria-labelledby", "how-i-work-title");
    expect(
      within(section as HTMLElement).getByRole("heading", {
        name: "How I work",
      }),
    ).toBeInTheDocument();

    for (const principle of howIWork) {
      expect(principle.evidence.length).toBeGreaterThan(0);
      expect(
        within(section as HTMLElement).getByRole("heading", {
          name: principle.title,
        }),
      ).toBeInTheDocument();
      expect(
        within(section as HTMLElement).getByText(principle.description),
      ).toBeInTheDocument();

      for (const evidence of principle.evidence) {
        const external = evidence.href.startsWith("http");
        const link = within(section as HTMLElement).getByRole("link", {
          name: external
            ? `${evidence.label} opens in a new tab`
            : evidence.label,
        });

        expect(link).toHaveAttribute("href", evidence.href);
        expect(
          within(section as HTMLElement).getByText(evidence.detail),
        ).toBeInTheDocument();

        if (external) {
          expect(link).toHaveAttribute("target", "_blank");
          expect(link).toHaveAttribute("rel", "noopener noreferrer");
        }
      }
    }
  });

  it("keeps evidence links usable by touch and keyboard", () => {
    render(<HowIWork />);

    for (const evidence of howIWork.flatMap((principle) => principle.evidence)) {
      const link = screen.getByRole("link", {
        name: evidence.href.startsWith("http")
          ? `${evidence.label} opens in a new tab`
          : evidence.label,
      });
      expect(link).toHaveClass("min-h-11", "focus-visible:outline");
    }
  });
});
