import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { createElement } from "react";
import { contentSecurityPolicy, securityHeaders } from "../../../next.config";
import { YouTubeEmbed } from "@/components/comedy/YouTubeEmbed";
import { clips } from "@/data/comedy";

function directives(policy: string): Map<string, string[]> {
  const parsed = new Map<string, string[]>();
  for (const directive of policy.split(";")) {
    const [name, ...sources] = directive.trim().split(/\s+/);
    if (name) parsed.set(name, sources);
  }
  return parsed;
}

const policy = directives(contentSecurityPolicy);

function playerOrigin(): string {
  const { container } = render(
    createElement(YouTubeEmbed, {
      youtubeId: clips[0]?.youtubeId ?? "abc123",
      title: "A set",
    }),
  );
  expect(container.querySelector("img")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /^Play:/ }));
  const player = container.querySelector("iframe")?.getAttribute("src") ?? "";
  return new URL(player).origin;
}

describe("the Content-Security-Policy every response carries", () => {
  it("is the value of the Content-Security-Policy header", () => {
    const header = securityHeaders.find(
      (entry) => entry.key === "Content-Security-Policy",
    );
    expect(header?.value).toBe(contentSecurityPolicy);
  });

  it("allows only local imagery and the player origin its facade asks for", () => {
    expect(policy.get("img-src")).toEqual(["'self'", "data:", "blob:"]);
    expect(policy.get("frame-src")).toEqual([playerOrigin()]);
  });

  it("names hosts in full: no wildcard, bare youtube.com, or scheme-wide source", () => {
    for (const [name, sources] of policy) {
      for (const source of sources) {
        expect(source, `${name} ${source}`).not.toBe("*");
        expect(source, `${name} ${source}`).not.toMatch(/^https?:$/);
        expect(source, `${name} ${source}`).not.toContain("*.");
        if (source.includes("youtube")) {
          expect(source, `${name} ${source}`).toBe(
            "https://www.youtube-nocookie.com",
          );
        }
      }
    }
  });

  it("keeps every restrictive default around the local video facades", () => {
    expect(policy.get("default-src")).toEqual(["'self'"]);
    expect(policy.get("object-src")).toEqual(["'none'"]);
    expect(policy.get("frame-ancestors")).toEqual(["'none'"]);
    expect(policy.get("base-uri")).toEqual(["'self'"]);
    expect(policy.get("form-action")).toEqual(["'self'"]);
    expect(policy.get("font-src")).toEqual(["'self'", "data:"]);
    expect(policy.has("upgrade-insecure-requests")).toBe(true);
    expect(contentSecurityPolicy).not.toContain("'unsafe-eval'");
  });

  it("keeps every external host it talks to on HTTPS", () => {
    for (const [name, sources] of policy) {
      for (const source of sources) {
        if (!source.includes(".")) continue;
        if (source.endsWith(":")) continue;
        expect(source, `${name} ${source}`).toMatch(/^https:\/\//);
      }
    }
  });
});
