import { beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Header } from "@/components/layout/Header";

let pathname = "/";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

beforeEach(() => {
  pathname = "/";
});

describe("Header", () => {
  it("renders the brand wordmark and a nav link to Experience", () => {
    render(<Header />);
    expect(
      screen.getByRole("link", { name: /elOpenMike/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Experience" }),
    ).toHaveAttribute("href", "/#experience");
  });

  it("uses one Writing destination for the blog", () => {
    pathname = "/blog";
    render(<Header />);
    expect(screen.getByRole("link", { name: "Writing" })).toHaveAttribute(
      "href",
      "/blog",
    );
    expect(screen.queryByRole("link", { name: "Blog" })).not.toBeInTheDocument();
    const writing = screen.getByRole("link", { name: "Writing" });
    expect(writing).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Experience" })).not.toHaveClass(
      "text-web-strong",
    );
  });

  it("marks the current section's nav link as active", () => {
    render(<Header />);
    // Experience is ids[0], so it is active on initial render.
    expect(screen.getByRole("link", { name: "Experience" })).toHaveClass(
      "text-web-strong",
    );
  });

  it("toggles a mobile menu exposing the nav links", () => {
    render(<Header />);
    const toggle = screen.getByRole("button", { name: /menu/i });
    expect(toggle).toHaveClass("h-11", "w-11");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const experienceLinks = screen.getAllByRole("link", { name: "Experience" });
    expect(experienceLinks.length).toBeGreaterThan(1);
    expect(experienceLinks.at(-1)).toHaveClass("min-h-11");
  });

  it("marks Writing current in both desktop and mobile navigation", () => {
    pathname = "/blog/an-article";
    render(<Header />);
    fireEvent.click(screen.getByRole("button", { name: /menu/i }));

    const links = screen.getAllByRole("link", { name: "Writing" });
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toHaveAttribute("aria-current", "page");
      expect(link).toHaveClass("text-web-strong");
    }
  });
});
