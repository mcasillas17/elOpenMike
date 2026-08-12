import { describe, expect, it } from "vitest";
import nextConfig from "../../../next.config";

describe("Next.js project root", () => {
  it("pins Turbopack to the checkout that launched the build", () => {
    expect(nextConfig.turbopack?.root).toBe(process.cwd());
  });
});
