import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Button, LinkButton } from "@/components/ui/Button";

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

  it("forwards onClick to the native button", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);
    fireEvent.click(screen.getByRole("button", { name: "Go" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("auto-adds rel=noopener noreferrer for target=_blank links", () => {
    render(
      <Button href="https://example.com" target="_blank">
        Ext
      </Button>,
    );
    const link = screen.getByRole("link", { name: "Ext" });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("supports a string download filename", () => {
    render(
      <Button href="/resume.pdf" download="miguel-casillas-resume.pdf">
        Resume
      </Button>,
    );
    expect(screen.getByRole("link", { name: "Resume" })).toHaveAttribute(
      "download",
      "miguel-casillas-resume.pdf",
    );
  });

  it("LinkButton renders an internal link to its href", () => {
    render(<LinkButton href="/about">About</LinkButton>);
    expect(screen.getByRole("link", { name: "About" })).toHaveAttribute(
      "href",
      "/about",
    );
  });
});
