import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "@/components/ui/Button";

describe("Button", () => {
  it("renders a <button> by default with its children", () => {
    render(<Button>Click me</Button>);
    const el = screen.getByRole("button", { name: "Click me" });
    expect(el.tagName).toBe("BUTTON");
  });

  it("renders an <a> when href is provided", () => {
    render(<Button href="/resume.pdf">Resume</Button>);
    const link = screen.getByRole("link", { name: "Resume" });
    expect(link).toHaveAttribute("href", "/resume.pdf");
  });

  it("applies a download attribute when download is set", () => {
    render(
      <Button href="/resume.pdf" download>
        Resume
      </Button>,
    );
    expect(screen.getByRole("link", { name: "Resume" })).toHaveAttribute(
      "download",
    );
  });
});
