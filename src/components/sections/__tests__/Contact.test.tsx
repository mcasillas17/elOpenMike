import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Contact } from "../Contact";

describe("Contact email", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it("shows a selectable address and copies only that address", async () => {
    render(<Contact />);
    expect(screen.getByRole("link", { name: "micasillm@gmail.com" })).toHaveAttribute("href", expect.stringContaining("mailto:micasillm@gmail.com"));
    fireEvent.click(screen.getByRole("button", { name: "Copy email" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Email address copied.");
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("micasillm@gmail.com");
  });

  it("keeps the address available and reports rejected clipboard access", async () => {
    vi.mocked(navigator.clipboard.writeText).mockRejectedValue(new Error("denied"));
    render(<Contact />);
    fireEvent.click(screen.getByRole("button", { name: "Copy email" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Could not copy. Select the address and copy it manually.");
    expect(screen.getByRole("link", { name: "micasillm@gmail.com" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Try copy again" })).toBeEnabled();
  });

  it("handles unavailable clipboard APIs without a silent failure", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    render(<Contact />);
    fireEvent.click(screen.getByRole("button", { name: "Copy email" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Could not copy.");
  });
});
