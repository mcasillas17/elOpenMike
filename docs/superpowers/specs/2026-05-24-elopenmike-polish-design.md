# elOpenMike Polish — Design Spec

> Plan 6 (final) of the elOpenMike personal site. Builds on Plans 1–5 (live at https://elopenmike.com).

**Date:** 2026-05-24

## Goal

Final polish across six independent workstreams: complete SEO/discoverability (incl. dynamic OG images), an accessibility + responsive pass (skip-link, mobile nav, WCAG-AA contrast), subtle CSS animations, a Spider-Man easter egg, Playwright e2e smoke coverage, and a small contact-form fix. Each workstream ships independently; none depends on another.

## Locked decisions

- **OG images:** dynamic, via Next's `next/og` `ImageResponse`.
- **Contrast:** keep the approved vivid hexes (`--color-web #1b6fe3`, `--color-spidey #e62429`) for large/decorative use; add slightly brighter **AA (≥4.5:1)** variants for small text.
- **Animations:** CSS-only (no Framer Motion), gated behind `prefers-reduced-motion`.
- **Spidey-mode:** Konami code + tap fallback; reuses the existing `WebCorner` motif + a "THWIP!" toast; session toggle.
- **Playwright:** chromium-only, `webServer` build→start, smoke + contact-validation (no real email send), pinned to a mature version, added to CI.
- **Mobile nav:** add a disclosure menu (the current nav is `hidden sm:flex` → invisible on mobile).

## Scope

In scope: the six workstreams below. Out of scope: anything requiring new content from the owner (real comedy clips, Turing photos, project screenshots); a CMS; analytics; i18n.

---

## Workstream A — SEO & discoverability

**Files:** `src/app/layout.tsx` (modify), `src/lib/og.tsx` (create, shared OG template + font loader), `src/app/opengraph-image.tsx` (create), `src/app/twitter-image.tsx` (create), `src/app/blog/[slug]/opengraph-image.tsx` (create), `src/app/sitemap.ts` (create), `src/app/robots.ts` (create), `src/components/seo/JsonLd.tsx` (create).

- **Metadata completeness:** every route already exports `title`/`description`; add site-wide `openGraph` + `twitter` (`card: "summary_large_image"`) in the root metadata. Next auto-wires the `opengraph-image`/`twitter-image` files into tags.
- **Dynamic OG images:** a shared template in `src/lib/og.tsx` returns an `ImageResponse` (1200×630) on the dark canvas with the web motif, name/role, and an optional title line. Root `opengraph-image.tsx` renders the default card; `twitter-image.tsx` reuses it; `blog/[slug]/opengraph-image.tsx` renders the post title. Fonts: load a bundled Sora/Inter `.ttf` (read from `node_modules` or a `public`/`assets` copy) and pass bytes to `ImageResponse` (Satori needs explicit font data). Runtime: Node (default) — works in the Fly standalone container (Satori + resvg WASM, no `sharp`). **Verified by `pnpm build` succeeding and the og routes emitting images.**
- **`sitemap.ts`:** `MetadataRoute.Sitemap` listing static routes (`/`, `/projects`, `/comedy`, `/blog`, `/contact`) plus dynamic `projects/[slug]` (from `getAllSlugs`) and `blog/[slug]` (from `getPostSlugs`), with `lastModified`.
- **`robots.ts`:** allow all, reference the sitemap URL.
- **JSON-LD:** `JsonLd` component renders a `<script type="application/ld+json">` with a `Person` (name, jobTitle, url, sameAs = socials) and `WebSite` graph; included once in the layout.

**Tests:** `sitemap()` returns the expected route set incl. dynamic slugs; `robots()` allows all + has sitemap; `JsonLd` outputs valid JSON with `@type: Person`. OG images verified by build (no unit test of pixels).

---

## Workstream B — Accessibility & responsive

**Files:** `src/app/layout.tsx` (skip-link + `<main id="main" tabIndex={-1}>`), `src/app/globals.css` (AA token variants, skip-link styles), `src/components/layout/Header.tsx` (mobile nav), `src/components/ui/Section.tsx` and others (swap small-text accent classes), assorted aria/alt fixes.

- **Skip link:** first focusable element in `<body>` — an anchor to `#main`, visually hidden until focused (`.skip-link` using the existing `sr-only`-style approach but becoming visible on `:focus`). `<main>` gets `id="main"` and `tabIndex={-1}`.
- **Contrast (AA variants):** add `--color-web-strong` and `--color-spidey-strong` to `@theme` in `globals.css`, tuned to **≥4.5:1 on `--color-canvas`** (brighter shades of the existing blue/red; exact hexes chosen during implementation and verified with a contrast check). Switch *small-text* usages to the `-strong` variants: section eyebrows (`text-web` in `Section`/page eyebrows), inline links, contact error text (`text-spidey`), and nav link active/hover. Leave large headings, the primary button fill, and decorative motifs on the original vivid tokens. Verify button text (white on `--color-spidey`) meets AA for its size; adjust if needed.
- **Mobile nav:** the nav links are hidden under `sm:`. Add a client disclosure menu (hamburger button, `aria-expanded`/`aria-controls`, Esc to close, focus moves into the panel, links close it on click) shown below `sm`. Desktop behavior unchanged.
- **Sweep:** confirm landmark roles, `aria-label`s on icon-only links, image `alt` text, logical heading order, and visible `focus-visible` rings throughout.

**Tests:** skip-link present and targets `#main`; mobile-nav toggle opens/closes and exposes the nav links (RTL, `aria-expanded`); a token/class check that small-text accent classes use the `-strong` variants (lightweight assertion on rendered className or a globals snapshot). Manual: an axe/Lighthouse pass during implementation.

---

## Workstream C — Subtle animations (CSS-only)

**Files:** `src/components/ui/Reveal.tsx` (create, client), `src/app/globals.css` (reveal + reduced-motion rules), selective use in section components.

- **Reveal:** a small client component wrapping children in a div that starts at `opacity-0 translate-y-*` and adds an `is-visible` class via `IntersectionObserver` when it enters the viewport, transitioning to visible. Used to gently reveal home sections / cards. (jsdom already stubs `IntersectionObserver` in `vitest.setup.ts`.)
- **Hover micro-interactions:** subtle CSS lift/scale on cards and buttons via existing utility classes/transitions.
- **Reduced motion:** under `@media (prefers-reduced-motion: reduce)`, reveal content is immediately visible (no opacity/transform transition) and hover transforms are disabled. No new dependency.

**Tests:** `Reveal` renders its children and, when the stubbed `IntersectionObserver` callback fires, applies the visible state; renders children regardless (no content hidden from users/SSR without JS — start visible if JS/IO unavailable to avoid hiding content).

---

## Workstream D — Spidey-mode easter egg

**Files:** `src/components/spidey/SpideyMode.tsx` (create, client), `src/lib/useKonami.ts` (create, hook), included in `src/app/layout.tsx`. Reuses `src/components/ui/WebCorner.tsx`.

- **Trigger:** `useKonami` listens for the sequence ↑↑↓↓←→←→ B A; plus a tap fallback (clicking the red `.`/accent in the logo N times within a short window).
- **Effect:** toggles a session "web-slinger" mode held in component state — overlays the `WebCorner` motif in page corners site-wide and shows a brief comic **"THWIP!"** toast (auto-dismiss). Triggering again toggles it off. Optionally a small persistent "🕷️ web-slinger mode — off" control once discovered.
- **Constraints:** reduced-motion-aware (toast fades simply / no large motion when reduced); keyboard-dismissible (Esc); `aria-live="polite"` announces toggling; no focus trap; pointer-events none on decorative overlay. No dependency.

**Tests:** `useKonami` fires its callback after the correct key sequence and not on a wrong one; `SpideyMode` toggles the overlay/toast on trigger and hides on re-trigger (simulate the sequence via `fireEvent.keyDown`).

---

## Workstream E — Playwright e2e

**Files:** `playwright.config.ts` (create), `e2e/smoke.spec.ts` + `e2e/contact.spec.ts` (create), `package.json` (scripts), `.github/workflows/deploy.yml` (add an e2e job), `.gitignore` (ignore `playwright-report/`, `test-results/`), `vitest.config.mts` (ensure `e2e/**` is excluded from the vitest run).

- **Dependency:** `@playwright/test` as a devDependency, **pinned to a version published >7 days ago** (the 7-day `minimumReleaseAge` cooldown; if `pnpm add` is blocked, pin explicitly). Browser install via `pnpm exec playwright install --with-deps chromium` (CI) — chromium only.
- **Config:** `webServer` runs `pnpm build && pnpm start` on a fixed port with `reuseExistingServer` locally; single chromium project; sensible timeouts; runs with no `RESEND_API_KEY` (so the contact happy-path is intentionally not exercised — see below).
- **Specs:**
  - `smoke.spec.ts`: home renders hero + nav; clicking "Blog" reaches `/blog`; opening a post renders its title; `/contact` renders the form.
  - `contact.spec.ts`: submitting empty shows field validation errors; the honeypot input exists and is hidden; (does **not** submit a valid message — no live email from CI).
- **Scripts:** `"e2e": "playwright test"`, `"e2e:ui": "playwright test --ui"`.
- **CI:** a new `e2e` job in the workflow (after `test`), chromium-only, caches the browser; it gates `deploy` alongside `test`. Keep it lean to limit added CI minutes.

**Note on coverage:** the contact happy-path (real send) stays covered by the existing unit tests with Resend mocked; e2e deliberately avoids triggering real email.

---

## Workstream F — Contact `mailto:` fix

**Files:** `src/components/contact/ContactForm.tsx`, its test.

- Render the error region so the support email is a clickable `mailto:micasillm@gmail.com` link (the deferred touch from Plan 5). The action's error string keeps the address; the component wraps/links it. Update the existing error test to assert an anchor with the correct `href`.

---

## Acceptance criteria

- `pnpm test` (unit) green incl. new tests; `pnpm run build` exit 0 with OG routes emitting images and `/contact` still prerendered.
- `pnpm e2e` passes locally; the CI e2e job passes and gates deploy.
- `sitemap.xml` and `robots.txt` are served; JSON-LD validates; OG/Twitter image tags resolve to the dynamic images.
- Skip-link works; mobile nav opens/closes and is keyboard-accessible; small-text accents meet AA (≥4.5:1); animations respect `prefers-reduced-motion`.
- Spidey-mode toggles on the sequence and is dismissible; nothing flashes or traps focus.
- No new always-on runtime dependency (next/og ships with Next; Playwright is dev-only).

## Risks & mitigations

- **next/og in the standalone container:** Satori needs explicit font bytes and runs WASM; mitigate by bundling a font and verifying via `pnpm build` + a local container/`next start` check of an og route before merge.
- **Playwright cooldown / CI time:** pin a mature `@playwright/test`; chromium-only + browser caching; keep specs to smoke scope.
- **Contrast tuning:** pick `-strong` hexes with an explicit ratio check against `--color-canvas`; don't eyeball.
- **Plan breadth:** six independent workstreams — execute and review one workstream group at a time; each is independently shippable, so a late cut (e.g., dropping e2e) doesn't block the rest.
