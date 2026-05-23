# elOpenMike — Personal Website Design

**Date:** 2026-05-23
**Owner:** Miguel Casillas (`mcasillas17`)
**Repo:** `github.com/mcasillas17/elOpenMike`
**Status:** Approved design — ready for implementation planning

---

## 1. Purpose

A dark, modern personal website that serves as an all-in-one hub for Miguel
Casillas: Software Engineer, builder, and stand-up comedian. It must work for
multiple audiences at once:

- **Recruiters / hiring managers** — clear, scannable experience and a
  downloadable résumé. This is the professional spine; the site must never read
  as unserious.
- **Peers and network** — a "this is me" home base, showcasing projects and
  personality.
- **Everyone else** — the comedy and personal touches (Spider-Man fandom,
  Turing the dog, fitness, movies/TV) that make it memorable.

**Personality dial: subtle & tasteful.** Spider-Man shows up in the color
palette, small web/swing accents, and opt-in easter eggs — never costumes or
gimmicks that undercut the professional read.

## 2. Visual direction (locked)

**"Midnight Web × Halftone" — dark mode only.**

| Token        | Value     | Use                                  |
|--------------|-----------|--------------------------------------|
| Canvas       | `#0B0E14` | Page background (near-black navy)     |
| Spidey Red   | `#E62429` | Primary accent, name, primary buttons |
| Web Blue     | `#1B6FE3` | Secondary accent, eyebrow labels      |
| Text         | `#E8EAED` | Body/heading text                     |
| Surface/Dots | `#171C28` | Cards, borders, halftone dot color    |
| Muted text   | `#9AA3B2` | Subtitles, secondary copy             |

- **Texture:** faint halftone dot-grid background (`radial-gradient(#171C28 1px,
  transparent 1.5px)`, ~11px grid) applied site-wide. Deliberately subtle.
- **Accent motif:** web-grid corner accent (crossed red/blue diagonal lines at
  ~15% opacity) on the hero and section headers.
- **Typography:** **Sora** (display/headings, weights 600/800) paired with
  **Inter** (body, weights 400/500). Loaded via `next/font`.

## 3. Tech stack

- **Next.js 15 (App Router) + TypeScript**
- **Tailwind CSS** — design tokens above encoded as theme colors; halftone +
  web-corner provided as reusable utilities/components.
- **Framer Motion** — tasteful scroll-reveal ("swing-in") and hover animations.
  All motion respects `prefers-reduced-motion`.
- **MDX** — blog posts authored as `.mdx` files.
- **Typed content data** — projects and experience live in typed TypeScript data
  files (no CMS in v1; easy to edit, version-controlled).
- **Resend** — transactional email for the contact form, called from a Next.js
  Route Handler.
- **Deploy:** Vercel (free tier, zero-config).

**Alternatives considered:** CSS Modules (Tailwind chosen for speed/consistency);
headless CMS (overkill for a one-person site); `mailto`-only contact (user chose
a real form).

## 4. Information architecture (hybrid)

A single scrolling home page for storytelling, plus dedicated routes where depth
and SEO matter.

| Route             | Description                                                        |
|-------------------|--------------------------------------------------------------------|
| `/`               | Single-scroll home (sections below) with sticky nav, smooth-scroll anchors, and active-section highlighting |
| `/projects`       | Full project grid with filter tags                                 |
| `/projects/[slug]`| Project detail (problem, stack, screenshots, links)                |
| `/blog`           | Post list                                                          |
| `/blog/[slug]`    | MDX blog post                                                      |
| `/comedy`         | Fuller comedy page (embedded clips, photo gallery, show info)      |
| `/api/contact`    | Route Handler: validates + sends contact email via Resend          |

**Home page section order:** Hero → About + Turing → Experience → Projects
preview (top 3) → Comedy teaser → Contact.

**Résumé:** PDF stored in `/public`; prominent "Download résumé" buttons in the
Hero and Experience sections.

## 5. Sections in detail

- **Hero** — name, one-liner ("Builder by day, open-mic by night"), two CTAs
  (View work / Download résumé), web-grid corner accent.
- **About + Turing** — engineering story plus the personal layer: Turing (blue
  merle Mini American Shepherd) with photos, fitness, and movies/TV. Personable
  without losing professionalism.
- **Experience** — vertical timeline of roles; clean, scannable, recruiter-first.
- **Projects** — cards linking to detail pages. Data model includes a
  `type`/tag field so open-source contributions can be added later as tagged
  items without restructuring.
- **Comedy** — embedded video clips + photo gallery + show info; the
  differentiator. Teased on home, full content on `/comedy`.
- **Contact** — real form (name, email, message) posting to `/api/contact`
  (Resend), with client + server validation and themed success/error states.
  Email + social links (GitHub, LinkedIn) shown alongside.

## 6. Personal touches & easter eggs (subtle, opt-in)

- Web-line hover effects on links/buttons.
- "Swing-in" scroll-reveal animations.
- A hidden **"Spidey mode"** toggle (e.g., logo triple-click or Konami code)
  that gently amps the web accents — invisible to recruiters, fun for fans.
- A Turing cameo somewhere unexpected.
- Section dividers with a faint web motif.

## 7. Content model

All content slots are real and ready to be populated (user has résumé, project
details, comedy media, and photos of himself + Turing). Until files are dropped
in, tasteful placeholders are used.

- `data/experience.ts` — typed role entries (company, title, dates, bullets).
- `data/projects.ts` — typed project entries (slug, title, summary, tags, stack,
  links, screenshots, body).
- `content/blog/*.mdx` — blog posts with frontmatter (title, date, excerpt, tags).
- `public/resume.pdf`, `public/images/**` — static assets.

## 8. Cross-cutting requirements

- **Responsive:** mobile-first, fully responsive across breakpoints.
- **Accessibility:** semantic HTML, visible focus states, AA color contrast
  (palette passes), `prefers-reduced-motion` support, alt text on all media.
- **SEO:** Next Metadata API per route, Open Graph image, `sitemap.xml`,
  `robots.txt`.
- **Error handling:** themed `not-found` ("This page got webbed up"),
  `error.tsx` boundary, `loading.tsx` states, image fallbacks. Contact form
  surfaces server/network failures with a clear retry message.
- **Performance:** static rendering where possible; `next/image` for media;
  near-zero unnecessary client JS.

## 9. Testing strategy

Pragmatic, not exhaustive:

- **Vitest + React Testing Library** — key components (Button, contact form
  validation, project card, nav active-state logic).
- **Contact API** — unit test the Route Handler (valid payload calls Resend,
  invalid payload returns 400) with Resend mocked.
- **Playwright smoke test** — home page loads, nav anchors scroll, résumé link
  resolves, `/projects` and `/blog` render.

## 10. Suggested build order (for the implementation plan)

1. Project scaffold: Next.js + TS + Tailwind + fonts + design tokens + base
   layout (halftone background, web-corner, Button, Section primitives).
2. Home shell: sticky nav, smooth-scroll, section scaffolding with placeholders.
3. Hero + About/Turing.
4. Experience timeline + résumé download.
5. Projects (data model, grid, detail pages) + home preview.
6. Comedy section + `/comedy` page.
7. Blog (MDX pipeline, list, post pages).
8. Contact form + `/api/contact` (Resend).
9. Easter eggs / Spidey-mode polish + animations.
10. SEO, error/loading states, accessibility pass, tests.
11. Deploy to Vercel.

## 11. Explicitly out of scope (v1)

- Dedicated Open Source section (projects data model leaves room to add it later).
- Light mode.
- Headless CMS / admin UI.
- Comments, analytics dashboards, or newsletter signup.
