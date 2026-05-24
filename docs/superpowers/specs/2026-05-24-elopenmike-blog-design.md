# elOpenMike — Blog (Plan 4) Design

**Date:** 2026-05-24
**Owner:** Miguel Casillas (`mcasillas17`)
**Repo:** `github.com/mcasillas17/elOpenMike`
**Status:** Approved design — ready for implementation planning

**Context:** Plan 4 of the multi-plan elOpenMike build. Plans 1–3 are implemented, merged, and deployed (https://elopenmike.com on Fly.io; GitHub Actions deploy on push to `main` once `FLY_API_TOKEN` is set). This plan adds an MDX dev blog. Overall site spec: `docs/superpowers/specs/2026-05-23-elopenmike-personal-site-design.md`.

**Conventions:** pnpm. Next.js 16 App Router, TypeScript, Tailwind v4 (`images.unoptimized` set). Reuse the design system: `Section`, `Container`, `Button`/`LinkButton`, `Tag`, Midnight Web tokens (`bg-canvas`, `bg-surface`, `border-edge`, `text-spidey`, `text-web`, `text-muted`, `text-ink`), `font-display`/`font-body`. Commits: Conventional Commits + the `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` trailer.

---

## 1. Scope & placement

An MDX **dev blog**: a `/blog` list page and `/blog/[slug]` post pages, surfaced via a **"Blog"** header nav link. **No home-page teaser.** Posts are `.mdx` files with frontmatter; code blocks are syntax-highlighted at build time (no client JS).

## 2. Content & MDX pipeline

- Posts live in **`content/blog/<slug>.mdx`** (slug = filename) with frontmatter:
  ```yaml
  ---
  title: "Post title"
  date: "2026-05-20"     # ISO date
  excerpt: "One-line summary for the list + meta description."
  tags: ["AI", "Distributed Systems"]
  ---
  ```
- Pipeline (all build/request-time, no client JS for highlighting):
  - **gray-matter** — parse frontmatter.
  - **next-mdx-remote/rsc** `compileMDX` — compile MDX in the App Router (async server component).
  - **rehype-pretty-code** + **shiki** — build-time syntax highlighting for fenced code blocks.
  - **remark-gfm** — GitHub-flavored markdown (tables, strikethrough, task lists).
- **Prose styling = a custom MDX components map** (`src/components/blog/mdx-components.tsx`) mapping `h2`/`h3` (→ `font-display`), `p`/`ul`/`ol`/`li`/`blockquote` (→ `text-muted`/`text-ink` spacing), `a` (→ `text-web` underline), and inline `code` (→ `bg-surface`/`border-edge` pill). Fenced code blocks are styled by rehype-pretty-code's output. This keeps posts on-brand and avoids the Tailwind Typography plugin dependency.
- **Reading time:** a small helper (`readingMinutes = max(1, round(words / 200))`) computed from the raw MDX body — no dependency.
- **New dependencies** (mainstream; the 7-day `minimumReleaseAge` cooldown applies): `next-mdx-remote`, `rehype-pretty-code`, `shiki`, `remark-gfm`, `gray-matter`.

## 3. Loader — `src/lib/blog.ts`

```ts
export type PostMeta = {
  slug: string;
  title: string;
  date: string;        // ISO
  excerpt: string;
  tags: string[];
  readingMinutes: number;
};

export function getAllPosts(): PostMeta[];          // newest first (by date desc)
export function getPostSlugs(): string[];
export function getPost(slug: string):              // raw body for compileMDX
  { meta: PostMeta; body: string } | undefined;
```
Reads and parses `content/blog/*.mdx` from the filesystem at build/request time (Node runtime). Frontmatter via gray-matter; `readingMinutes` computed from the body.

## 4. `/blog` (list) — `src/app/blog/page.tsx`

A `Container` with an eyebrow ("Writing"), `<h1>` "Blog", a short lead line, and a **stacked list** of posts (newest first), each rendered by `PostCard`: `date · {readingMinutes} min read` (muted), title (`font-display`, a stretched-link to `/blog/[slug]`), excerpt (`text-muted`), and `Tag` chips. Empty state ("No posts yet.") when there are none. `export const metadata` title "Blog".

`src/components/blog/PostCard.tsx` — the list item (stretched-link pattern like `ProjectCard`, no image).

## 5. `/blog/[slug]` (post) — `src/app/blog/[slug]/page.tsx`

Async server component:
1. "← Back to blog" link (`/blog`, with focus ring).
2. Eyebrow: `{date} · {readingMinutes} min read`.
3. `<h1>` title (`font-display`, last word in `text-spidey`).
4. `Tag` chips.
5. The post body: `compileMDX({ source: body, components, options: { mdxOptions: { remarkPlugins: [remarkGfm], rehypePlugins: [[rehypePrettyCode, {...}]] } } })`, wrapped in a max-width container.

Exports `generateStaticParams()` (all slugs, fully prerendered) and `generateMetadata({ params })` (title + excerpt from frontmatter). Unknown slug → `notFound()` → themed 404.

## 6. Files & wiring

- **Create:** `src/lib/blog.ts`, `src/components/blog/PostCard.tsx`, `src/components/blog/mdx-components.tsx`, `src/app/blog/page.tsx`, `src/app/blog/[slug]/page.tsx`, and **2 sample posts** under `content/blog/*.mdx` (real examples — the owner edits/replaces).
- **Modify:** `src/lib/site.ts` → add nav item `{ label: "Blog", href: "/blog" }` (a route link; the active-section hook ignores it since it has no `#`). `src/app/globals.css` only if a small code-block tweak is needed.

## 7. Cross-cutting

- **SEO:** per-post `metadata` title + description (excerpt); `/blog` title. Per-post OG images deferred to Plan 6.
- **Images:** posts can use Markdown images (served as-is via `images.unoptimized`); not required for v1.
- **Testing (Vitest + RTL):**
  - `src/lib/__tests__/blog.test.ts` — against the 2 sample posts: `getAllPosts` returns them newest-first with all fields incl. `readingMinutes > 0`; `getPostSlugs` covers all; `getPost(slug)` returns meta + body; `getPost("nope")` is `undefined`.
  - `PostCard` / `/blog` list — renders a post's title (linked to its slug), date/reading-time, excerpt, tags; empty state when no posts.
  - `/blog/[slug]` — `generateStaticParams` returns all slugs; `generateMetadata` returns the post title; unknown slug calls `notFound` (throws).
  - **MDX rendering (Shiki) is verified by `pnpm run build`**, which compiles every post — not by unit tests (Shiki/ESM is slow and flaky under jsdom). The post-page unit tests cover params/metadata/notFound only.
- **Error handling:** unknown slug → themed 404; empty `content/blog` → `/blog` shows the empty state; the loader handles a missing/empty dir without crashing.

## 8. Build order (for the implementation plan)

1. `blog.ts` loader + reading-time helper + 2 sample `.mdx` posts (+ loader tests).
2. MDX dependencies + `mdx-components.tsx` map (rendering verified via build).
3. `PostCard` + `/blog` list page (+ tests).
4. `/blog/[slug]` post page with `compileMDX` + rehype-pretty-code + `generateStaticParams`/`generateMetadata`/`notFound` (+ params/metadata/notFound tests; build verifies rendering).
5. Nav item in `site.ts`; final `pnpm test` + `pnpm run build` (route table shows `/blog` and `/blog/[slug]`); README touch-up.

## 9. Explicitly out of scope (v1)

- Tag filtering, RSS/Atom feed, pagination, drafts/unpublished posts, comments, full-text search, per-post cover/OG images, reactions, a home-page "latest posts" teaser.
