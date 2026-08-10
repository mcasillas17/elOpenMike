import { describe, it, expect } from "vitest";
import { blocksToMarkdown } from "@/lib/notion/blocks-to-md";
import {
  serializePost,
  contentProjection,
  resolveUpdated,
} from "@/lib/notion/serialize";
import { imageFileName } from "@/lib/notion/images";
import { planReconcile } from "@/lib/notion/reconcile";
import type { PostFrontmatter } from "@/lib/notion/types";
import { samplePost } from "./fixtures/blocks";

const ctx = { imagePath: (id: string) => `/images/blog/sample/${id}.png` };
const fm: PostFrontmatter = {
  title: "A minimal tool",
  date: "2026-05-20",
  excerpt: "Keep the surface small.",
  tags: ["AI"],
  updated: "2026-05-20",
};

describe("sync idempotency (spec §7)", () => {
  it("converts the same blocks to byte-identical markdown", () => {
    expect(blocksToMarkdown(samplePost(), ctx)).toBe(
      blocksToMarkdown(samplePost(), ctx),
    );
  });

  it("serializes the same post to byte-identical mdx", () => {
    const body = blocksToMarkdown(samplePost(), ctx);
    expect(serializePost(fm, body)).toBe(serializePost(fm, body));
  });

  it("hashes the same image bytes to the same filename", () => {
    const bytes = new TextEncoder().encode("image-payload");
    expect(imageFileName(bytes, "image/png")).toBe(
      imageFileName(bytes, "image/png"),
    );
  });

  it("plans no writes when a re-run produces the same content", () => {
    const body = blocksToMarkdown(samplePost(), ctx);
    const file = serializePost(fm, body);
    const plan = planReconcile(
      new Map([["content/blog/sample.mdx", file]]),
      new Map([["content/blog/sample.mdx", file]]),
    );
    expect(plan.write).toEqual([]);
    expect(plan.delete).toEqual([]);
  });

  it("plans no writes when only Notion's last_edited_time moved", () => {
    const body = blocksToMarkdown(samplePost(), ctx);
    const onDisk = serializePost(fm, body);

    // Simulate the sync: content is unchanged, so `updated` is carried over
    // from the existing file rather than adopting the newer Notion timestamp.
    const existingUpdated = onDisk
      .split("\n")
      .find((line) => line.startsWith("updated: "))!
      .slice('updated: "'.length, -1);
    const candidate = serializePost({ ...fm, updated: "2099-12-31" }, body);
    const carried = serializePost(
      {
        ...fm,
        updated:
          contentProjection(candidate) === contentProjection(onDisk)
            ? resolveUpdated("2099-12-31", existingUpdated)
            : "2099-12-31",
      },
      body,
    );

    const plan = planReconcile(
      new Map([["content/blog/sample.mdx", carried]]),
      new Map([["content/blog/sample.mdx", onDisk]]),
    );
    expect(plan.write).toEqual([]);
  });

  it("DOES plan a write when the body actually changes", () => {
    const body = blocksToMarkdown(samplePost(), ctx);
    const plan = planReconcile(
      new Map([
        ["content/blog/sample.mdx", serializePost(fm, `${body}More.\n`)],
      ]),
      new Map([["content/blog/sample.mdx", serializePost(fm, body)]]),
    );
    expect(plan.write).toEqual(["content/blog/sample.mdx"]);
  });
});
