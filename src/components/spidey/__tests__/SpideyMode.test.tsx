import { describe, it, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { SpideyMode } from "@/components/spidey/SpideyMode";

describe("SpideyMode", () => {
  it("toggles the THWIP toast on the spidey:toggle event", () => {
    render(<SpideyMode />);
    expect(screen.queryByText(/THWIP/i)).not.toBeInTheDocument();
    act(() => { window.dispatchEvent(new CustomEvent("spidey:toggle")); });
    expect(screen.getByText(/THWIP/i)).toBeInTheDocument();
    act(() => { window.dispatchEvent(new CustomEvent("spidey:toggle")); });
    expect(screen.queryByText(/THWIP/i)).not.toBeInTheDocument();
  });
});
