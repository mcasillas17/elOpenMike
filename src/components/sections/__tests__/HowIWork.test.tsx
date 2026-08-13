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
      expect(
        within(section as HTMLElement).getByRole("heading", {
          name: principle.title,
        }),
      ).toBeInTheDocument();
      expect(
        within(section as HTMLElement).getByText(principle.description),
      ).toBeInTheDocument();

      for (const evidence of principle.evidence) {
        expect(
          within(section as HTMLElement).getByRole("link", {
            name: evidence.label,
          }),
        ).toHaveAttribute("href", evidence.href);
      }
    }
  });

  it("keeps evidence links usable by touch and keyboard", () => {
    render(<HowIWork />);

    for (const evidence of howIWork.flatMap((principle) => principle.evidence)) {
      const link = screen.getByRole("link", { name: evidence.label });
      expect(link).toHaveClass("min-h-11", "focus-visible:outline");
    }
  });
});
