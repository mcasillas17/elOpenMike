import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { useActiveSection } from "@/lib/useActiveSection";

// Capture the IntersectionObserver callback so the test can drive it.
let ioCallback: (entries: Array<Partial<IntersectionObserverEntry>>) => void;

beforeEach(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: typeof ioCallback) {
        ioCallback = cb;
      }
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
});

function Probe() {
  const active = useActiveSection(["experience", "projects"]);
  return <span data-testid="active">{active}</span>;
}

describe("useActiveSection", () => {
  it("reports the id of the intersecting section", () => {
    document.body.innerHTML =
      '<div id="experience"></div><div id="projects"></div>';
    render(<Probe />);

    act(() => {
      ioCallback([
        {
          isIntersecting: true,
          target: document.getElementById("projects")!,
        },
      ]);
    });

    expect(screen.getByTestId("active")).toHaveTextContent("projects");
  });
});
