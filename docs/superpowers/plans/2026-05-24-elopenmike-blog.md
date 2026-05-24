# elOpenMike — Plan 4: Blog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an MDX dev blog — a `/blog` list and `/blog/[slug]` post pages with build-time syntax highlighting — sourced from `.mdx` files.

**Architecture:** `.mdx` posts in `content/blog/` with frontmatter; a filesystem loader (`src/lib/blog.ts`, gray-matter + a reading-time helper) reads them at build time. Posts are fully static (`generateStaticParams` + `dynamicParams = false`), so the container needs no runtime fs access. Post bodies render via `next-mdx-remote/rsc` `compileMDX` with `remark-gfm` + `rehype-pretty-code` (Shiki) and a custom MDX components map for on-brand prose. A "Blog" nav link points to `/blog`.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, next-mdx-remote, rehype-pretty-code, shiki, remark-gfm, gray-matter, Vitest + RTL. Package manager: **pnpm**.

**Spec:** `docs/superpowers/specs/2026-05-24-elopenmike-blog-design.md`

**Conventions:**
- Run all commands from the worktree root (absolute paths; cwd does not persist between Bash calls). Single test: `pnpm exec vitest run <path>`; all: `pnpm test`; build: `pnpm run build`.
- Reuse the design system: `Container`, `Tag` (`@/components/ui/Tag`), tokens `bg-surface`/`border-edge`/`text-spidey`/`text-web`/`text-muted`/`text-ink`, `font-display`/`font-body`. NEVER use `font-[family-name:...]`.
- New deps install with the 7-day `minimumReleaseAge` cooldown active — `pnpm add` auto-selects a version older than 7 days, so it "just works". If `pnpm install`/`add` ever errors with `ERR_PNPM_IGNORED_BUILDS` for a new dep, evaluate it and add to `allowBuilds` in `pnpm-workspace.yaml` ONLY if that package genuinely needs its build script (none of these are expected to).
- Commits: Conventional Commits ending with:
  ```
  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  ```

---

## File Structure

```
content/
  blog/
    grounding-agents-with-mcp.mdx     # CREATE: sample post
    observability-engineers-read.mdx  # CREATE: sample post
src/
  lib/
    blog.ts                           # CREATE: loader (gray-matter, reading time)
    __tests__/blog.test.ts            # CREATE
  components/
    blog/
      mdx-components.tsx              # CREATE: MDX element → styled components map
      PostCard.tsx                   # CREATE: list item (stretched-link)
      __tests__/mdx-components.test.tsx # CREATE
      __tests__/PostCard.test.tsx    # CREATE
  app/
    blog/
      page.tsx                       # CREATE: /blog list
      __tests__/page.test.tsx        # CREATE
      [slug]/
        page.tsx                     # CREATE: post (compileMDX, static)
        __tests__/page.test.tsx      # CREATE
  lib/site.ts                        # MODIFY: add "Blog" nav item
README.md                           # MODIFY: personalize note for posts
```

---

## Task 1: MDX deps + blog loader + sample posts

**Files:** Create `src/lib/blog.ts`, `content/blog/grounding-agents-with-mcp.mdx`, `content/blog/observability-engineers-read.mdx`; Test `src/lib/__tests__/blog.test.ts`.

- [ ] **Step 1: Install dependencies**
```bash
pnpm add gray-matter next-mdx-remote rehype-pretty-code shiki remark-gfm
```
Expected: installs cleanly (cooldown picks versions ≥7 days old). If you see `ERR_PNPM_IGNORED_BUILDS`, see the conventions note above (these packages should NOT need build scripts).

- [ ] **Step 2: Create the two sample posts** (real examples the owner edits later)

`content/blog/grounding-agents-with-mcp.mdx` — write this EXACT file content (it contains a fenced ` ```ts ` block):
````mdx
---
title: "Grounding agents in real data"
date: "2026-05-20"
excerpt: "Why retrieval beats prompt-stuffing, and a pattern for wiring tools to an agent without losing the plot."
tags: ["AI", "Distributed Systems"]
---

Prompt-stuffing falls over the moment your data changes. The fix is to let the agent `retrieve` what it needs at call time.

## A minimal tool

Here's the shape of a grounded tool call:

```ts
async function searchDocs(query: string) {
  const hits = await index.search(query, { topK: 5 });
  return hits.map((h) => h.text);
}
```

Keep the surface small, log every call, and ground answers in what came back.
````

`content/blog/observability-engineers-read.mdx`:
````mdx
---
title: "Telemetry that engineers actually read"
date: "2026-04-02"
excerpt: "Dashboards age fast. A few habits that keep observability useful past week one."
tags: ["Observability"]
---

A dashboard nobody opens is just a very expensive screensaver.

## Start from the question

Instrument the questions you'll actually ask during an incident, not every metric you can emit.

- What's the error rate, by route?
- Which dependency got slow?

```ts
logger.info("request.done", { route, status, ms });
```

Then delete the panels you never look at.
````

- [ ] **Step 3: Write the failing loader test** — `src/lib/__tests__/blog.test.ts`
```ts
import { describe, it, expect } from "vitest";
import { getAllPosts, getPostSlugs, getPost } from "@/lib/blog";

describe("blog loader", () => {
  it("lists posts newest-first with full metadata", () => {
    const posts = getAllPosts();
    expect(posts.length).toBeGreaterThanOrEqual(2);
    for (const p of posts) {
      expect(p.slug).toBeTruthy();
      expect(p.title).toBeTruthy();
      expect(p.date).toBeTruthy();
      expect(p.excerpt).toBeTruthy();
      expect(Array.isArray(p.tags)).toBe(true);
      expect(p.readingMinutes).toBeGreaterThan(0);
    }
    for (let i = 1; i < posts.length; i++) {
      expect(posts[i - 1].date >= posts[i].date).toBe(true); // newest first
    }
  });

  it("getPostSlugs covers every post", () => {
    expect(getPostSlugs().sort()).toEqual(
      getAllPosts().map((p) => p.slug).sort(),
    );
  });

  it("getPost returns meta + body, undefined for unknown", () => {
    const slug = getAllPosts()[0].slug;
    const post = getPost(slug);
    expect(post?.meta.slug).toBe(slug);
    expect(post?.body).toBeTruthy();
    expect(getPost("nope-not-real")).toBeUndefined();
  });
});
```

- [ ] **Step 4: Run it** → `pnpm exec vitest run src/lib/__tests__/blog.test.ts` → FAIL (cannot resolve `@/lib/blog`).

- [ ] **Step 5: Implement the loader** — `src/lib/blog.ts`
```ts
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

export type PostMeta = {
  slug: string;
  title: string;
  date: string; // ISO
  excerpt: string;
  tags: string[];
  readingMinutes: number;
};

const BLOG_DIR = path.join(process.cwd(), "content", "blog");

function readingMinutes(body: string): number {
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

export function getPostSlugs(): string[] {
  if (!fs.existsSync(BLOG_DIR)) return [];
  return fs
    .readdirSync(BLOG_DIR)
    .filter((f) => f.endsWith(".mdx"))
    .map((f) => f.replace(/\.mdx$/, ""));
}

export function getPost(
  slug: string,
): { meta: PostMeta; body: string } | undefined {
  const file = path.join(BLOG_DIR, `${slug}.mdx`);
  if (!fs.existsSync(file)) return undefined;
  const { data, content } = matter(fs.readFileSync(file, "utf8"));
  const meta: PostMeta = {
    slug,
    title: String(data.title ?? slug),
    date: String(data.date ?? ""),
    excerpt: String(data.excerpt ?? ""),
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    readingMinutes: readingMinutes(content),
  };
  return { meta, body: content };
}

export function getAllPosts(): PostMeta[] {
  return getPostSlugs()
    .map((slug) => getPost(slug)?.meta)
    .filter((m): m is PostMeta => m !== undefined)
    .sort((a, b) => (a.date < b.date ? 1 : -1)); // newest first
}
```

- [ ] **Step 6: Run the loader test** → PASS (3).

- [ ] **Step 7: Run all tests + build** → `pnpm test && pnpm run build` → green, EXIT 0.

- [ ] **Step 8: Commit**
```bash
git add -A
git commit -m "feat: add blog MDX deps, loader, and sample posts

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: MDX components map

**Files:** Create `src/components/blog/mdx-components.tsx`; Test `src/components/blog/__tests__/mdx-components.test.tsx`.

- [ ] **Step 1: Write the failing test** — `src/components/blog/__tests__/mdx-components.test.tsx`
```tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { mdxComponents } from "@/components/blog/mdx-components";

describe("mdxComponents", () => {
  it("styles inline code (string child) as a pill", () => {
    const Code = mdxComponents.code;
    const { container } = render(<Code>inline</Code>);
    const el = container.querySelector("code");
    expect(el?.className).toContain("bg-surface");
  });

  it("leaves block code (element children) unstyled for Shiki", () => {
    const Code = mdxComponents.code;
    const { container } = render(
      <Code>
        <span>x</span>
      </Code>,
    );
    const el = container.querySelector("code");
    expect(el?.className ?? "").not.toContain("bg-surface");
  });

  it("renders headings with the display font", () => {
    const H2 = mdxComponents.h2;
    const { container } = render(<H2>Heading</H2>);
    expect(container.querySelector("h2")?.className).toContain("font-display");
  });
});
```

- [ ] **Step 2: Run it** → FAIL (cannot resolve `@/components/blog/mdx-components`).

- [ ] **Step 3: Implement** — `src/components/blog/mdx-components.tsx`
```tsx
import type { ComponentProps } from "react";

// Element → styled component map for compiled MDX (on-brand prose).
// Inline vs. block <code> is distinguished by whether children is a string:
// inline code (`x`) has a string child; fenced blocks (via rehype-pretty-code)
// have element children (Shiki <span>s), which we leave untouched.
export const mdxComponents = {
  h1: (p: ComponentProps<"h2">) => (
    <h2 className="mt-10 mb-3 font-display text-2xl font-bold text-ink" {...p} />
  ),
  h2: (p: ComponentProps<"h2">) => (
    <h2 className="mt-10 mb-3 font-display text-2xl font-bold text-ink" {...p} />
  ),
  h3: (p: ComponentProps<"h3">) => (
    <h3 className="mt-8 mb-2 font-display text-xl font-bold text-ink" {...p} />
  ),
  p: (p: ComponentProps<"p">) => (
    <p className="mb-4 leading-relaxed text-muted" {...p} />
  ),
  a: (p: ComponentProps<"a">) => (
    <a className="text-web underline underline-offset-2 hover:opacity-80" {...p} />
  ),
  ul: (p: ComponentProps<"ul">) => (
    <ul className="mb-4 list-disc space-y-1.5 pl-5 text-muted" {...p} />
  ),
  ol: (p: ComponentProps<"ol">) => (
    <ol className="mb-4 list-decimal space-y-1.5 pl-5 text-muted" {...p} />
  ),
  li: (p: ComponentProps<"li">) => <li className="leading-relaxed" {...p} />,
  blockquote: (p: ComponentProps<"blockquote">) => (
    <blockquote
      className="mb-4 border-l-2 border-edge pl-4 italic text-muted"
      {...p}
    />
  ),
  hr: (p: ComponentProps<"hr">) => <hr className="my-8 border-edge" {...p} />,
  pre: (p: ComponentProps<"pre">) => (
    <pre
      className="mb-5 overflow-x-auto rounded-xl border border-edge p-4 text-sm leading-relaxed"
      {...p}
    />
  ),
  code: ({ children, ...p }: ComponentProps<"code">) =>
    typeof children === "string" ? (
      <code
        className="rounded border border-edge bg-surface px-1.5 py-0.5 text-[0.85em] text-ink"
        {...p}
      >
        {children}
      </code>
    ) : (
      <code {...p}>{children}</code>
    ),
};
```

- [ ] **Step 4: Run the test** → PASS (3).

- [ ] **Step 5: Run all tests + build** → `pnpm test && pnpm run build` → green, EXIT 0.

- [ ] **Step 6: Commit**
```bash
git add -A
git commit -m "feat: add on-brand MDX components map for blog prose

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: PostCard + /blog list

**Files:** Create `src/components/blog/PostCard.tsx`, `src/app/blog/page.tsx`; Test `src/components/blog/__tests__/PostCard.test.tsx`, `src/app/blog/__tests__/page.test.tsx`.

- [ ] **Step 1: Write the failing PostCard test** — `src/components/blog/__tests__/PostCard.test.tsx`
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PostCard } from "@/components/blog/PostCard";
import type { PostMeta } from "@/lib/blog";

const post: PostMeta = {
  slug: "demo-post",
  title: "Demo Post",
  date: "2026-05-20",
  excerpt: "A short summary.",
  tags: ["AI"],
  readingMinutes: 4,
};

describe("PostCard", () => {
  it("links the title to the post and shows meta", () => {
    render(<PostCard post={post} />);
    expect(screen.getByRole("link", { name: "Demo Post" })).toHaveAttribute(
      "href",
      "/blog/demo-post",
    );
    expect(screen.getByText("A short summary.")).toBeInTheDocument();
    expect(screen.getByText("AI")).toBeInTheDocument();
    expect(screen.getByText(/min read/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it** → FAIL (cannot resolve `@/components/blog/PostCard`).

- [ ] **Step 3: Implement PostCard** — `src/components/blog/PostCard.tsx`
```tsx
import Link from "next/link";
import type { PostMeta } from "@/lib/blog";
import { Tag } from "@/components/ui/Tag";

export function PostCard({ post }: { post: PostMeta }) {
  const dateLabel = new Date(post.date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return (
    <article className="relative border-t border-edge py-6 first:border-t-0 first:pt-0">
      <p className="text-xs text-muted">
        {dateLabel} · {post.readingMinutes} min read
      </p>
      <h2 className="mt-1 font-display text-xl font-bold text-ink">
        <Link
          href={`/blog/${post.slug}`}
          className="after:absolute after:inset-0 after:content-[''] hover:text-web focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web"
        >
          {post.title}
        </Link>
      </h2>
      <p className="mt-1.5 text-sm text-muted">{post.excerpt}</p>
      {post.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {post.tags.map((t) => (
            <Tag key={t}>{t}</Tag>
          ))}
        </div>
      )}
    </article>
  );
}
```

- [ ] **Step 4: Run the PostCard test** → PASS.

- [ ] **Step 5: Write the failing /blog list test** — `src/app/blog/__tests__/page.test.tsx`
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import BlogPage from "@/app/blog/page";
import { getAllPosts } from "@/lib/blog";

describe("/blog page", () => {
  it("renders the heading and a card per post", () => {
    render(<BlogPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Blog" }),
    ).toBeInTheDocument();
    for (const p of getAllPosts()) {
      expect(screen.getByRole("link", { name: p.title })).toHaveAttribute(
        "href",
        `/blog/${p.slug}`,
      );
    }
  });
});
```

- [ ] **Step 6: Run it** → FAIL (cannot resolve `@/app/blog/page`).

- [ ] **Step 7: Implement the list page** — `src/app/blog/page.tsx`
```tsx
import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { PostCard } from "@/components/blog/PostCard";
import { getAllPosts } from "@/lib/blog";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Notes on AI systems, distributed systems, and observability.",
};

export default function BlogPage() {
  const posts = getAllPosts();
  return (
    <Container className="py-20">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-web">
        Writing
      </p>
      <h1 className="mt-2 font-display text-4xl font-extrabold sm:text-5xl">
        Blog
      </h1>
      <p className="mt-3 max-w-xl text-muted">
        Notes on AI systems, distributed systems, observability — and the
        occasional bit about comedy.
      </p>
      {posts.length === 0 ? (
        <p className="mt-10 text-muted">No posts yet.</p>
      ) : (
        <div className="mt-8 flex flex-col">
          {posts.map((p) => (
            <PostCard key={p.slug} post={p} />
          ))}
        </div>
      )}
    </Container>
  );
}
```

- [ ] **Step 8: Run all tests + build** → `pnpm test && pnpm run build` → green, EXIT 0.

- [ ] **Step 9: Commit**
```bash
git add -A
git commit -m "feat: add PostCard and /blog list page

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: /blog/[slug] post page

The post page renders MDX with `compileMDX` + `rehype-pretty-code`. Pages are fully static (`generateStaticParams` + `dynamicParams = false`). The unit test **mocks the MDX libraries** so Shiki never loads under jsdom; real MDX rendering is verified by `pnpm run build`.

**Files:** Create `src/app/blog/[slug]/page.tsx`; Test `src/app/blog/[slug]/__tests__/page.test.tsx`.

- [ ] **Step 1: Write the failing test** — `src/app/blog/[slug]/__tests__/page.test.tsx`
```tsx
import { describe, it, expect, vi } from "vitest";
import { getAllPosts, getPostSlugs } from "@/lib/blog";

// Keep Shiki/MDX out of the test runtime — rendering is verified by the build.
vi.mock("next-mdx-remote/rsc", () => ({
  compileMDX: vi.fn(async () => ({ content: null })),
}));
vi.mock("rehype-pretty-code", () => ({ default: () => () => {} }));
vi.mock("remark-gfm", () => ({ default: () => () => {} }));

import PostPage, {
  generateStaticParams,
  generateMetadata,
} from "@/app/blog/[slug]/page";

const sample = getAllPosts()[0];

describe("/blog/[slug] page", () => {
  it("generateStaticParams returns every slug", () => {
    expect(generateStaticParams()).toEqual(
      getPostSlugs().map((slug) => ({ slug })),
    );
  });

  it("generateMetadata sets the post title and description", async () => {
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: sample.slug }),
    });
    expect(meta.title).toBe(sample.title);
    expect(meta.description).toBe(sample.excerpt);
  });

  it("calls notFound for an unknown slug (throws)", async () => {
    await expect(
      PostPage({ params: Promise.resolve({ slug: "nope-not-real" }) }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run it** → `pnpm exec vitest run "src/app/blog/[slug]/__tests__/page.test.tsx"` → FAIL (cannot resolve `@/app/blog/[slug]/page`).

- [ ] **Step 3: Implement the post page** — `src/app/blog/[slug]/page.tsx`
```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { compileMDX } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import rehypePrettyCode, {
  type Options as PrettyCodeOptions,
} from "rehype-pretty-code";
import { Container } from "@/components/ui/Container";
import { Tag } from "@/components/ui/Tag";
import { getPost, getPostSlugs } from "@/lib/blog";
import { mdxComponents } from "@/components/blog/mdx-components";

const prettyCodeOptions: PrettyCodeOptions = {
  theme: "github-dark",
  keepBackground: true,
};

// Only prerendered slugs exist; unknown paths 404 without runtime rendering.
export const dynamicParams = false;

export function generateStaticParams() {
  return getPostSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return {};
  return { title: post.meta.title, description: post.meta.excerpt };
}

function accentedTitle(title: string) {
  const parts = title.split(" ");
  if (parts.length < 2) return title;
  const last = parts[parts.length - 1];
  const rest = parts.slice(0, -1).join(" ");
  return (
    <>
      {rest} <span className="text-spidey">{last}</span>
    </>
  );
}

export default async function PostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  const { content } = await compileMDX({
    source: post.body,
    components: mdxComponents,
    options: {
      mdxOptions: {
        remarkPlugins: [remarkGfm],
        rehypePlugins: [[rehypePrettyCode, prettyCodeOptions]],
      },
    },
  });

  const dateLabel = new Date(post.meta.date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <Container className="py-16">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/blog"
          className="rounded text-sm text-muted hover:text-web focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web"
        >
          ← Back to blog
        </Link>
        <p className="mt-6 text-xs font-medium uppercase tracking-[0.2em] text-web">
          {dateLabel} · {post.meta.readingMinutes} min read
        </p>
        <h1 className="mt-2 font-display text-4xl font-extrabold sm:text-5xl">
          {accentedTitle(post.meta.title)}
        </h1>
        {post.meta.tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {post.meta.tags.map((t) => (
              <Tag key={t}>{t}</Tag>
            ))}
          </div>
        )}
        <div className="mt-8">{content}</div>
      </div>
    </Container>
  );
}
```

- [ ] **Step 4: Run the post-page test** → PASS (3).

- [ ] **Step 5: Run all tests + build** → `pnpm test && pnpm run build`
Expect: all tests pass; build "Compiled successfully", EXIT 0. The route table lists `/blog/[slug]` as **SSG** with both sample slugs prerendered (this is where real MDX + Shiki highlighting is verified). If the build fails on the MDX/Shiki step, fix it here (e.g., a theme name typo) — do not mock anything in the build.

- [ ] **Step 6: Commit**
```bash
git add -A
git commit -m "feat: add /blog/[slug] post page with MDX + syntax highlighting

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Nav link, README, final verification

**Files:** Modify `src/lib/site.ts`, `README.md`.

- [ ] **Step 1: Add the Blog nav item** — in `src/lib/site.ts`, change the `nav` array to:
```ts
  nav: [
    { label: "Experience", href: "/#experience" },
    { label: "Projects", href: "/#projects" },
    { label: "About", href: "/#about" },
    { label: "Comedy", href: "/#comedy" },
    { label: "Blog", href: "/blog" },
  ] as NavItem[],
```
(Read site.ts first; change ONLY the `nav` array. "Blog" is a route link — the active-section hook ignores it since it has no `#`.)

- [ ] **Step 2: Update the "Content to personalize" list in `README.md`** — add a blog bullet so that section reads:
```markdown
## Content to personalize

- `src/data/experience.ts` — your roles and accomplishments.
- `src/data/projects.ts` — your projects (slug, summary, tags, stack, links); add screenshots under `public/images/projects/` and reference them in each project's `images` array.
- `src/data/about.ts` — your bio, Turing caption/photo, and fun-fact chips (photo under `public/images/about/`).
- `src/data/comedy.ts` — stand-up clips (YouTube IDs) and photos (under `public/images/comedy/`).
- `content/blog/*.mdx` — blog posts (frontmatter: title, date, excerpt, tags; body in MDX with fenced code blocks).
- `public/resume.pdf` — your résumé.
- `src/lib/site.ts` — name, tagline, role, and social links.
```
(If the existing list differs slightly, preserve the existing bullets and add the `content/blog/*.mdx` one.)

- [ ] **Step 3: Final verification** → `pnpm test && pnpm run build`
Expect: all tests pass; build EXIT 0; route table includes `/blog` (static) and `/blog/[slug]` (SSG, one entry per sample post), alongside the existing routes.

- [ ] **Step 4: Commit**
```bash
git add -A
git commit -m "feat: add Blog to nav; document posts in README

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Done criteria for Plan 4

- `pnpm run build` succeeds; `pnpm test` green.
- `/blog` lists posts (newest first) as stacked cards (date · reading time, title, excerpt, tags); empty state when none.
- `/blog/[slug]` renders the post with on-brand prose and **build-time Shiki-highlighted code**; unknown slugs 404.
- Header nav includes "Blog" → `/blog`.
- Pages are fully static (no runtime fs/MDX) — safe in the standalone container.

## Manual verification (after implementation)

```bash
pnpm dev
```
At `http://localhost:3000`:
- [ ] "Blog" nav link → `/blog`; the list shows both sample posts.
- [ ] Opening a post shows highlighted code, styled headings/paragraphs/inline code, and a "← Back to blog" link.
- [ ] `/blog/does-not-exist` → themed 404.

## Personalize later (owner)
- Replace/add posts in `content/blog/*.mdx` (frontmatter + MDX body). Filenames become slugs.
