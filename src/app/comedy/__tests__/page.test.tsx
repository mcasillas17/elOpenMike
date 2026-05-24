import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ComedyPage from "@/app/comedy/page";
import { clips } from "@/data/comedy";

describe("/comedy page", () => {
  it("renders the heading and a play button per clip", () => {
    render(<ComedyPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Stand-up" }),
    ).toBeInTheDocument();
    for (const c of clips) {
      expect(
        screen.getByRole("button", { name: `Play: ${c.title}` }),
      ).toBeInTheDocument();
    }
  });
});
