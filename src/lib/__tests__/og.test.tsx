// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderOgImage } from "@/lib/og";
import ProjectImage from "@/app/projects/[slug]/opengraph-image";
import PostImage from "@/app/blog/[slug]/opengraph-image";

describe("social images", () => {
  it("renders a compact, full-size PNG", async () => {
    const response = renderOgImage();
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(bytes.readUInt32BE(16)).toBe(1200);
    expect(bytes.readUInt32BE(20)).toBe(630);
    expect(bytes.length).toBeLessThan(300 * 1024);
  });

  it("renders long and accented text without failing", async () => {
    const image = renderOgImage({
      title: "Diseño de sistemas: " + "A".repeat(220),
      caption: "A longer description with many words. ".repeat(30),
    });
    expect((await image.arrayBuffer()).byteLength).toBeLessThan(300 * 1024);
  });

  it.each([["project", ProjectImage], ["post", PostImage]] as const)(
    "rejects an unknown %s rather than generating a homepage card",
    async (_kind, image) => {
      await expect(image({ params: Promise.resolve({ slug: "not-a-published-slug" }) }))
        .rejects.toThrow();
    },
  );
});
