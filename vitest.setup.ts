import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});

// jsdom has no IntersectionObserver. Provide a no-op default so components
// that use it (e.g. via useActiveSection) render in tests without crashing.
// Tests that need to drive the callback override this with vi.stubGlobal.
vi.stubGlobal(
  "IntersectionObserver",
  class {
    observe() {}
    disconnect() {}
    unobserve() {}
    takeRecords() {
      return [];
    }
  },
);
