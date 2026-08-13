import { describe, expect, it } from "vitest";
import { buildFeedXml } from "@/app/feed.xml/route";
import { getAllPosts, getPost, getPostsByTag } from "@/lib/blog";

const slug = "approval-gated-mcp-tools";

describe("approval-gated MCP tools article", () => {
  it("is the newest article with complete, discoverable metadata", () => {
    const post = getPost(slug);

    expect(post?.meta).toMatchObject({
      slug,
      title: "Approval Is a Capability, Not a Button",
      date: "2026-08-12",
      tags: ["AI", "MCP", "Security", "Systems Design"],
    });
    expect(post?.meta.excerpt).toMatch(/approval/i);
    expect(post?.meta.readingMinutes).toBeGreaterThanOrEqual(8);
    expect(getAllPosts()[0]?.slug).toBe(slug);
    expect(getPostsByTag("mcp").map((item) => item.slug)).toContain(slug);

    const feed = buildFeedXml(getAllPosts());
    expect(feed).toContain(
      "<link>https://elopenmike.com/blog/approval-gated-mcp-tools</link>",
    );
    expect(feed).toContain("<category>MCP</category>");
  });

  it("keeps the systems argument scannable and its sequence accessible as text", () => {
    const body = getPost(slug)?.body ?? "";

    for (const heading of [
      "## The threat model: the model is an untrusted planner",
      "## The request path",
      "## Why path checks are not confinement",
      "## Approval must bind to the exact call",
      "## Fail closed, then prove the boundary",
      "## What this design does not solve",
    ]) {
      expect(body).toContain(heading);
    }

    expect(body).toContain("```text\nUser action");
    expect(body).toContain("approval token");
    expect(body).toMatch(/```go\n[\s\S]{1,1200}?```/);
    expect(body).toContain("https://github.com/mcasillas17/TuringAgent");
    expect(body).toContain("/projects/turingagent");
    expect(body).toContain(
      "https://github.com/mcasillas17/TuringAgent/blob/main/docs/mcp-security-and-integration.md",
    );
    expect(body).toContain(
      "https://github.com/mcasillas17/TuringAgent/blob/main/turing-backend/agent-runtime-go/internal/tools/runner.go",
    );
    expect(body).toContain(
      "https://github.com/mcasillas17/TuringAgent/blob/main/turing-backend/mcp-files/internal/approval/jwt.go",
    );
  });
});
