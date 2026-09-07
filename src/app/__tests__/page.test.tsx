import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import Home from "@/app/page";
import { about } from "@/data/about";

describe("Home page", () => {
  it("renders all home sections", () => {
    render(<Home />);
    expect(screen.getByText(/Casillas/)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Experience" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Selected Projects" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: about.headline }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Stand-up" }),
    ).toBeInTheDocument();
  });

  it("surfaces the writing section", () => {
    const { container } = render(<Home />);
    expect(container.querySelector("#writing")).not.toBeNull();
  });

  it("places How I work after projects and before the supporting sections", () => {
    const { container } = render(<Home />);
    const sections = Array.from(container.querySelectorAll("section"));
    const ids = sections.map((section) => section.id);

    expect(ids.indexOf("projects")).toBeLessThan(ids.indexOf("how-i-work"));
    expect(ids.indexOf("how-i-work")).toBeLessThan(ids.indexOf("skills"));
    expect(ids.indexOf("how-i-work")).toBeLessThan(ids.indexOf("about"));
  });

  it("shows work before the career history and ends with an actionable contact section", () => {
    const { container } = render(<Home />);
    const ids = Array.from(container.querySelectorAll("section")).map((s) => s.id);
    expect(ids.indexOf("projects")).toBeLessThan(ids.indexOf("experience"));
    expect(ids.at(-1)).toBe("contact");
    const contact = screen.getByRole("region", { name: "Let's build something worthwhile." });
    expect(within(contact).getByRole("link", { name: /email me/i })).toHaveAttribute(
      "href",
      expect.stringContaining("mailto:"),
    );
    expect(within(contact).getByRole("link", { name: /résumé/i })).toHaveAttribute(
      "href",
      "/resume.pdf",
    );
  });
});
