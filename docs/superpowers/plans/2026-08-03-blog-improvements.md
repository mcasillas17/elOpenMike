# elOpenMike — Plan B: Blog Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the blog gaps from the 2026-08-03 site audit — no feed, no tag pages, no heading anchors, no homepage surface, no prev/next navigation, and a string-comparison date sort.

**Architecture:** All changes are additive to the existing filesystem-backed blog. `src/lib/blog.ts` gains four query helpers (`getAllTags`, `getPostsByTag`, `getAdjacentPosts`, plus `updated` on `PostMeta`); everything else is new routes and components composed from the existing design system. Nothing here depends on Plan A, and Plan A does not depend on this.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, `rehype-slug`, `rehype-autolink-headings`, Vitest + React Testing Library, Playwright. Package manager: **pnpm**.

**Spec:** `docs/superpowers/specs/2026-08-03-notion-blog-pipeline-design.md` (§9.1–§9.5, §9.7)

## Global Constraints

- Run all commands from the repo root with absolute paths; cwd does not persist between Bash calls.
- Single test: `pnpm exec vitest run <path>`. All tests: `pnpm test`. E2E: `pnpm e2e`. Build: `pnpm run build`. Lint: `pnpm lint`.
- **Vitest only collects `src/**/*.test.{ts,tsx}`** (`vitest.config.mts`).
- New deps install under the 7-day `minimumReleaseAge` cooldown in `pnpm-workspace.yaml`; `pnpm add` auto-selects a version older than 7 days. Neither new dep needs a build script, so `allowBuilds` is unchanged.
- Reuse the design system: `Section`, `Container`, `Tag`, `LinkButton`, tokens `bg-canvas`/`bg-surface`/`border-edge`/`text-spidey`/`text-web`/`text-web-strong`/`text-muted`/`text-ink`, `font-display`/`font-body`. NEVER use `font-[family-name:...]`.
- Never hardcode `/blog`, `/blog/${slug}`, or the origin — use `routes` and `absoluteUrl` from `@/lib/site`.
- Commits: Conventional Commits ending with:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  ```

---

## File Structure

```
src/lib/
  blog.ts                              # MODIFY: updated field, date sort, tag + adjacency queries
  site.ts                              # MODIFY: routes.blogTag, routes.feed, nav entry
  __tests__/blog.test.ts               # MODIFY: cases for the new helpers
src/app/
  feed.xml/route.ts                    # CREATE: RSS 2.0 feed
  __tests__/feed.test.ts               # CREATE
  blog/tag/[slug]/page.tsx             # CREATE: per-tag listing
  blog/tag/[slug]/__tests__/page.test.tsx  # CREATE
  blog/[slug]/page.tsx                 # MODIFY: rehype plugins, PostNav, linked tags
  layout.tsx                           # MODIFY: feed alternates
  page.tsx                             # MODIFY: mount the Writing section
  sitemap.ts                           # MODIFY: tag pages
  globals.css                          # MODIFY: scroll-margin for heading anchors
src/components/
  blog/PostCard.tsx                    # MODIFY: link the tag chips
  blog/PostNav.tsx                     # CREATE: prev/next navigation
  blog/__tests__/PostNav.test.tsx      # CREATE
  sections/Writing.tsx                 # CREATE: homepage latest-posts section
  sections/__tests__/Writing.test.tsx  # CREATE
  seo/ArticleJsonLd.tsx                # MODIFY: dateModified from updated
  layout/Footer.tsx                    # MODIFY: feed link
e2e/blog.spec.ts                       # CREATE: feed, tag nav, anchors
```

---

### Task 1: Blog loader — `updated`, correct date sorting, tag and adjacency queries

**Files:**
- Modify: `src/lib/blog.ts`
- Modify: `src/lib/__tests__/blog.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `PostMeta.updated?: string`; `getAllTags(): { name: string; slug: string; count: number }[]`; `getPostsByTag(tagSlug: string): PostMeta[]`; `getAdjacentPosts(slug: string): { prev?: PostMeta; next?: PostMeta }`; `tagSlug(name: string): string`.

**Why the sort change (spec §9.7):** `getAllPosts` currently sorts with `a.date < b.date`, a string comparison that only works because every date happens to be `YYYY-MM-DD`. Any other format silently mis-sorts.

**Adjacency convention:** posts are newest-first, so `prev` is the **newer** neighbour (earlier in the list) and `next` is the **older** one. This matches "← Previous / Next →" reading order on the page.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/__tests__/blog.test.ts`:

```ts
import {
  getAllTags,
  getPostsByTag,
  getAdjacentPosts,
  tagSlug,
} from "@/lib/blog";

describe("tagSlug", () => {
  it("lowercases and hyphenates tag names", () => {
    expect(tagSlug("Distributed Systems")).toBe("distributed-systems");
    expect(tagSlug("AI")).toBe("ai");
  });
});

describe("getAllTags", () => {
  it("returns each distinct tag once with a count", () => {
    const tags = getAllTags();
    expect(tags.length).toBeGreaterThan(0);
    const slugs = tags.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const tag of tags) {
      expect(tag.count).toBeGreaterThan(0);
      expect(tag.slug).toBe(tagSlug(tag.name));
    }
  });

  it("sorts tags alphabetically for stable output", () => {
    const slugs = getAllTags().map((t) => t.slug);
    expect(slugs).toEqual([...slugs].sort());
  });
});

describe("getPostsByTag", () => {
  it("returns only posts carrying that tag, newest first", () => {
    const tag = getAllTags()[0];
    const posts = getPostsByTag(tag.slug);
    expect(posts.length).toBe(tag.count);
    for (const post of posts) {
      expect(post.tags.map(tagSlug)).toContain(tag.slug);
    }
    for (let i = 1; i < posts.length; i++) {
      expect(new Date(posts[i - 1].date).getTime()).toBeGreaterThanOrEqual(
        new Date(posts[i].date).getTime(),
      );
    }
  });

  it("returns an empty array for an unknown tag", () => {
    expect(getPostsByTag("no-such-tag")).toEqual([]);
  });
});

describe("getAdjacentPosts", () => {
  it("gives the newest post no prev and the oldest no next", () => {
    const posts = getAllPosts();
    expect(getAdjacentPosts(posts[0].slug).prev).toBeUndefined();
    expect(getAdjacentPosts(posts[posts.length - 1].slug).next).toBeUndefined();
  });

  it("links neighbours consistently in both directions", () => {
    const posts = getAllPosts();
    for (let i = 1; i < posts.length; i++) {
      expect(getAdjacentPosts(posts[i].slug).prev?.slug).toBe(posts[i - 1].slug);
      expect(getAdjacentPosts(posts[i - 1].slug).next?.slug).toBe(posts[i].slug);
    }
  });

  it("returns empty for an unknown slug", () => {
    expect(getAdjacentPosts("nope-not-real")).toEqual({});
  });
});

describe("date sorting", () => {
  it("orders by parsed timestamp, not string comparison", () => {
    const posts = getAllPosts();
    for (let i = 1; i < posts.length; i++) {
      expect(new Date(posts[i - 1].date).getTime()).toBeGreaterThanOrEqual(
        new Date(posts[i].date).getTime(),
      );
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/lib/__tests__/blog.test.ts`
Expected: FAIL — `getAllTags`, `getPostsByTag`, `getAdjacentPosts`, `tagSlug` are not exported.

- [ ] **Step 3: Update `src/lib/blog.ts`**

Change the `PostMeta` type to add `updated`:

```ts
export type PostMeta = {
  slug: string;
  title: string;
  date: string; // ISO
  excerpt: string;
  tags: string[];
  readingMinutes: number;
  updated?: string; // ISO; absent on posts that have never been revised
};
```

In `getPost`, add `updated` to the returned meta, immediately after `tags`:

```ts
    updated: data.updated ? String(data.updated) : undefined,
```

Replace the body of `getAllPosts` and append the new helpers:

```ts
// Invalid dates sort last rather than throwing. Synced posts are validated
// upstream, but the loader must not depend on that.
function timestamp(date: string): number {
  const value = new Date(date).getTime();
  return Number.isNaN(value) ? -Infinity : value;
}

export function getAllPosts(): PostMeta[] {
  return getPostSlugs()
    .map((slug) => getPost(slug)?.meta)
    .filter((m): m is PostMeta => m !== undefined)
    .sort((a, b) => timestamp(b.date) - timestamp(a.date));
}

// URL-safe form of a tag name. Kept here so routes and listings agree.
export function tagSlug(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getAllTags(): { name: string; slug: string; count: number }[] {
  const seen = new Map<string, { name: string; slug: string; count: number }>();
  for (const post of getAllPosts()) {
    for (const name of post.tags) {
      const slug = tagSlug(name);
      const existing = seen.get(slug);
      if (existing) existing.count += 1;
      else seen.set(slug, { name, slug, count: 1 });
    }
  }
  return [...seen.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}

export function getPostsByTag(slug: string): PostMeta[] {
  return getAllPosts().filter((post) => post.tags.map(tagSlug).includes(slug));
}

// Posts are newest-first, so `prev` is the newer neighbour and `next` the older
// one — matching "← Previous / Next →" reading order.
export function getAdjacentPosts(slug: string): {
  prev?: PostMeta;
  next?: PostMeta;
} {
  const posts = getAllPosts();
  const index = posts.findIndex((post) => post.slug === slug);
  if (index === -1) return {};
  return { prev: posts[index - 1], next: posts[index + 1] };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/lib/__tests__/blog.test.ts`
Expected: PASS — existing cases plus all new ones.

- [ ] **Step 5: Commit**

```bash
git add src/lib/blog.ts src/lib/__tests__/blog.test.ts
git commit -m "feat(blog): add tag and adjacency queries, fix date sorting

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Routes and `dateModified`

**Files:**
- Modify: `src/lib/site.ts`
- Modify: `src/components/seo/ArticleJsonLd.tsx`
- Test: `src/components/seo/__tests__/JsonLd.test.tsx`

**Interfaces:**
- Consumes: `PostMeta.updated` (Task 1).
- Produces: `routes.blogTag(slug: string): string`, `routes.feed: string`; `ArticleJsonLd` accepts an optional `updated` prop.

- [ ] **Step 1: Write the failing test**

Append to `src/components/seo/__tests__/JsonLd.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { ArticleJsonLd } from "@/components/seo/ArticleJsonLd";

function parseJsonLd(container: HTMLElement): Record<string, unknown> {
  const script = container.querySelector('script[type="application/ld+json"]');
  return JSON.parse(script?.innerHTML ?? "{}");
}

describe("ArticleJsonLd dateModified", () => {
  const base = {
    slug: "a-post",
    title: "A post",
    description: "Summary.",
    date: "2026-05-20",
    tags: ["AI"],
  };

  it("uses updated for dateModified when present", () => {
    const { container } = render(
      <ArticleJsonLd {...base} updated="2026-06-01" />,
    );
    const data = parseJsonLd(container);
    expect(data.datePublished).toBe("2026-05-20");
    expect(data.dateModified).toBe("2026-06-01");
  });

  it("falls back to the published date when updated is absent", () => {
    const { container } = render(<ArticleJsonLd {...base} />);
    const data = parseJsonLd(container);
    expect(data.dateModified).toBe("2026-05-20");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/components/seo/__tests__/JsonLd.test.tsx`
Expected: FAIL — `dateModified` is always the published date.

- [ ] **Step 3: Add the routes**

In `src/lib/site.ts`, inside the `routes` object after `blogPost`:

```ts
  blogTag: (slug: string) => `/blog/tag/${slug}`,
  feed: "/feed.xml",
```

- [ ] **Step 4: Update `ArticleJsonLd`**

In `src/components/seo/ArticleJsonLd.tsx`, add `updated` to the props type and use it:

```tsx
export function ArticleJsonLd({
  slug,
  title,
  description,
  date,
  tags,
  updated,
}: {
  slug: string;
  title: string;
  description: string;
  date: string;
  tags: string[];
  updated?: string;
}) {
```

and change the `dateModified` line to:

```tsx
    dateModified: updated ?? date,
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run src/components/seo/__tests__/JsonLd.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/site.ts src/components/seo/ArticleJsonLd.tsx src/components/seo/__tests__/JsonLd.test.tsx
git commit -m "feat(seo): add tag and feed routes, honor updated in JSON-LD

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: RSS feed (spec §9.1)

**Files:**
- Create: `src/app/feed.xml/route.ts`
- Create: `src/app/__tests__/feed.test.ts`
- Modify: `src/app/layout.tsx`
- Modify: `src/components/layout/Footer.tsx`
- Modify: `src/app/robots.ts`

**Interfaces:**
- Consumes: `getAllPosts` (Task 1), `routes.feed` (Task 2).
- Produces: `GET(): Response` at `/feed.xml`, and `buildFeedXml(posts: PostMeta[]): string` exported for testing.

**Static rendering:** the route sets `dynamic = "force-static"` so it is prerendered into the container like every other route, keeping the site fully static.

- [ ] **Step 1: Write the failing test**

```ts
// src/app/__tests__/feed.test.ts
import { describe, it, expect } from "vitest";
import { buildFeedXml } from "@/app/feed.xml/route";
import { getAllPosts } from "@/lib/blog";

describe("buildFeedXml", () => {
  const xml = () => buildFeedXml(getAllPosts());

  it("declares an RSS 2.0 channel with the atom self link", () => {
    const out = xml();
    expect(out.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(out).toContain('<rss version="2.0"');
    expect(out).toContain('xmlns:atom="http://www.w3.org/2005/Atom"');
    expect(out).toContain(
      '<atom:link href="https://elopenmike.com/feed.xml" rel="self" type="application/rss+xml"/>',
    );
  });

  it("emits one item per post with an absolute link and guid", () => {
    const posts = getAllPosts();
    const out = xml();
    expect(out.split("<item>").length - 1).toBe(posts.length);
    for (const post of posts) {
      const url = `https://elopenmike.com/blog/${post.slug}`;
      expect(out).toContain(`<link>${url}</link>`);
      expect(out).toContain(`<guid isPermaLink="true">${url}</guid>`);
    }
  });

  it("formats pubDate as RFC 822", () => {
    const out = xml();
    const match = out.match(/<pubDate>([^<]+)<\/pubDate>/);
    expect(match).not.toBeNull();
    expect(match![1]).toMatch(/^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} /);
  });

  it("escapes XML-significant characters in titles and descriptions", () => {
    const out = buildFeedXml([
      {
        slug: "x",
        title: "A & B <tag>",
        date: "2026-05-20",
        excerpt: 'He said "hi"',
        tags: [],
        readingMinutes: 1,
      },
    ]);
    expect(out).toContain("<title>A &amp; B &lt;tag&gt;</title>");
    expect(out).toContain("<description>He said &quot;hi&quot;</description>");
    expect(out).not.toContain("<tag>");
  });

  it("handles an empty post list without emitting items", () => {
    const out = buildFeedXml([]);
    expect(out).toContain("<channel>");
    expect(out).not.toContain("<item>");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/app/__tests__/feed.test.ts`
Expected: FAIL — cannot resolve `@/app/feed.xml/route`.

- [ ] **Step 3: Write the route**

```ts
// src/app/feed.xml/route.ts
import { getAllPosts, type PostMeta } from "@/lib/blog";
import { site, absoluteUrl, routes } from "@/lib/site";

// Prerendered with every other route so the site stays fully static.
export const dynamic = "force-static";

const FEED_TITLE = `${site.name} — Blog`;
const FEED_DESCRIPTION =
  "Notes on AI systems, distributed systems, and observability.";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// RSS requires RFC 822 dates. Post dates are date-only, so pin them to UTC
// midnight rather than letting the runtime's zone shift them a day.
function rfc822(date: string): string {
  return new Date(`${date}T00:00:00Z`).toUTCString();
}

export function buildFeedXml(posts: PostMeta[]): string {
  const items = posts
    .map((post) => {
      const url = absoluteUrl(routes.blogPost(post.slug));
      return [
        "    <item>",
        `      <title>${escapeXml(post.title)}</title>`,
        `      <link>${url}</link>`,
        `      <guid isPermaLink="true">${url}</guid>`,
        `      <pubDate>${rfc822(post.date)}</pubDate>`,
        `      <description>${escapeXml(post.excerpt)}</description>`,
        ...post.tags.map((tag) => `      <category>${escapeXml(tag)}</category>`),
        "    </item>",
      ].join("\n");
    })
    .join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${escapeXml(FEED_TITLE)}</title>`,
    `    <link>${absoluteUrl(routes.blog)}</link>`,
    `    <description>${escapeXml(FEED_DESCRIPTION)}</description>`,
    "    <language>en-us</language>",
    `    <atom:link href="${absoluteUrl(routes.feed)}" rel="self" type="application/rss+xml"/>`,
    items,
    "  </channel>",
    "</rss>",
    "",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export function GET(): Response {
  return new Response(buildFeedXml(getAllPosts()), {
    headers: { "content-type": "application/rss+xml; charset=utf-8" },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/app/__tests__/feed.test.ts`
Expected: PASS — all 5 cases green.

- [ ] **Step 5: Advertise the feed**

In `src/app/layout.tsx`, add to the exported `metadata` object's `alternates`:

```ts
    types: {
      "application/rss+xml": [{ url: routes.feed, title: `${site.name} — Blog` }],
    },
```

(If `alternates` does not exist on `metadata`, add it as `alternates: { types: { ... } }`. Import `routes` and `site` from `@/lib/site` if not already imported.)

In `src/components/layout/Footer.tsx`, add an RSS link beside the existing links:

```tsx
        <a
          href={routes.feed}
          className="rounded hover:text-web-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web"
        >
          RSS
        </a>
```

In `src/app/robots.ts`, no change is needed — the sitemap reference already covers discovery.

- [ ] **Step 6: Verify the build prerenders it**

Run: `pnpm run build`
Expected: build succeeds and the route list shows `/feed.xml` as static (`○`). Then `pnpm exec vitest run src/components/layout/__tests__/Footer.test.tsx` to confirm the footer test still passes.

- [ ] **Step 7: Commit**

```bash
git add src/app/feed.xml/route.ts src/app/__tests__/feed.test.ts src/app/layout.tsx src/components/layout/Footer.tsx
git commit -m "feat(blog): add an RSS 2.0 feed at /feed.xml

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Tag pages and clickable tags (spec §9.3)

**Files:**
- Create: `src/app/blog/tag/[slug]/page.tsx`
- Create: `src/app/blog/tag/[slug]/__tests__/page.test.tsx`
- Modify: `src/components/blog/PostCard.tsx`
- Modify: `src/app/blog/[slug]/page.tsx`
- Modify: `src/app/sitemap.ts`
- Modify: `src/app/__tests__/sitemap.test.ts`

**Interfaces:**
- Consumes: `getAllTags`, `getPostsByTag`, `tagSlug` (Task 1); `routes.blogTag` (Task 2).
- Produces: the `/blog/tag/[slug]` route. No new exports.

- [ ] **Step 1: Write the failing test**

```tsx
// src/app/blog/tag/[slug]/__tests__/page.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import TagPage, { generateStaticParams, generateMetadata } from "@/app/blog/tag/[slug]/page";
import { getAllTags, getPostsByTag } from "@/lib/blog";

describe("tag page", () => {
  it("generates a param for every distinct tag", async () => {
    const params = await generateStaticParams();
    expect(params.map((p) => p.slug).sort()).toEqual(
      getAllTags().map((t) => t.slug).sort(),
    );
  });

  it("sets a canonical url and a tag-specific title", async () => {
    const tag = getAllTags()[0];
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: tag.slug }),
    });
    expect(metadata.title).toContain(tag.name);
    expect(metadata.alternates?.canonical).toBe(`/blog/tag/${tag.slug}`);
  });

  it("lists every post carrying the tag", async () => {
    const tag = getAllTags()[0];
    render(await TagPage({ params: Promise.resolve({ slug: tag.slug }) }));
    expect(
      screen.getByRole("heading", { level: 1, name: new RegExp(tag.name, "i") }),
    ).toBeInTheDocument();
    for (const post of getPostsByTag(tag.slug)) {
      expect(screen.getByText(post.title)).toBeInTheDocument();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/app/blog/tag/[slug]/__tests__/page.test.tsx`
Expected: FAIL — cannot resolve `@/app/blog/tag/[slug]/page`.

- [ ] **Step 3: Write the tag page**

```tsx
// src/app/blog/tag/[slug]/page.tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { PostCard } from "@/components/blog/PostCard";
import { getAllTags, getPostsByTag } from "@/lib/blog";
import { routes } from "@/lib/site";

export const dynamicParams = false;

export function generateStaticParams() {
  return getAllTags().map((tag) => ({ slug: tag.slug }));
}

function tagName(slug: string): string | undefined {
  return getAllTags().find((tag) => tag.slug === slug)?.name;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const name = tagName(slug);
  if (!name) return {};
  return {
    title: `${name} — Blog`,
    description: `Posts tagged ${name}.`,
    alternates: { canonical: routes.blogTag(slug) },
  };
}

export default async function TagPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const name = tagName(slug);
  if (!name) notFound();

  const posts = getPostsByTag(slug);

  return (
    <Container className="py-20">
      <Link
        href={routes.blog}
        className="rounded text-sm text-muted hover:text-web-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web"
      >
        ← All posts
      </Link>
      <p className="mt-6 text-xs font-medium uppercase tracking-[0.2em] text-web-strong">
        Tagged
      </p>
      <h1 className="mt-2 font-display text-4xl font-extrabold sm:text-5xl">
        {name}
      </h1>
      <p className="mt-3 text-muted">
        {posts.length} {posts.length === 1 ? "post" : "posts"}
      </p>
      <div className="mt-8 flex flex-col">
        {posts.map((post) => (
          <PostCard key={post.slug} post={post} />
        ))}
      </div>
    </Container>
  );
}
```

- [ ] **Step 4: Link the tag chips**

In `src/components/blog/PostCard.tsx`, import `tagSlug` and `Link`, then replace the tag chip block:

```tsx
      {post.tags.length > 0 && (
        <div className="relative z-10 mt-3 flex flex-wrap gap-1.5">
          {post.tags.map((t) => (
            <Link
              key={t}
              href={routes.blogTag(tagSlug(t))}
              className="rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web"
            >
              <Tag>{t}</Tag>
            </Link>
          ))}
        </div>
      )}
```

The `relative z-10` lifts the chips above the card's stretched link (`after:absolute after:inset-0` on the title link), so tag clicks are not swallowed by it.

In `src/app/blog/[slug]/page.tsx`, wrap the post header's tags the same way:

```tsx
            {post.meta.tags.map((t) => (
              <Link
                key={t}
                href={routes.blogTag(tagSlug(t))}
                className="rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web"
              >
                <Tag>{t}</Tag>
              </Link>
            ))}
```

Import `tagSlug` from `@/lib/blog` in both files.

- [ ] **Step 5: Add tag pages to the sitemap**

In `src/app/sitemap.ts`, import `getAllTags` and add after the projects loop:

```ts
  for (const tag of getAllTags()) {
    entries.push({
      url: absoluteUrl(routes.blogTag(tag.slug)),
      lastModified: siteUpdated,
    });
  }
```

Append to `src/app/__tests__/sitemap.test.ts`:

```ts
  it("includes a url for every tag page", () => {
    const urls = sitemap().map((e) => e.url);
    for (const tag of getAllTags()) {
      expect(urls).toContain(`https://elopenmike.com/blog/tag/${tag.slug}`);
    }
  });
```

with `getAllTags` added to the existing `@/lib/blog` import.

- [ ] **Step 6: Run the tests**

Run: `pnpm exec vitest run src/app/blog/tag src/app/__tests__/sitemap.test.ts src/components/blog/__tests__/PostCard.test.tsx`
Expected: PASS — all suites green.

- [ ] **Step 7: Commit**

```bash
git add src/app/blog/tag src/components/blog/PostCard.tsx src/app/blog/\[slug\]/page.tsx src/app/sitemap.ts src/app/__tests__/sitemap.test.ts
git commit -m "feat(blog): add tag pages and make tag chips navigable

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Heading anchors and prev/next navigation (spec §9.4)

**Files:**
- Modify: `package.json` (add `rehype-slug`, `rehype-autolink-headings`)
- Create: `src/components/blog/PostNav.tsx`
- Create: `src/components/blog/__tests__/PostNav.test.tsx`
- Modify: `src/app/blog/[slug]/page.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `getAdjacentPosts` (Task 1).
- Produces: `<PostNav prev={...} next={...} />`.

- [ ] **Step 1: Install the rehype plugins**

```bash
pnpm add rehype-slug rehype-autolink-headings
```

Expected: both resolve to releases older than 7 days. Neither needs a build script.

- [ ] **Step 2: Write the failing test**

```tsx
// src/components/blog/__tests__/PostNav.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PostNav } from "@/components/blog/PostNav";
import type { PostMeta } from "@/lib/blog";

const post = (slug: string, title: string): PostMeta => ({
  slug,
  title,
  date: "2026-05-20",
  excerpt: "Summary.",
  tags: [],
  readingMinutes: 3,
});

describe("PostNav", () => {
  it("links both neighbours with their titles", () => {
    render(
      <PostNav prev={post("newer", "Newer post")} next={post("older", "Older post")} />,
    );
    expect(screen.getByRole("link", { name: /Newer post/ })).toHaveAttribute(
      "href",
      "/blog/newer",
    );
    expect(screen.getByRole("link", { name: /Older post/ })).toHaveAttribute(
      "href",
      "/blog/older",
    );
  });

  it("renders only the side that exists", () => {
    render(<PostNav next={post("older", "Older post")} />);
    expect(screen.queryByText(/Previous/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Older post/ })).toBeInTheDocument();
  });

  it("renders nothing when there are no neighbours", () => {
    const { container } = render(<PostNav />);
    expect(container).toBeEmptyDOMElement();
  });

  it("is labelled for assistive tech", () => {
    render(<PostNav prev={post("newer", "Newer post")} />);
    expect(
      screen.getByRole("navigation", { name: /more posts/i }),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm exec vitest run src/components/blog/__tests__/PostNav.test.tsx`
Expected: FAIL — cannot resolve `@/components/blog/PostNav`.

- [ ] **Step 4: Write `PostNav`**

```tsx
// src/components/blog/PostNav.tsx
import Link from "next/link";
import type { PostMeta } from "@/lib/blog";
import { routes } from "@/lib/site";

// Posts are newest-first, so `prev` is the newer neighbour and `next` the older.
export function PostNav({ prev, next }: { prev?: PostMeta; next?: PostMeta }) {
  if (!prev && !next) return null;

  return (
    <nav
      aria-label="More posts"
      className="mt-16 grid gap-4 border-t border-edge pt-8 sm:grid-cols-2"
    >
      {prev && (
        <Link
          href={routes.blogPost(prev.slug)}
          className="rounded-xl border border-edge p-4 hover:border-web focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web"
        >
          <span className="text-xs uppercase tracking-[0.2em] text-muted">
            ← Previous
          </span>
          <span className="mt-1 block font-display font-bold text-ink">
            {prev.title}
          </span>
        </Link>
      )}
      {next && (
        <Link
          href={routes.blogPost(next.slug)}
          className="rounded-xl border border-edge p-4 hover:border-web focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web sm:col-start-2 sm:text-right"
        >
          <span className="text-xs uppercase tracking-[0.2em] text-muted">
            Next →
          </span>
          <span className="mt-1 block font-display font-bold text-ink">
            {next.title}
          </span>
        </Link>
      )}
    </nav>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run src/components/blog/__tests__/PostNav.test.tsx`
Expected: PASS — all 4 cases green.

- [ ] **Step 6: Wire the post page**

In `src/app/blog/[slug]/page.tsx`, add imports:

```tsx
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import { PostNav } from "@/components/blog/PostNav";
import { getAdjacentPosts } from "@/lib/blog";
```

Replace the `rehypePlugins` array. Order matters: `rehype-slug` must add the `id` before `rehype-autolink-headings` can link to it.

```tsx
        rehypePlugins: [
          rehypeSlug,
          [
            rehypeAutolinkHeadings,
            {
              behavior: "append",
              properties: {
                className: "heading-anchor",
                "aria-label": "Link to this section",
              },
              content: { type: "text", value: "#" },
            },
          ],
          [rehypePrettyCode, prettyCodeOptions],
        ],
```

Pass `updated` to the JSON-LD component:

```tsx
          updated={post.meta.updated}
```

And render the nav after the article body:

```tsx
        <div className="mt-8">{content}</div>
        <PostNav {...getAdjacentPosts(slug)} />
```

- [ ] **Step 7: Style the anchors**

Append to `src/app/globals.css`:

```css
/* Heading anchors: hidden until the heading is hovered or the link is focused,
   so they never clutter the prose but stay keyboard-reachable. */
.heading-anchor {
  margin-left: 0.35rem;
  opacity: 0;
  text-decoration: none;
  color: var(--color-muted);
  transition: opacity 150ms ease;
}

h2:hover > .heading-anchor,
h3:hover > .heading-anchor,
h4:hover > .heading-anchor,
.heading-anchor:focus-visible {
  opacity: 1;
}

/* Keep a linked heading clear of the sticky header when jumped to. */
h2[id],
h3[id],
h4[id] {
  scroll-margin-top: 5rem;
}
```

- [ ] **Step 8: Verify the build and the post page test**

Run: `pnpm exec vitest run src/app/blog/\[slug\]/__tests__/page.test.tsx && pnpm run build`
Expected: both pass. Then `pnpm dev`, open a post, and confirm hovering a heading reveals a `#` that navigates to that section.

- [ ] **Step 9: Commit**

```bash
git add package.json pnpm-lock.yaml src/components/blog/PostNav.tsx src/components/blog/__tests__/PostNav.test.tsx src/app/blog/\[slug\]/page.tsx src/app/globals.css
git commit -m "feat(blog): add heading anchors and prev/next navigation

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Homepage "Latest writing" section (spec §9.2)

**Files:**
- Create: `src/components/sections/Writing.tsx`
- Create: `src/components/sections/__tests__/Writing.test.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/lib/site.ts`
- Modify: `src/app/__tests__/page.test.tsx`

**Interfaces:**
- Consumes: `getAllPosts` (Task 1), `PostCard`, `Section`, `LinkButton`.
- Produces: `<Writing />`, mounted on the homepage at `#writing`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/sections/__tests__/Writing.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Writing } from "@/components/sections/Writing";
import { getAllPosts } from "@/lib/blog";

describe("Writing section", () => {
  it("renders at most the three most recent posts", () => {
    render(<Writing />);
    const shown = getAllPosts().slice(0, 3);
    for (const post of shown) {
      expect(screen.getByText(post.title)).toBeInTheDocument();
    }
    for (const post of getAllPosts().slice(3)) {
      expect(screen.queryByText(post.title)).not.toBeInTheDocument();
    }
  });

  it("links to the full blog", () => {
    render(<Writing />);
    expect(screen.getByRole("link", { name: /read all posts/i })).toHaveAttribute(
      "href",
      "/blog",
    );
  });

  it("anchors the section for the nav", () => {
    const { container } = render(<Writing />);
    expect(container.querySelector("#writing")).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/components/sections/__tests__/Writing.test.tsx`
Expected: FAIL — cannot resolve `@/components/sections/Writing`.

- [ ] **Step 3: Write the section**

```tsx
// src/components/sections/Writing.tsx
import { Section } from "@/components/ui/Section";
import { LinkButton } from "@/components/ui/Button";
import { PostCard } from "@/components/blog/PostCard";
import { getAllPosts } from "@/lib/blog";
import { routes } from "@/lib/site";

const HOMEPAGE_POST_COUNT = 3;

export function Writing() {
  const posts = getAllPosts().slice(0, HOMEPAGE_POST_COUNT);
  if (posts.length === 0) return null;

  return (
    <Section id="writing" eyebrow="Writing" title="Latest posts">
      <div className="flex flex-col">
        {posts.map((post) => (
          <PostCard key={post.slug} post={post} />
        ))}
      </div>
      <div className="mt-8">
        <LinkButton href={routes.blog} variant="secondary">
          Read all posts →
        </LinkButton>
      </div>
    </Section>
  );
}
```

- [ ] **Step 4: Mount it on the homepage**

In `src/app/page.tsx`, add the import and place `<Writing />` between `<Projects />` and `<About />`:

```tsx
import { Writing } from "@/components/sections/Writing";
```

```tsx
      <Projects />
      <Writing />
      <About />
```

In `src/lib/site.ts`, add a nav entry between Projects and About:

```ts
    { label: "Writing", href: "/#writing" },
```

- [ ] **Step 5: Update the homepage test**

Append to `src/app/__tests__/page.test.tsx`:

```tsx
  it("surfaces the writing section", () => {
    const { container } = render(<Home />);
    expect(container.querySelector("#writing")).not.toBeNull();
  });
```

(Match the existing file's render helper and import name for the page component.)

- [ ] **Step 6: Run the tests**

Run: `pnpm exec vitest run src/components/sections/__tests__/Writing.test.tsx src/app/__tests__/page.test.tsx src/components/layout/__tests__/Header.test.tsx`
Expected: PASS — including the header test, which reads `site.nav`.

- [ ] **Step 7: Commit**

```bash
git add src/components/sections/Writing.tsx src/components/sections/__tests__/Writing.test.tsx src/app/page.tsx src/lib/site.ts src/app/__tests__/page.test.tsx
git commit -m "feat(home): surface the three most recent posts

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: End-to-end coverage

**Files:**
- Create: `e2e/blog.spec.ts`

**Interfaces:**
- Consumes: every route from Tasks 3–6.
- Produces: nothing consumed downstream.

- [ ] **Step 1: Write the spec**

```ts
// e2e/blog.spec.ts
import { test, expect } from "@playwright/test";

test("serves an RSS feed with at least one item", async ({ request }) => {
  const response = await request.get("/feed.xml");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("application/rss+xml");

  const body = await response.text();
  expect(body).toContain("<rss version=\"2.0\"");
  expect(body).toContain("<item>");
});

test("a tag chip navigates to its tag page", async ({ page }) => {
  await page.goto("/blog");
  const chip = page.locator('a[href^="/blog/tag/"]').first();
  const label = (await chip.innerText()).trim();
  await chip.click();
  await expect(page).toHaveURL(/\/blog\/tag\//);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(label);
});

test("heading anchors deep-link into a post", async ({ page }) => {
  await page.goto("/blog");
  await page.locator('article h2 a').first().click();
  await expect(page).toHaveURL(/\/blog\/[^/]+$/);

  const heading = page.locator("h2[id]").first();
  await expect(heading).toBeVisible();

  const id = await heading.getAttribute("id");
  await page.goto(`${page.url().split("#")[0]}#${id}`);
  await expect(page.locator(`h2#${id}`)).toBeInViewport();
});

test("the homepage links to the blog from the writing section", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#writing")).toBeVisible();
  await page.getByRole("link", { name: /read all posts/i }).click();
  await expect(page).toHaveURL(/\/blog$/);
});
```

- [ ] **Step 2: Run the E2E suite**

Run: `pnpm e2e`
Expected: PASS — the new spec plus the existing `smoke` and `projects` specs.

- [ ] **Step 3: Run everything**

Run: `pnpm test && pnpm run build && pnpm lint`
Expected: all pass. Confirm the build output lists `/feed.xml` and `/blog/tag/[slug]` as static.

- [ ] **Step 4: Commit**

```bash
git add e2e/blog.spec.ts
git commit -m "test(e2e): cover the feed, tag pages, and heading anchors

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
| --- | --- |
| §9.1 RSS feed | 3 |
| §9.2 homepage writing section | 6 |
| §9.3 tag pages + clickable tags | 4 |
| §9.4 heading anchors + prev/next | 5 |
| §9.5 `PostMeta.updated` | 1 (loader), 2 (JSON-LD) |
| §9.7 date-sorting fix | 1 |

No gaps. §9.6 (the `h4` style) is deliberately in Plan A — the converter emits `####` from day one, so the style must ship with it.

**Placeholder scan:** every step contains runnable commands or complete code. Two steps say "match the existing file's helper/import name" (Task 6 step 5, Task 3 step 5) — these are instructions to read one line of an existing file, not deferred decisions.

**Type consistency:** `PostMeta` gains `updated?: string` in Task 1 and is consumed with that exact shape in Tasks 2, 3, 5, and 6. `getAllTags` returns `{name, slug, count}[]` in Task 1, matching its use in Task 4's `generateStaticParams` and the sitemap. `getAdjacentPosts` returns `{prev?, next?}` in Task 1, spread directly into `PostNav`'s identically-named props in Task 5. `routes.blogTag`/`routes.feed` are added in Task 2 before first use in Tasks 3 and 4.

**Ordering note:** Task 2 must precede Tasks 3 and 4 (it adds the routes they use). Task 1 must precede everything. Tasks 3–6 are otherwise independent of each other.
