import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

vi.mock("@/lib/fonts", () => ({
  sora: { variable: "font-sora" },
  inter: { variable: "font-inter" },
}));

import RootLayout from "@/app/layout";

describe("RootLayout document attributes", () => {
  it("declares smooth-scroll behavior and tolerates extension-added html attributes", () => {
    const html = RootLayout({ children: <div>Page</div> }) as ReactElement<{
      "data-scroll-behavior"?: string;
      suppressHydrationWarning?: boolean;
    }>;

    expect(html.props["data-scroll-behavior"]).toBe("smooth");
    expect(html.props.suppressHydrationWarning).toBe(true);
  });
});
