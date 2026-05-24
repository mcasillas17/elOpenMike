# elOpenMike — Personal Sections (Plan 3) Design

**Date:** 2026-05-24
**Owner:** Miguel Casillas (`mcasillas17`)
**Repo:** `github.com/mcasillas17/elOpenMike`
**Status:** Approved design — ready for implementation planning

**Context:** Plan 3 of the multi-plan elOpenMike build. Plans 1 (Foundation) and 2 (Projects) are implemented, merged, and deployed (https://elopenmike.com on Fly.io). This plan adds the personal sections: **About + Turing** and **Comedy** (with a `/comedy` page). Overall site spec: `docs/superpowers/specs/2026-05-23-elopenmike-personal-site-design.md`.

**Conventions:** pnpm (`pnpm test`, `pnpm run build`). Next.js 16 App Router, TypeScript, Tailwind v4. Reuse the design system: `Section`, `Container`, `Button`/`LinkButton`, `Tag`, `WebCorner`, Midnight Web tokens (`bg-canvas`, `bg-surface`, `border-edge`, `text-spidey`, `text-web`, `text-muted`, `text-ink`, `bg-spidey-dark`), `font-display`/`font-body`. `next.config.ts` already sets `images.unoptimized: true`. Commits: Conventional Commits + the `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` trailer.

---

## 1. Scope & placement

Two home sections plus one route, in the recruiter-first order:
Hero → Experience → Projects → **About + Turing** → **Comedy** → (Contact, later).
Comedy is teased on the home page and expanded on `/comedy`. **No shows/dates list in v1.**

## 2. About + Turing (Layout A: "story + sidebar")

- **`src/data/about.ts`** — typed content:
  ```ts
  export type About = {
    headline: string;       // section title
    bio: string[];          // 2–3 paragraphs (engineering story + personal layer)
    turing: { caption: string; image?: string }; // image: path under /images/about/
    facts: string[];        // chip labels, e.g. "🏋️ Lifting", "🎬 Movies & TV", "🕷️ Spider-Man (huge)"
  };
  export const about: About;
  ```
  Placeholder content the owner edits.
- **`src/components/sections/About.tsx`** — a `Section` (id `about`, eyebrow "About", title `about.headline`) containing a responsive 2-column grid:
  - Left: `about.bio` paragraphs (`text-muted`) + a wrapped row of `Tag` chips from `about.facts`.
  - Right: a Turing photo card (`bg-surface`/`border-edge`) — `next/image` of `about.turing.image` (or the red/blue gradient fallback when empty) + `about.turing.caption`.
  - Single column on mobile (photo below bio).

## 3. Comedy

- **`src/data/comedy.ts`** — typed content:
  ```ts
  export type Clip = { youtubeId: string; title: string };
  export type Photo = { src: string; alt: string }; // src under /images/comedy/
  export const clips: Clip[];
  export const photos: Photo[];
  ```
  Placeholder entries the owner replaces.
- **`src/components/comedy/YouTubeEmbed.tsx`** (`"use client"`) — the **facade**: renders a button showing the YouTube thumbnail (`https://img.youtube.com/vi/{youtubeId}/hqdefault.jpg`, plain `<img>`) with a red (`bg-spidey`) circular play overlay and an accessible label (`Play: {title}`). On click, swaps in an `<iframe>` (`https://www.youtube-nocookie.com/embed/{youtubeId}?autoplay=1`, `title={title}`, `allow` fullscreen). 16:9 aspect ratio. Loads no third-party scripts until clicked.
- **`src/components/comedy/PhotoGallery.tsx`** — responsive grid (e.g., 2 cols mobile → 4 cols desktop) of `next/image` photos from `photos`. Renders nothing if `photos` is empty. (No lightbox in v1.)
- **`src/components/sections/Comedy.tsx`** — home teaser: a `Section` (id `comedy`, eyebrow "Comedy", title "Stand-up") with a short blurb, **one featured clip** (`clips[0]` via `YouTubeEmbed`, constrained width), and a "Watch more →" `LinkButton` to `/comedy`. If `clips` is empty, the featured clip is omitted gracefully.
- **`src/app/comedy/page.tsx`** — full page: a `Container` with a heading, a **Clips** grid (3-up `YouTubeEmbed`s, responsive) and a **Photos** `PhotoGallery`. `export const metadata` title "Comedy".

## 4. Wiring & files

- **Modify `src/app/page.tsx`** — render `<About />` then `<Comedy />` after `<Projects />`.
- **Modify `src/lib/site.ts`** — append nav items `{ label: "About", href: "/#about" }` and `{ label: "Comedy", href: "/#comedy" }` (root-relative hashes, consistent with the cross-page nav). The active-section hook then tracks `experience`, `projects`, `about`, `comedy`.
- **Create** `public/images/about/.gitkeep`, `public/images/comedy/.gitkeep` (owner drops Turing/comedy photos there; gradient/empty fallbacks until then).
- **Modify `src/app/__tests__/page.test.tsx`** — also assert the About headline (`about.headline`, the `<h2>`) and the Comedy "Stand-up" heading render. (Note: "About"/"Comedy" are the section *eyebrows*; the `<h2>` text is the headline / "Stand-up".)

## 5. Cross-cutting

- **Images:** local photos via `next/image` (`images.unoptimized` already set). YouTube thumbnails via a plain `<img>` from `img.youtube.com` (no `remotePatterns` config needed). Gradient fallback when a local image path is empty/missing — no broken images.
- **Privacy/perf:** YouTube uses the `youtube-nocookie` domain and the click-to-load facade (no player/scripts until the user clicks).
- **Accessibility:** `YouTubeEmbed` facade is a real `<button>` with an accessible name; gallery images have `alt`; single `<h1>` only on `/comedy` (home sections use `Section`'s `<h2>`); decorative gradients `aria-hidden`.
- **SEO:** `/comedy` has its own metadata title; new home sections are nav anchor targets.

## 6. Testing (Vitest + RTL)

- `src/data/__tests__/about.test.ts` — `about` has non-empty `headline`, `bio` array, `turing.caption`, `facts` array.
- `src/data/__tests__/comedy.test.ts` — `clips` entries have `youtubeId` + `title`; `photos` entries have `src` + `alt` (arrays may be placeholder but well-formed).
- `About` — renders the headline, Turing caption, and each fact chip.
- `YouTubeEmbed` — renders a play button with the accessible name `Play: {title}` and a thumbnail; after a click it renders an `<iframe>` whose `src` contains the `youtubeId`. (Client behavior via `fireEvent`.)
- `Comedy` (home) — renders the "Stand-up" heading and a "Watch more" link to `/comedy`; renders the first clip's play button.
- `/comedy` page — renders the heading, a play button per clip, and the gallery photos.
- Home page test — also asserts the About headline (`about.headline`) and the Comedy "Stand-up" heading render.

## 7. Error handling

- Empty `clips`/`photos`/`bio` arrays render gracefully (no crash; sections/grids simply omit content).
- Missing local image paths → gradient fallback (About/Turing) or omitted (gallery), never a broken `<img>`.

## 8. Build order (for the implementation plan)

1. `about.ts` data + `About` section (+ tests).
2. `comedy.ts` data + `YouTubeEmbed` facade (+ client test).
3. `PhotoGallery` (+ test).
4. `Comedy` home teaser section (+ test).
5. `/comedy` page (+ test).
6. Wire into home (`page.tsx`) + nav (`site.ts`) + image dirs + home-test update; final `pnpm test` + `pnpm run build`; README touch-up.

## 9. Explicitly out of scope (v1)

- Shows/dates list (and ticket links).
- Photo lightbox / carousel.
- Non-YouTube clip sources (Instagram/TikTok/self-hosted).
- A dedicated `/about` route (About stays a home section).
- Real photos/clips (placeholders ship; owner fills in `about.ts`, `comedy.ts`, and `public/images/about|comedy/`).
