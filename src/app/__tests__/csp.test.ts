import { describe, it, expect } from "vitest";
import { contentSecurityPolicy, securityHeaders } from "../../../next.config";

function directives(policy: string): Map<string, string[]> {
  return new Map(
    policy.split(";").flatMap((directive) => {
      const [name, ...sources] = directive.trim().split(/\s+/);
      return name ? [[name, sources]] : [];
    }),
  );
}

describe("the static site's CSP configuration", () => {
  const policy = directives(contentSecurityPolicy);

  it("is installed as the response Content-Security-Policy header", () => {
    expect(
      securityHeaders.find((header) => header.key === "Content-Security-Policy")
        ?.value,
    ).toBe(contentSecurityPolicy);
  });

  it("allows no YouTube image origin and only the intentional player frame", () => {
    expect(policy.get("img-src")).toEqual(["'self'", "data:", "blob:"]);
    expect(policy.get("frame-src")).toEqual([
      "https://www.youtube-nocookie.com",
    ]);
  });

  it("keeps restrictive defaults around the local video facades", () => {
    expect(policy.get("default-src")).toEqual(["'self'"]);
    expect(policy.get("object-src")).toEqual(["'none'"]);
    expect(policy.get("frame-ancestors")).toEqual(["'none'"]);
    expect(policy.get("base-uri")).toEqual(["'self'"]);
    expect(policy.get("form-action")).toEqual(["'self'"]);
    expect(contentSecurityPolicy).not.toContain("'unsafe-eval'");
  });
});
