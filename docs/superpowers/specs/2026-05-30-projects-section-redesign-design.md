# elOpenMike — Projects Section Redesign (Comic Panels) Design

**Date:** 2026-05-30
**Owner:** Miguel Casillas (`mcasillas17`)
**Repo:** `github.com/mcasillas17/elOpenMike`
**Status:** Draft — awaiting user review before planning

**Supersedes:** The visual layer of `docs/superpowers/specs/2026-05-23-elopenmike-projects-design.md`. Data model, routing, and content remain. This redesign rebuilds the presentation only.

**Conventions:** pnpm, Next.js App Router, TypeScript, Tailwind v4 (CSS-first `@theme` tokens). Reuse the Midnight Web tokens (`bg-canvas`, `text-spidey`, `text-web`, `bg-surface`, `border-edge`, `font-display`). Conventional Commits with the Claude trailer.

---

## 1. Purpose & scope

Redesign the Projects experience to lean hard into the existing Spidey theme. The current cards (horizontal image-left / details-right) are competent but generic and read flat when projects lack screenshots (currently 3 of 4 do). Goal: turn the section into a recognizable signature for the site — "comic-issue panels" with thick black borders, halftone backgrounds, rotated issue stickers, and occasional POW marks — while keeping the content recruiter-skimmable.

**In scope:** The four surfaces that touch projects.
1. `src/components/sections/Projects.tsx` — Home section
2. `src/app/projects/page.tsx` — `/projects` index
3. `src/components/projects/ProjectCard.tsx` — the card component (used by both lists)
4. `src/app/projects/[slug]/page.tsx` — detail page

**Out of scope:**
- Data shape changes to `Project` beyond two small additions (see §3).
- Spidey-mode easter egg (`SpideyMode`, `WebCorner`, Konami trigger) — stays as-is.
- Other sections (Hero, Experience, Skills, About, Comedy).
- Routing, SEO metadata, sitemap behavior.

## 2. Visual direction

Comic Panels. Each project is a **panel**: a rectangle with a thick (3px) black border and a hard `4px 4px 0 #000` drop-shadow, a halftone dot overlay, a rotated **issue sticker** (`№04`, `№03`…), and a colored tint chosen deterministically. ~1 in 3 panels additionally gets a **POW mark** (THWIP!, BAMF!, ZAP!, BOOM!, KAPOW!, SNIKT!) in the top-right corner; the featured panel always gets one.

The motif extends from the listings into the detail page: a bordered "comic-cover" hero with the title in display-extrabold and the summary as tagline, then comic-style numbered **highlight panels** for "What it does."

Section title on `/projects` becomes **"The Casefile"** to commit to the bit; the home section keeps "Selected Projects" to differentiate teaser from full list.

## 3. Data model changes

`src/data/projects.ts` — `Project` stays largely as-is. No content changes required from existing data; tint and mark are derived.

The visual layer derives two things per project, deterministically (so SSR and client agree, and reloads don't flicker):

- **Panel tint** — one of `cover | blue | red | green | purple`. The **first project in the array** (array order is the source of truth — see existing comment in `projects.ts`) always gets `cover` (red+blue duotone). For the rest, the tint is the first match from this priority order, with a slug-hash fallback:

  | Tag present | Tint |
  | --- | --- |
  | `AI` or `Full-stack` | `blue` |
  | `Web app` | `red` |
  | `Game` or `Unity` | `green` |
  | `Open source` (and none of the above) | `purple` |
  | (no match) | `MARKS_TINTS[hash(slug) % 4]` over `blue | red | green | purple` |

- **POW mark** — derived from `hash(slug) % 100 < 35`. If true, the mark itself is `MARKS[hash(slug) % MARKS.length]`. The first project in the array is always granted a mark regardless of threshold. Pool: `["THWIP!", "BAMF!", "ZAP!", "BOOM!", "KAPOW!", "SNIKT!"]`.

Both live in `src/lib/projectVisuals.ts` (new file). Pure functions, no React. The hash is a small stable string hash (DJB2 or similar — no crypto needed).

## 4. New visual primitives — `src/components/ui/comic/`

Five small components, each one concern:

- **`ComicPanel`** — wrapper applying border, shadow, optional tint class, halftone child, and `relative overflow-hidden`. Accepts `tint`, `as` (default `"article"`), and children. The shadow is rendered with Tailwind utilities mapped to a new `--color-panel-shadow` token (`@theme`).
- **`Halftone`** — absolutely-positioned dot-pattern overlay. Inline `background-image: radial-gradient(...)`. Single prop: `opacity` (default `1`, accepts a multiplier). `aria-hidden`.
- **`IssueTag`** — the rotated sticker. Props: `number` (string, e.g. `"04"`), `label?` (e.g. `"NEW"`, `"LATEST"`), `variant` (`red | blue | dark`), `rotate` (`-3 | -1 | 2`). Positioned `absolute -top-2 left-3`. Not focusable, not a link — purely decorative; the panel itself carries the link.
- **`PowMark`** — top-right rotated text. Props: `word`, `color` (`spidey-strong | web-strong`), `rotate`. `aria-hidden`.
- **`ComicButton`** — black-bordered hard-shadow button (used on detail page for Live demo / Source / "View All Issues"). Variants: `primary` (spidey fill), `ghost` (surface fill). Mirrors the `Button` component's API (`href`, `target`).

All five are server components (no `"use client"`); the page-level components remain server components too.

## 5. Surface designs

### 5.1 Home — `src/components/sections/Projects.tsx`

Hybrid 6-column grid showing **the first 4 projects** (was 3):
- `panel.large` (cols 1–4, rows 1–2) — the first project, cover tint, big display-h3 title, summary
- `panel.tall` (cols 5–6, rows 1–2) — the second project, blue tint
- `panel.wide` (cols 1–4, row 3) — third, red tint
- `panel.small` (cols 5–6, row 3) — fourth, green tint

If there are fewer than 4 projects, the layout degrades: 3 → drop the small panel and let `tall` span rows 1–3; 2 → large + tall side-by-side; 1 → large only. (Defensive but realistic — we have 4 today.)

Section title: **"Selected Projects"** (kept). CTA button below the grid is a `ComicButton` reading **"View All Issues →"**.

### 5.2 `/projects` index — `src/app/projects/page.tsx`

Two regions:
1. **Featured row** — the first project as a wide feature panel + the second as auxiliary panel (2fr/1fr split, fixed height ~220px).
2. **Uniform grid** — every remaining project as a `4:3` aspect-ratio panel in a 3-column grid (collapsing to 2 then 1 on smaller widths).

Title becomes **"The Casefile"** with the existing eyebrow `Work`. Subhead reuses the existing line ("A few things I've designed and built — newest first.").

### 5.3 ProjectCard — `src/components/projects/ProjectCard.tsx`

Rewritten. The same component is used by both lists; **its visual treatment depends on a `variant` prop** so the listings can compose it correctly:

- `variant: "large" | "tall" | "wide" | "small" | "feature" | "aux" | "uniform"`
- Each variant controls: title font size, body presence, tag/stack visibility, and (in the small/aux variants) whether the summary is truncated.
- The "whole card is clickable" pattern is kept via the stretched-link anchor over the title. External `Live demo` / `Source` links no longer appear on listing cards (they crowded the panel and competed with the main click target) — those live on the detail page only.
- The `images[0]` cover photo is **no longer rendered** in listing variants. Panels are visually carried by tint + halftone + sticker + title. (If we later want screenshots back, we can add an `image` variant.)

### 5.4 Detail page — `src/app/projects/[slug]/page.tsx`

Structure (top to bottom):

1. **Back link** — "← Back to The Casefile" (top-left, muted).
2. **Cover panel** — thick-bordered (`4px`, larger shadow), full-width, cover tint with halftone. Contains: ISSUE sticker, big display-h1 title (last word in spidey-strong, keeping the existing `accentedTitle` pattern), tagline (the `summary`), tag pills as `credit-pill` (over-dark inset), stack line.
3. **Button row** — `ComicButton` primary "Live demo" + ghost "View Source" (existing data, comic styling).
4. **Splash panel** — bordered container holding either the YouTube embed (if `youtubeId`) or the `Carousel` (if `images.length > 0`) or omitted. Reuses existing `YouTubeEmbed` and `Carousel` components; only the wrapper styling changes.
5. **"WHAT IT DOES" badge** — white-fill rotated sticker.
6. **Numbered highlight panels** — each `highlights[]` entry becomes a `ComicPanel` with a large monospaced number on the left and the highlight text on the right. Vertical stack with 12px gap.

Constraint width stays `max-w-3xl` — the panels look right at this measure and the page stays readable.

## 6. New design tokens — `src/app/globals.css`

Two additions under `@theme`:

```css
--color-panel-border: #000;
--color-panel-shadow: #000;
```

(Black is intentional — the comic look depends on hard black borders, regardless of dark mode.)

No fonts change. Display font (Sora) carries the bold panel titles already; no new weights needed.

## 7. Responsive behavior

- **`md:` and above:** layouts as described.
- **`< md`:** all multi-column grids collapse to a single column. The home grid becomes 4 stacked panels (large first); the `/projects` featured row becomes feature → aux stacked; the uniform grid becomes single-column.
- **`< sm`:** panel shadows shrink to `2px 2px 0 #000` to keep horizontal margins comfortable; panel borders stay at `3px`. Issue sticker rotation stays.
- The detail page already uses `max-w-3xl mx-auto` — it carries down to mobile cleanly.

## 8. Accessibility

- **POW marks and Halftone** carry `aria-hidden="true"`.
- **IssueTag** is decorative but its number text is exposed (screen readers will announce "№04 NEW" alongside the title — acceptable).
- **Color contrast:** panel titles render on dark surfaces or dark gradients with text-shadow; we explicitly check the `cover` tint (the trickiest), aiming WCAG AA 4.5:1 for the title.
- **Focus state:** the stretched-link pattern is preserved; `focus-within:outline` lives on `ComicPanel` (red outline, 2px, offset 2px).
- **Reduced motion:** no animations introduced in this redesign. The existing `Reveal` wrapper on `Section` is unaffected.
- **Tap targets:** entire panel is the link; minimum height of the smallest panel (`panel.small`) is ≥ 44px tall on mobile (it spans full width and gets ample height).

## 9. Testing

Existing component tests live under `src/components/projects/__tests__` and `src/app/projects/__tests__`. We update them rather than scrap:

- **`ProjectCard.test.tsx`** — render each variant, assert the title link points to `/projects/${slug}`, assert tags/stack render where expected, assert that listing variants do **not** render `Live demo`/`Source` buttons (regression guard for §5.3).
- **`Projects.test.tsx`** (home section) — render with the real `projects` array, assert 4 panels are rendered with the expected variant classes (`large`, `tall`, `wide`, `small`).
- **`projects/page.test.tsx`** — assert featured row shows first two projects with `feature`/`aux` variants, uniform grid shows the remainder with `uniform` variant.
- **`projectVisuals.test.ts`** (new) — pure-function tests for `getTint(project, index)` and `getMark(project, index)` — assert determinism (same slug → same output), assert the first project always gets `cover` and a mark, assert the mark threshold is honored.
- **Detail page test** — assert cover panel renders with title and tagline, assert highlights become numbered panels (`01`, `02`, …), assert back-link text is "Back to The Casefile."

E2E (`e2e/`): the existing project-navigation Playwright test should still pass — selectors that target the title link are stable. We add one assertion for the detail page cover panel title visibility.

## 10. Migration & rollout

Single-PR migration. No feature flag — the surfaces being rewritten aren't behind one today and the change is presentational. All four surfaces flip together so the design language stays consistent across navigation.

Order of work (informs the implementation plan, not part of this spec):
1. New `projectVisuals.ts` + tests
2. `src/components/ui/comic/` primitives + token additions
3. `ProjectCard` rewrite with variants + tests
4. Home `Projects` section + test
5. `/projects` page + test
6. `/projects/[slug]` page + test
7. Manual visual check across breakpoints; update e2e if needed

## 11. Risks & open questions

- **Recruiter risk.** The comic treatment is louder than the rest of the site. Mitigations: borders/halftone are structural (always present), POW marks are probabilistic (~1/3 of panels, deterministic so consistent per visit), and the detail page's structured highlights remain easy to skim. If the bit lands wrong in user testing, the POW marks are the easiest dial to turn down (drop threshold to 0 — keeps the structure, removes the dialect).
- **Section rename to "The Casefile"** — most opinionated piece. Reversible in one line if it doesn't sit right after seeing it live.
- **Removing live-demo/source buttons from listing cards** — this is a clear improvement (the whole panel is now the click target), but anyone deep-linking those buttons no longer has them on listings. The detail page exposes them prominently.
- **Images-first vs panels-first.** This design treats panels as the visual carrier, not screenshots. As you ship projects with great imagery, we may want an `image` variant that puts the screenshot behind the title with a halftone overlay. Out of scope for this redesign — easy to add later without breaking the rest.
