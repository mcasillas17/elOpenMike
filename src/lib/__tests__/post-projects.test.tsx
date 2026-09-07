import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

const files = new Map<string, string>();
vi.mock("node:fs", () => ({
  default: {
    existsSync: (file: string) => file.endsWith("/content/blog") || files.has(file.split("/").pop() ?? ""),
    readdirSync: () => [...files.keys()],
    readFileSync: (file: string) => {
      const content = files.get(file.split("/").pop() ?? "");
      if (content === undefined) throw new Error("Missing article fixture");
      return content;
    },
  },
}));
vi.mock("@/lib/article", () => ({
  compileArticle: async () => ({ content: <p>Article body.</p>, headings: [] }),
}));

import { getPost, getPostsForProject } from "@/lib/blog";
import PostPage from "@/app/blog/[slug]/page";
import ProjectPage from "@/app/projects/[slug]/page";
import { serializePost } from "@/lib/notion/serialize";

function post(slug: string, references?: unknown, date = "2026-06-01") {
  files.set(`${slug}.mdx`, [
    "---",
    `title: "Story ${slug}"`,
    `date: "${date}"`,
    'excerpt: "A project story."',
    "tags: []",
    ...(references === undefined ? [] : [`projects: ${JSON.stringify(references)}`]),
    "---",
    "A story about the work.",
  ].join("\n"));
}

beforeEach(() => files.clear());

describe("project-linked writing", () => {
  it("normalizes declared titles and slugs without changing legacy metadata", () => {
    post("care", ["TuringCare", "turingcare", "ScoreArc"]);
    post("legacy");
    expect(getPost("care")?.meta.projects).toEqual(["turingcare", "scorearc"]);
    expect(getPost("legacy")?.meta).not.toHaveProperty("projects");
  });

  it("rejects unknown references without echoing rejected content", () => {
    post("invalid", ["secret-token-value"]);
    expect(() => getPost("invalid")).toThrow(/project references/i);
    expect(() => getPost("invalid")).not.toThrow(/secret-token-value/);
  });

  it("finds only explicitly linked stories, in the normal newest-first order", () => {
    post("older", ["turingcare"], "2026-05-01");
    post("newer", ["TuringCare"], "2026-06-01");
    post("other", ["scorearc"]);
    post("unlinked");
    expect(getPostsForProject("turingcare").map((item) => item.slug)).toEqual(["newer", "older"]);
    expect(getPostsForProject("wallcrawl")).toEqual([]);
  });

  it("links an article to the real project destination", async () => {
    post("care", ["TuringCare"]);
    render(await PostPage({ params: Promise.resolve({ slug: "care" }) }));
    const links = screen.getByRole("navigation", { name: "Projects in this article" });
    expect(within(links).getByRole("link", { name: /TuringCare/ })).toHaveAttribute("href", "/projects/turingcare");
  });

  it("links the project back to a real matching article", async () => {
    post("care", ["turingcare"]);
    render(await ProjectPage({ params: Promise.resolve({ slug: "turingcare" }) }));
    const writing = screen.getByRole("region", { name: "The story behind this project" });
    expect(within(writing).getByRole("link", { name: "Story care" })).toHaveAttribute("href", "/blog/care");
  });

  it("renders project stories directly from the sync serializer's output", async () => {
    files.set("synced-story.mdx", serializePost({
      title: "A synced story",
      date: "2026-06-01",
      updated: "2026-06-01",
      excerpt: "Written in Notion.",
      tags: [],
      projects: ["TuringCare", "turingcare"],
    }, "The article body."));
    expect(getPost("synced-story")?.meta.projects).toEqual(["turingcare"]);
    render(await ProjectPage({ params: Promise.resolve({ slug: "turingcare" }) }));
    expect(screen.getByRole("link", { name: "A synced story" })).toHaveAttribute("href", "/blog/synced-story");
  });

  it("does not render an empty story section or infer relationships", async () => {
    post("unlinked");
    render(await ProjectPage({ params: Promise.resolve({ slug: "turingcare" }) }));
    expect(screen.queryByRole("region", { name: /story behind/i })).not.toBeInTheDocument();
  });
});
