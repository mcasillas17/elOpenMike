# Blog Reader UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve blog reading comfort, mobile accessibility, discovery, rich-content rendering, and post-to-post engagement while preserving the static Notion-backed architecture.

**Architecture:** Keep the filesystem-backed blog and server-rendered MDX pipeline. Add small presentation components around the existing loader, one pure related-post query, and one client component for clipboard interaction; reuse existing tag and route helpers everywhere.

**Tech Stack:** Next.js 16.2.6 App Router, React 19.2, TypeScript, Tailwind CSS v4, next-mdx-remote, rehype, Vitest + Testing Library, Playwright.

## Global Constraints

- Work only in the `codex/blog-ux-overhaul` worktree and preserve `pnpm` plus the committed lockfile.
- Read relevant Next.js 16 documentation from `node_modules/next/dist/docs/` before changing framework behavior.
- Use `routes` and `site` from `src/lib/site.ts`; do not hardcode internal paths or author identity.
- `content/blog/*.mdx` is generated from Notion and must not be hand-edited.
- Every behavior change follows red-green-refactor; tests assert reader-visible behavior rather than implementation text.
- Search, pagination, reading progress, long-post TOCs, comments, and newsletter persistence are out of scope.

---

### Task 1: Navigation, archive cards, and topic discovery

**Files:**
- Modify: `src/lib/site.ts`
- Modify: `src/components/layout/Header.tsx`
- Modify: `src/components/blog/PostCard.tsx`
- Create: `src/components/blog/FeaturedPost.tsx`
- Create: `src/components/blog/BlogTopicNav.tsx`
- Modify: `src/components/sections/Writing.tsx`
- Modify: `src/app/blog/page.tsx`
- Modify: `src/app/blog/tag/[slug]/page.tsx`
- Test: `src/components/layout/__tests__/Header.test.tsx`
- Test: `src/components/blog/__tests__/PostCard.test.tsx`
- Create: `src/components/blog/__tests__/FeaturedPost.test.tsx`
- Create: `src/components/blog/__tests__/BlogTopicNav.test.tsx`
- Test: `src/components/sections/__tests__/Writing.test.tsx`

**Interfaces:**
- `PostCard({ post, headingLevel = 2 }: { post: PostMeta; headingLevel?: 2 | 3 })`
- `FeaturedPost({ post }: { post: PostMeta })`
- `BlogTopicNav({ currentSlug, totalPosts }: { currentSlug?: string; totalPosts: number })`

- [ ] **Step 1: Write failing component tests** proving the header has one Writing link to `/blog` and no Blog duplicate, homepage card titles are level 3, index cards default to level 2, the featured post exposes title/excerpt/meta/tags, and the topic nav marks All or the current tag with `aria-current="page"` while showing literal counts.
- [ ] **Step 2: Run the focused tests** with `pnpm exec vitest run src/components/layout/__tests__/Header.test.tsx src/components/blog/__tests__/PostCard.test.tsx src/components/blog/__tests__/FeaturedPost.test.tsx src/components/blog/__tests__/BlogTopicNav.test.tsx src/components/sections/__tests__/Writing.test.tsx`; expect failures for the missing APIs and old navigation.
- [ ] **Step 3: Implement the minimal presentation changes**. Render dynamic headings with `const Heading = headingLevel === 3 ? "h3" : "h2"`; feature `posts[0]`, archive `posts.slice(1)`, and source tag names/counts from `getAllTags()`.

```tsx
const Heading = headingLevel === 3 ? "h3" : "h2";

<Heading className="mt-1 font-display text-xl font-bold text-ink">
  <Link href={routes.blogPost(post.slug)}>{post.title}</Link>
</Heading>

<BlogTopicNav totalPosts={posts.length} />
{posts[0] && <FeaturedPost post={posts[0]} />}
{posts.slice(1).map((post) => <PostCard key={post.slug} post={post} />)}
```
- [ ] **Step 4: Re-run the focused tests** and keep them green after refactoring repeated metadata/date presentation only when duplication is real.
- [ ] **Step 5: Commit** with `feat(blog): improve writing discovery and hierarchy`.

### Task 2: Article header, related reading, and explicit chronology

**Files:**
- Modify: `src/lib/blog.ts`
- Modify: `src/lib/__tests__/blog.test.ts`
- Modify: `src/components/blog/PostNav.tsx`
- Modify: `src/components/blog/__tests__/PostNav.test.tsx`
- Create: `src/components/blog/PostFooter.tsx`
- Create: `src/components/blog/__tests__/PostFooter.test.tsx`
- Modify: `src/app/blog/[slug]/page.tsx`
- Modify: `src/app/blog/[slug]/__tests__/page.test.tsx`

**Interfaces:**
- `getRelatedPosts(slug: string, limit?: number): PostMeta[]`
- `PostFooter({ related }: { related: PostMeta[] })`

- [ ] **Step 1: Write failing tests** for deterministic related-post ranking: exclude the current post, require at least one shared normalized tag, rank by shared-tag count then publication date, and honor a default limit of three. Add component/page assertions for excerpt lead text, Published/Updated labels, Newer/Older labels, related links, RSS, and author email.
- [ ] **Step 2: Run** `pnpm exec vitest run src/lib/__tests__/blog.test.ts src/components/blog/__tests__/PostNav.test.tsx src/components/blog/__tests__/PostFooter.test.tsx 'src/app/blog/[slug]/__tests__/page.test.tsx'`; expect failures for the new query and reader content.
- [ ] **Step 3: Implement** the pure query and reader components. Keep chronological adjacency unchanged internally, but label `prev` as Newer and `next` as Older. Show the Updated label only when `updated` exists and differs from the publication day.

```ts
export function getRelatedPosts(slug: string, limit = 3): PostMeta[] {
  const posts = getAllPosts();
  const current = posts.find((post) => post.slug === slug);
  if (!current || limit <= 0) return [];
  const currentTags = new Set(current.tags.map(tagSlug));
  return posts
    .filter((post) => post.slug !== slug)
    .map((post) => ({
      post,
      shared: post.tags.map(tagSlug).filter((tag) => currentTags.has(tag)).length,
    }))
    .filter(({ shared }) => shared > 0)
    .sort((a, b) => b.shared - a.shared || timestamp(b.post.date) - timestamp(a.post.date))
    .slice(0, limit)
    .map(({ post }) => post);
}
```
- [ ] **Step 4: Re-run focused tests**, then refactor date formatting into one local helper if both list and article surfaces need identical output.
- [ ] **Step 5: Commit** with `feat(blog): enrich article context and onward reading`.

### Task 3: Code blocks, permalinks, and rich Notion content

**Files:**
- Create: `src/components/blog/CodeBlock.tsx`
- Create: `src/components/blog/__tests__/CodeBlock.test.tsx`
- Modify: `src/components/blog/mdx-components.tsx`
- Modify: `src/components/blog/__tests__/mdx-components.test.tsx`
- Modify: `src/app/blog/[slug]/page.tsx`
- Modify: `src/app/globals.css`
- Modify: `e2e/blog.spec.ts`

**Interfaces:**
- `CodeBlock(props: ComponentProps<"pre">)` renders the original highlighted children, derives a human-readable language from the child code element's `data-language`, and copies `pre.textContent` through `navigator.clipboard.writeText`.

- [ ] **Step 1: Write failing tests** proving a fenced block exposes a Copy code button and language label, writes literal code text to the clipboard, reports Copied after success, and recovers to Copy code after a rejected copy. Add MDX tests for responsive image classes, a scrollable table wrapper, styled table cells, task-list inputs, and a separate heading/link group generated by rehype.
- [ ] **Step 2: Run** `pnpm exec vitest run src/components/blog/__tests__/CodeBlock.test.tsx src/components/blog/__tests__/mdx-components.test.tsx`; expect missing component/markup failures.
- [ ] **Step 3: Implement** `CodeBlock` as the only new client boundary. Extend the MDX map for `img`, `table`, `thead`, `tbody`, `tr`, `th`, `td`, and `input`; change autolink behavior to `after` with a `.heading-group` wrapper so the permalink is not part of the heading name.

```tsx
"use client";

export function CodeBlock({ children, ...props }: ComponentProps<"pre">) {
  const ref = useRef<HTMLPreElement>(null);
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  async function copy() {
    try {
      await navigator.clipboard.writeText(ref.current?.textContent ?? "");
      setStatus("copied");
    } catch {
      setStatus("error");
    }
  }
  return <div className="code-block-shell"><button onClick={copy}>{status === "copied" ? "Copied" : "Copy code"}</button><pre ref={ref} {...props}>{children}</pre></div>;
}
```

```ts
{
  behavior: "after",
  group: { type: "element", tagName: "div", properties: { className: ["heading-group"] }, children: [] },
  properties: { className: ["heading-anchor"], ariaLabel: "Link to this section" },
  content: { type: "text", value: "#" },
}
```
- [ ] **Step 4: Add CSS** for a 68ch prose measure, 18px desktop prose, heading groups, coarse-pointer permalink visibility, 44px permalink targets, code overflow fade/label placement, responsive media, tables, and task controls.

```css
.blog-prose { max-width: 68ch; font-size: 1.125rem; line-height: 1.75; }
.heading-anchor { min-width: 2.75rem; min-height: 2.75rem; }
@media (hover: none), (pointer: coarse) { .heading-anchor { opacity: 1; } }
.table-scroll { overflow-x: auto; }
```
- [ ] **Step 5: Re-run unit tests**, then run the focused Playwright cases after Task 5 adds final browser assertions.
- [ ] **Step 6: Commit** with `feat(blog): upgrade code and rich content reading`.

### Task 4: Mobile target sizing and hydration-safe document behavior

**Files:**
- Modify: `src/components/layout/Header.tsx`
- Modify: `src/components/layout/Footer.tsx`
- Modify: `src/components/spidey/SpideyTrigger.tsx`
- Modify: `src/components/blog/PostCard.tsx`
- Modify: `src/app/blog/[slug]/page.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css`
- Test: `src/components/layout/__tests__/Header.test.tsx`
- Test: `src/components/layout/__tests__/Footer.test.tsx`
- Test: `src/components/spidey/__tests__/SpideyMode.test.tsx`
- Test: `e2e/blog.spec.ts`

**Interfaces:** Existing components only; interactive reader controls must expose at least a 44px CSS box at the 390px test viewport.

- [ ] **Step 1: Add failing component/E2E assertions** for touch-target utility classes and measured browser boxes on the menu, mobile nav links, back link, tag links, footer links, and web-slinger toggle. Assert a permalink is visible under a coarse-pointer mobile context.
- [ ] **Step 2: Run focused unit tests** and confirm failures describe the old 17–36px targets.
- [ ] **Step 3: Implement minimum target sizing** with padding/min-size on the link rather than inflating the visual pill. Add `suppressHydrationWarning` for the intentionally pre-hydration `js` class and `data-scroll-behavior="smooth"` per the bundled Next.js 16 migration guide.

```tsx
<html
  lang="en"
  className={`${sora.variable} ${inter.variable}`}
  data-scroll-behavior="smooth"
  suppressHydrationWarning
>
```

```tsx
className="inline-flex min-h-11 min-w-11 items-center justify-center"
```
- [ ] **Step 4: Re-run focused unit tests** and the mobile E2E assertions.
- [ ] **Step 5: Commit** with `fix(blog): improve mobile controls and document hydration`.

### Task 5: Reader-journey E2E and documentation

**Files:**
- Modify: `e2e/blog.spec.ts`
- Modify: `README.md`
- Modify: `docs/authoring.md`

**Interfaces:** No new production API.

- [ ] **Step 1: Add or finish E2E tests** for featured-to-article navigation, topic filtering and clearing, article excerpt/update metadata, code copy, Newer/Older navigation, related-reader CTA, heading link visibility/name, horizontal code containment, and 390px touch targets.
- [ ] **Step 2: Run `pnpm e2e`** and verify each new assertion fails before its corresponding implementation if it was not already exercised during Tasks 1–4; otherwise preserve the recorded red run from that task.
- [ ] **Step 3: Update documentation**. README describes the reader surfaces and test coverage; `docs/authoring.md` explains how excerpts, revisions, code languages, images, tables, tags, and related-post selection appear to readers.
- [ ] **Step 4: Run full verification**: `pnpm test`, `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm run build`, and `pnpm e2e`.
- [ ] **Step 5: Perform responsive browser QA** at desktop and 390px widths across `/`, `/blog`, a tag page, and both shipped posts; verify no horizontal page overflow, keyboard-visible focus, readable measure, and clean production console.
- [ ] **Step 6: Commit** with `docs(blog): document the reader experience`.

### Task 6: Review loop and PR readiness

**Files:** All files changed since `origin/main`.

- [ ] **Step 1: Dispatch the requested GPT-5.6 Terra reviewer** with the approved design, this plan, base SHA, head SHA, full diff, and read-only instructions.
- [ ] **Step 2: Evaluate every finding against the codebase**, implement valid findings one at a time with a failing regression test, and run focused verification after each.
- [ ] **Step 3: Repeat Terra review** on the new head until the reviewer reports no Critical, Important, or Minor findings and marks the branch ready to merge.
- [ ] **Step 4: Run the full verification suite again** on the exact final tree, inspect `git diff --check` and repository status, then push `codex/blog-ux-overhaul`.
- [ ] **Step 5: Create a ready-for-review PR** against `main` with a reader-focused summary, test evidence, screenshots/QA notes, deliberate non-goals, and reviewer-loop outcome.
