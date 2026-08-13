import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { useActiveSection } from "@/lib/useActiveSection";

// Capture the IntersectionObserver callback so the test can drive it.
let ioCallback: (entries: Array<Partial<IntersectionObserverEntry>>) => void;

beforeEach(() => {
  window.history.replaceState(null, "", "/");
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
  it("starts without an active section before an observed section enters view", () => {
    document.body.innerHTML =
      '<div id="experience"></div><div id="projects"></div>';
    render(<Probe />);

    expect(screen.getByTestId("active")).toBeEmptyDOMElement();
  });

  it("uses a matching location hash as the initial active section", () => {
    window.history.replaceState(null, "", "#projects");
    document.body.innerHTML =
      '<div id="experience"></div><div id="projects"></div>';
    render(<Probe />);

    expect(screen.getByTestId("active")).toHaveTextContent("projects");
  });

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
