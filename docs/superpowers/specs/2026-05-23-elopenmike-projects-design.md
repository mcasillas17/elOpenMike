# elOpenMike — Projects (Plan 2) Design

**Date:** 2026-05-23
**Owner:** Miguel Casillas (`mcasillas17`)
**Repo:** `github.com/mcasillas17/elOpenMike`
**Status:** Approved design — ready for implementation planning

**Context:** Plan 2 of the multi-plan elOpenMike build. Plan 1 (Foundation & recruiter-first core) is implemented and merged to `main`. This plan adds the Projects showcase. Overall site spec: `docs/superpowers/specs/2026-05-23-elopenmike-personal-site-design.md`; Plan 1: `docs/superpowers/plans/2026-05-23-elopenmike-foundation.md`.

**Conventions:** Package manager is **pnpm** (`pnpm test`, `pnpm run build`). Next.js 16 App Router, TypeScript, Tailwind v4 (CSS-first `@theme` tokens). Reuse the Plan 1 design system: `Section`, `Container`, `Button`/`LinkButton`, `WebCorner`, the Midnight Web tokens (`bg-canvas`, `text-spidey`, `text-web`, `text-muted`, `border-edge`, `bg-spidey-dark`), and `font-display`/`font-body`. Commits use Conventional Commits + the `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` trailer.

---

## 1. Purpose & scope

Showcase Miguel's personal projects in a recruiter-skimmable, on-brand way:
- A **home preview** (top 3 projects) inserted after Experience (recruiter-first order: Hero → Experience → **Projects** → … later About/Comedy).
- A full **`/projects`** page listing all projects as single-column horizontal cards.
- A **`/projects/[slug]`** detail page per project (concise: header, links, screenshots, "what it does").

Content is **concise structured data** (no MDX, no long-form case studies). Built so open-source contributions can be added later as tagged items, and a tag filter can be added later, without restructuring.

## 2. Data model — `src/data/projects.ts`

Typed array (mirrors `experience.ts`) plus two lookup helpers.

```ts
export type Project = {
  slug: string;         // URL segment + React key, e.g. "web-slinger-cli"
  title: string;
  summary: string;      // one-liner, used on card and detail
  year: string;         // e.g. "2025" (shown in the detail eyebrow)
  tags: string[];       // chips on card + detail; an "Open source" tag is the OSS-later hook
  stack: string[];      // technologies, rendered as a "·"-joined line
  highlights: string[]; // "What it does" bullets on the detail page
  liveUrl?: string;     // optional deployed URL
  repoUrl?: string;     // optional source repo URL
  images: string[];     // paths under /images/projects/...; images[0] is the primary (card + detail)
};

export const projects: Project[] = [ /* placeholder entries the owner replaces */ ];

export function getProject(slug: string): Project | undefined;
export function getAllSlugs(): string[];
```

- **Ordering:** array order is the source of truth. **Home preview = first 3** entries; `/projects` shows all in array order. No `featured` flag (YAGNI).
- **Links:** only `liveUrl` + `repoUrl` in v1 (writeup/package links are out of scope). Both optional; a project may have neither (then no link buttons render).
- **Placeholder data:** ship 2–3 placeholder projects so the pages render; the owner replaces them.

## 3. Components & files

**Create:**
- `src/components/ui/Tag.tsx` — chip primitive (pill: `bg-[#1a2030]`-style surface, `border-edge`, small muted text). Reusable beyond projects.
- `src/components/ui/icons.tsx` — two small inline SVG components: `GitHubIcon`, `ExternalLinkIcon` (decorative, `aria-hidden`). Used in the Live/Source buttons.
- `src/components/projects/ProjectCard.tsx` — the **hybrid horizontal card**: a grid `~38% image / 1fr details`; image-left, details-right (title, summary, tag chips, stack line, Live/Source buttons). Collapses to image-on-top on mobile. Whole-card-clickable via the **stretched-link pattern** (see §4) — valid HTML, no nested anchors. If `images[0]` is absent, render the red/blue gradient fallback.
- `src/components/sections/Projects.tsx` — home **preview section**: `<Section id="projects" eyebrow="Work" title="Projects">`, renders the first 3 projects as `ProjectCard`s, then a "View all projects →" `LinkButton`/link to `/projects`.
- `src/app/projects/page.tsx` — full list: all projects as single-column `ProjectCard`s, wrapped in `Container`, with a page title/heading.
- `src/app/projects/[slug]/page.tsx` — **detail page** (see §5). Exports `generateStaticParams` and `generateMetadata`.

**Modify:**
- `src/app/page.tsx` — insert `<Projects />` after `<Experience />`.
- `src/lib/site.ts` — add nav item `{ label: "Projects", href: "#projects" }` (after Experience).
- `public/images/projects/.gitkeep` — created so the directory exists for screenshots.

## 4. ProjectCard (the approved hybrid layout)

- Desktop: CSS grid `grid-template-columns: 38% 1fr`. Left = `next/image` screenshot (16:9, object-cover) or gradient fallback. Right = title (`font-display`, bold), summary (`text-muted`), tag chips (`Tag`), stack line (`text-web`), and Live/Source buttons.
- Mobile (`< sm`): single column — image on top (16:9), details below.
- **Whole-card link (stretched-link pattern, valid HTML):** the card is a `position: relative` container. The project **title** is the `next/link` to `/projects/[slug]`, and that link carries an absolutely-positioned overlay (a `::after`/absolute `<span>`) that stretches over the whole card — so clicking anywhere on the card navigates to the detail page, while the title remains the accessible link text. The Live/Source anchors are **siblings** (not nested in the title link) given `position: relative; z-index: 1` so they sit above the overlay and open their own URLs (external, `target="_blank" rel="noopener noreferrer"`). Only one anchor is stretched; there is no `<a>`-in-`<a>` nesting. Hover raises the card border to `border-web`.

## 5. Detail page — `/projects/[slug]`

One-column, max-width ~720px:
1. "← Back to projects" link.
2. Eyebrow: `{year}` (`text-web`, uppercase).
3. Title (`font-display`, large; visual treatment consistent with the site — last word may use `text-spidey` accent).
4. Summary paragraph.
5. Tag chips + stack line.
6. Live demo / View source buttons (primary red / outline).
7. Primary screenshot (16:9), then an optional second screenshot if `images[1]` exists.
8. "What it does" — `highlights` as a bullet list.

Behavior:
- `generateStaticParams()` returns every slug from `getAllSlugs()` (fully prerendered).
- An unknown slug calls `notFound()` → the themed Plan 1 404.
- `generateMetadata({ params })` sets the page `<title>` to the project title (uses the Plan 1 title template) and a description from the summary.

## 6. Home preview & navigation

- `<Projects />` sits between `<Experience />` and (future) personal sections — keeping the recruiter-first order.
- Shows the **first 3** projects as the same `ProjectCard` rows, then "View all projects →" → `/projects`.
- Header nav gains "Projects" (`#projects`), so the active-section hook highlights it on the home page.

## 7. Reused design system

No new tokens or fonts. Cards/detail use existing utilities (`bg-canvas`, surface/`border-edge`, `text-spidey`/`text-web`/`text-muted`, `font-display`/`font-body`), `Section`, `Container`, `Button`/`LinkButton`, and `WebCorner` where a subtle accent helps. `Tag` and `icons` are the only new primitives (the `Tag`/`Card` deferred in Plan 1).

## 8. Testing (Vitest + RTL)

- `src/data/__tests__/projects.test.ts` — data shape (each project has slug/title/summary/year, arrays for tags/stack/highlights/images); `getProject` returns the right entry and `undefined` for a bad slug; `getAllSlugs` covers every project; slugs are unique.
- `Tag` — renders its label.
- `ProjectCard` — renders title, summary, tags; links to `/projects/{slug}`; renders Live/Source anchors with correct hrefs when present and omits them when absent.
- `Projects` (home preview) — renders exactly the first 3 projects and a "View all projects" link to `/projects`.
- `/projects` list — renders a card for every project.
- detail page — renders a known project's title/summary/highlights; `generateStaticParams` returns all slugs; an unknown slug triggers `notFound`.

## 9. Error handling

- Unknown project slug → `notFound()` (themed 404).
- Missing/empty `images` → gradient fallback (no broken image).
- External Live/Source links → `target="_blank" rel="noopener noreferrer"`.

## 10. Build order (for the implementation plan)

1. `Tag` primitive + `icons` (with tests).
2. `ProjectCard` (with tests, using a fixture project).
3. `projects.ts` data + helpers (with tests).
4. `/projects` list page.
5. `/projects/[slug]` detail page + `generateStaticParams`/`generateMetadata`/`notFound`.
6. `Projects` home preview section + wire into `page.tsx` + nav item in `site.ts`.
7. `public/images/projects/.gitkeep`, full `pnpm test` + `pnpm run build`, README touch-up if needed.

## 11. Explicitly out of scope (this plan)

- Tag **filtering** UI (data supports it; add later when project count grows).
- MDX / long-form case studies (concise model chosen).
- Writeup/article and package/store link types (only Live + Source in v1).
- A dedicated Open Source section (an "Open source" tag on a project is the interim representation).
- Real screenshots/content (placeholders ship; owner fills in).
