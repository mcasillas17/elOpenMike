import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { createElement } from "react";
import { contentSecurityPolicy, securityHeaders } from "../../../next.config";
import { YouTubeEmbed } from "@/components/comedy/YouTubeEmbed";
import { clips } from "@/data/comedy";

// The comedy page frames a YouTube player and draws its thumbnail, and the
// policy every response carries said neither: `img-src 'self' data: blob:` and
// no frame-src at all, which falls back to `default-src 'self'`. So the browser
// refused the thumbnail and refused the player, and said so twice in the
// console on a page whose whole content is those two things.
//
// The fix is the two exact origins that page uses and nothing else. A wildcard
// (`https://*.youtube.com`) or the bare site (`https://youtube.com`) would
// license every host Google ever puts behind that name — including the ones
// that serve tracking pixels the privacy-friendly embed exists to avoid — for
// one thumbnail and one player this repo can name in full.

function directives(policy: string): Map<string, string[]> {
  const parsed = new Map<string, string[]>();
  for (const directive of policy.split(";")) {
    const [name, ...sources] = directive.trim().split(/\s+/);
    if (name) parsed.set(name, sources);
  }
  return parsed;
}

const policy = directives(contentSecurityPolicy);

// Where the component actually goes, read off the component rather than
// restated here: a src that moves has to move the policy with it.
function embedOrigins(): { thumbnail: string; player: string } {
  const { container } = render(
    createElement(YouTubeEmbed, {
      youtubeId: clips[0]?.youtubeId ?? "abc123",
      title: "A set",
    }),
  );
  const thumbnail = container.querySelector("img")?.getAttribute("src") ?? "";
  fireEvent.click(screen.getByRole("button", { name: /^Play:/ }));
  const player = container.querySelector("iframe")?.getAttribute("src") ?? "";
  return { thumbnail: new URL(thumbnail).origin, player: new URL(player).origin };
}

describe("the Content-Security-Policy every response carries", () => {
  it("is the value of the Content-Security-Policy header", () => {
    const header = securityHeaders.find(
      (entry) => entry.key === "Content-Security-Policy",
    );
    expect(header?.value).toBe(contentSecurityPolicy);
  });

  it("lets the comedy page draw the thumbnail its embed asks for", () => {
    const { thumbnail } = embedOrigins();
    expect(thumbnail).toBe("https://img.youtube.com");
    expect(policy.get("img-src")).toContain(thumbnail);
  });

  it("lets the comedy page frame the player its embed asks for", () => {
    const { player } = embedOrigins();
    expect(player).toBe("https://www.youtube-nocookie.com");
    expect(policy.get("frame-src")).toContain(player);
  });

  it("allows those two hosts and nothing else of YouTube's", () => {
    expect(policy.get("img-src")).toEqual([
      "'self'",
      "data:",
      "blob:",
      "https://img.youtube.com",
    ]);
    expect(policy.get("frame-src")).toEqual([
      "https://www.youtube-nocookie.com",
    ]);
  });

  it("names hosts in full: no wildcard, no bare youtube.com, no scheme-wide source", () => {
    for (const [name, sources] of policy) {
      for (const source of sources) {
        expect(source, `${name} ${source}`).not.toBe("*");
        expect(source, `${name} ${source}`).not.toMatch(/^https?:$/);
        expect(source, `${name} ${source}`).not.toContain("*.");
        if (source.includes("youtube")) {
          expect(source, `${name} ${source}`).toMatch(
            /^https:\/\/(img\.youtube\.com|www\.youtube-nocookie\.com)$/,
          );
        }
      }
    }
  });

  it("keeps every restrictive default it had before the embed needed anything", () => {
    expect(policy.get("default-src")).toEqual(["'self'"]);
    expect(policy.get("object-src")).toEqual(["'none'"]);
    expect(policy.get("frame-ancestors")).toEqual(["'none'"]);
    expect(policy.get("base-uri")).toEqual(["'self'"]);
    expect(policy.get("form-action")).toEqual(["'self'"]);
    expect(policy.get("font-src")).toEqual(["'self'", "data:"]);
    expect(policy.has("upgrade-insecure-requests")).toBe(true);
    expect(contentSecurityPolicy).not.toContain("'unsafe-eval'");
  });

  it("keeps every host it talks to on https", () => {
    for (const [name, sources] of policy) {
      for (const source of sources) {
        if (!source.includes(".")) continue;
        if (source.endsWith(":")) continue; // data:, blob:
        expect(source, `${name} ${source}`).toMatch(/^https:\/\//);
      }
    }
  });
});
