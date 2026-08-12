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
    expect(screen.getByRole("link", { name: "Writing" })).toHaveAttribute(
      "aria-current",
      "page",
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
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("link", { name: "Experience" }).length).toBeGreaterThan(1);
  });
});
