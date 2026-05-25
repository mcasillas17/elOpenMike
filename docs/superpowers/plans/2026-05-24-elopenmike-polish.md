# elOpenMike Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Final polish across six independent workstreams — SEO/OG, accessibility + responsive, subtle animations, a Spider-Man easter egg, Playwright e2e, and a contact-form `mailto:` fix.

**Architecture:** Each workstream is a self-contained task group; none depends on another, so they can be reviewed/shipped independently. New code follows existing patterns (typed loaders, design-system primitives, Tailwind v4 `@theme` tokens, client-island components inside server components).

**Tech Stack:** Next.js 16 (App Router, `next/og`, metadata routes), React 19, Tailwind CSS v4, Vitest + RTL, Playwright (chromium), pnpm.

**Spec:** `docs/superpowers/specs/2026-05-24-elopenmike-polish-design.md`

**Conventions:** tokens `--color-canvas/surface/spidey/web/ink/muted/edge/spidey-dark` in `src/app/globals.css`; `font-display`/`font-body` (never `font-[family-name:...]`); `pnpm test` / `pnpm run build`. The site auto-deploys on push to main, and the live page serves a stale prerender for ~5 min after deploy (don't judge a deploy in the first few minutes).

---

## File Structure

| File | Workstream | Responsibility |
|------|-----------|----------------|
| `src/components/contact/ContactForm.tsx` (mod) | F | error email → `mailto:` link |
| `src/components/layout/SkipLink.tsx` (new) | B | skip-to-content anchor |
| `src/app/layout.tsx` (mod) | B,C,D,A | skip link, `main#main`, `js`-class script, `<JsonLd/>`, `<SpideyMode/>`, twitter meta |
| `src/app/globals.css` (mod) | B,C | `-strong` tokens, skip-link + reveal CSS, reduced-motion |
| `src/components/layout/Header.tsx` (mod) | B,D | mobile nav disclosure; logo-tap spidey trigger |
| `src/components/ui/Section.tsx` (mod) | B,C | eyebrow `-strong`; wrap content in `<Reveal>` |
| `src/app/sitemap.ts` (new) | A | sitemap |
| `src/app/robots.ts` (new) | A | robots |
| `src/components/seo/JsonLd.tsx` (new) | A | Person/WebSite JSON-LD |
| `src/lib/og.tsx` (new) | A | shared OG `ImageResponse` template |
| `src/app/opengraph-image.tsx` (new) | A | default OG image |
| `src/app/blog/[slug]/opengraph-image.tsx` (new) | A | per-post OG image |
| `src/components/ui/Reveal.tsx` (new) | C | IntersectionObserver reveal |
| `src/components/projects/ProjectCard.tsx`, `src/components/blog/PostCard.tsx` (mod) | C | hover lift (`motion-safe:`) |
| `src/lib/useKonami.ts` (new) | D | Konami-code hook |
| `src/components/spidey/SpideyMode.tsx` (new) | D | web-slinger overlay + toast |
| `src/components/spidey/SpideyTrigger.tsx` (new) | D | subtle footer 🕷️ toggle |
| `src/components/layout/Footer.tsx` (mod) | D | mount `<SpideyTrigger/>` |
| `playwright.config.ts`, `e2e/*.spec.ts` (new) | E | browser smoke tests |
| `package.json`, `.gitignore`, `.github/workflows/deploy.yml` (mod) | E | e2e script, ignores, CI job |

---

## Workstream F — Contact `mailto:` fix

### Task 1: Linkify the contact error email

**Files:** Modify `src/components/contact/ContactForm.tsx`; Modify `src/components/contact/__tests__/ContactForm.test.tsx`.

- [ ] **Step 1: Update the error test** — replace the existing "shows an error message when submit fails" test with one asserting a real link:

```tsx
  it("shows an error with a clickable mailto link when submit fails", async () => {
    renderWith({
      ok: false,
      error:
        "Something went wrong sending your message. Please email me directly at micasillm@gmail.com.",
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    const link = await screen.findByRole("link", {
      name: "micasillm@gmail.com",
    });
    expect(link).toHaveAttribute("href", "mailto:micasillm@gmail.com");
  });
```

- [ ] **Step 2: Run it, expect FAIL**

Run: `pnpm test -- src/components/contact/__tests__/ContactForm.test.tsx`
Expected: FAIL (no link role found).

- [ ] **Step 3: Render the email as a link.** In `ContactForm.tsx`, add `Fragment` to the React import (`import { useActionState, useState, type ReactNode, Fragment } from "react";`) and a constant near the top (after `initialState`):

```tsx
const CONTACT_EMAIL = "micasillm@gmail.com";
```

Replace the error paragraph in the `aria-live` region:

```tsx
        {state.error && (
          <p className="text-sm text-spidey">
            {state.error.split(CONTACT_EMAIL).map((part, i, arr) => (
              <Fragment key={i}>
                {part}
                {i < arr.length - 1 && (
                  <a
                    href={`mailto:${CONTACT_EMAIL}`}
                    className="underline hover:text-ink"
                  >
                    {CONTACT_EMAIL}
                  </a>
                )}
              </Fragment>
            ))}
          </p>
        )}
```

- [ ] **Step 4: Run tests, expect PASS**

Run: `pnpm test -- src/components/contact/__tests__/ContactForm.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/contact/ContactForm.tsx src/components/contact/__tests__/ContactForm.test.tsx
git commit -m "feat(contact): linkify the error fallback email"
```

---

## Workstream B — Accessibility & responsive

### Task 2: Skip-to-content link

**Files:** Create `src/components/layout/SkipLink.tsx` + `src/components/layout/__tests__/SkipLink.test.tsx`; Modify `src/app/layout.tsx`, `src/app/globals.css`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/layout/__tests__/SkipLink.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SkipLink } from "@/components/layout/SkipLink";

describe("SkipLink", () => {
  it("links to #main", () => {
    render(<SkipLink />);
    const link = screen.getByRole("link", { name: /skip to content/i });
    expect(link).toHaveAttribute("href", "#main");
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `pnpm test -- src/components/layout/__tests__/SkipLink.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the component**

```tsx
// src/components/layout/SkipLink.tsx
export function SkipLink() {
  return (
    <a href="#main" className="skip-link">
      Skip to content
    </a>
  );
}
```

- [ ] **Step 4: Add the CSS.** Append to `src/app/globals.css`:

```css
/* Skip-to-content: off-screen until focused. */
.skip-link {
  position: absolute;
  left: -9999px;
  top: 0;
  z-index: 100;
}
.skip-link:focus {
  left: 1rem;
  top: 1rem;
  padding: 0.5rem 0.875rem;
  border-radius: 0.5rem;
  background-color: var(--color-surface);
  border: 1px solid var(--color-edge);
  color: var(--color-ink);
  outline: 2px solid var(--color-web);
  outline-offset: 2px;
}
```

- [ ] **Step 5: Wire into the layout.** In `src/app/layout.tsx`, import `SkipLink` and make `<body>` start with it; give `<main>` an id + focus target:

```tsx
import { SkipLink } from "@/components/layout/SkipLink";
// ...
      <body className="font-body antialiased">
        <SkipLink />
        <Header />
        <main id="main" tabIndex={-1}>{children}</main>
        <Footer />
      </body>
```

- [ ] **Step 6: Run tests + build**

Run: `pnpm test -- src/components/layout/__tests__/SkipLink.test.tsx` → PASS.
Run: `pnpm run build` → exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/components/layout/SkipLink.tsx src/components/layout/__tests__/SkipLink.test.tsx src/app/layout.tsx src/app/globals.css
git commit -m "feat(a11y): add skip-to-content link and main landmark id"
```

### Task 3: WCAG-AA accent variants for small text

**Files:** Modify `src/app/globals.css`, `src/components/ui/Section.tsx`, `src/components/layout/Header.tsx`, `src/components/contact/ContactForm.tsx`, plus page eyebrows; Modify `src/components/ui/__tests__/Section.test.tsx`.

- [ ] **Step 1: Add the tokens.** In `src/app/globals.css`, inside `@theme`, after `--color-spidey-dark`:

```css
  --color-web-strong: #3b82f6;
  --color-spidey-strong: #ff5a5a;
```

These must measure **≥4.5:1 against `--color-canvas` (#0b0e14)**. Verify each with a contrast checker (e.g. WebAIM); if either falls short, lighten it (e.g. blue → `#4c8dff`, red → `#ff6b6b`) until it passes, keeping it visibly close to the original.

- [ ] **Step 2: Update the Section eyebrow test** — assert the AA variant. In `src/components/ui/__tests__/Section.test.tsx`, add:

```tsx
  it("renders the eyebrow with the AA contrast variant", () => {
    render(<Section id="x" eyebrow="Eyebrow" title="Title">body</Section>);
    expect(screen.getByText("Eyebrow")).toHaveClass("text-web-strong");
  });
```

(Keep existing imports `render`, `screen`. If `Section` isn't already imported in the test, add `import { Section } from "@/components/ui/Section";`.)

- [ ] **Step 3: Run, expect FAIL**

Run: `pnpm test -- src/components/ui/__tests__/Section.test.tsx`
Expected: FAIL (still `text-web`).

- [ ] **Step 4: Swap small-text accents to the `-strong` variants.**

In `src/components/ui/Section.tsx`, the eyebrow `<p>`: change `text-web` → `text-web-strong`.

In `src/components/layout/Header.tsx`, the active nav link: change `isActive ? "text-web"` → `isActive ? "text-web-strong"`.

In `src/components/contact/ContactForm.tsx`, the error `<p>`: change `className="text-sm text-spidey"` → `className="text-sm text-spidey-strong"`.

Page eyebrows use the small uppercase `text-web` paragraph. Update each occurrence to `text-web-strong`:
- `src/app/comedy/page.tsx` (eyebrow `<p>` and the two section `<h2>` eyebrows)
- `src/app/blog/page.tsx` (eyebrow)
- `src/app/contact/page.tsx` (eyebrow)
- `src/app/blog/[slug]/page.tsx` (any small `text-web` eyebrow/label)

Find every remaining small-text occurrence and confirm none are missed:

Run: `grep -rn "text-web\b\|text-spidey\b" src/ --include=*.tsx`
For each hit, if it styles **small text** (eyebrows, labels, links, error text, nav), use the `-strong` variant. Leave large headings, the `Button` primary fill, `WebCorner`, and large decorative uses on the original tokens.

- [ ] **Step 5: Run tests + build**

Run: `pnpm test` → all PASS (incl. the new Section assertion).
Run: `pnpm run build` → exit 0.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(a11y): AA-contrast accent variants for small text"
```

### Task 4: Mobile navigation menu

**Files:** Modify `src/components/layout/Header.tsx`; Modify `src/components/layout/__tests__/Header.test.tsx`.

- [ ] **Step 1: Add the failing test** — append to `src/components/layout/__tests__/Header.test.tsx`:

```tsx
  it("toggles a mobile menu exposing the nav links", () => {
    render(<Header />);
    const toggle = screen.getByRole("button", { name: /menu/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    // the mobile panel exposes nav links (Experience appears twice now: desktop + mobile)
    expect(screen.getAllByRole("link", { name: "Experience" }).length).toBeGreaterThan(1);
  });
```

Add `fireEvent` to the test's imports: `import { render, screen, fireEvent } from "@testing-library/react";`.

- [ ] **Step 2: Run, expect FAIL**

Run: `pnpm test -- src/components/layout/__tests__/Header.test.tsx`
Expected: FAIL (no menu button).

- [ ] **Step 3: Implement the disclosure.** Replace the body of `src/components/layout/Header.tsx` with:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { site } from "@/lib/site";
import { useActiveSection } from "@/lib/useActiveSection";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";

export function Header() {
  const ids = site.nav.map((item) => item.href.split("#")[1] ?? "");
  const active = useActiveSection(ids);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b border-[#171c28]/80 bg-canvas/80 backdrop-blur">
      <Container className="flex h-16 items-center justify-between">
        <Link href="/" className="font-display text-lg font-extrabold">
          {site.firstName} <span className="text-spidey">{site.lastName}</span>
        </Link>

        <nav aria-label="Site navigation" className="flex items-center gap-6">
          <ul className="hidden items-center gap-6 sm:flex">
            {site.nav.map((item) => {
              const id = item.href.split("#")[1] ?? "";
              const isActive = active === id;
              return (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className={`text-sm transition-colors ${
                      isActive ? "text-web-strong" : "text-muted hover:text-ink"
                    }`}
                  >
                    {item.label}
                  </a>
                </li>
              );
            })}
          </ul>
          <Button href={site.resumeHref} download variant="secondary">
            Resume
          </Button>
          <button
            type="button"
            aria-label="Menu"
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((o) => !o)}
            className="sm:hidden inline-flex h-9 w-9 items-center justify-center rounded-lg border border-edge text-ink"
          >
            <span aria-hidden="true">{open ? "✕" : "☰"}</span>
          </button>
        </nav>
      </Container>

      {open && (
        <div id="mobile-nav" className="sm:hidden border-t border-edge bg-canvas">
          <Container className="py-3">
            <ul className="flex flex-col gap-1">
              {site.nav.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="block rounded-lg px-2 py-2 text-sm text-muted hover:bg-surface hover:text-ink"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </Container>
        </div>
      )}
    </header>
  );
}
```

- [ ] **Step 4: Run tests + build**

Run: `pnpm test -- src/components/layout/__tests__/Header.test.tsx` → PASS (all Header tests).
Run: `pnpm run build` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/Header.tsx src/components/layout/__tests__/Header.test.tsx
git commit -m "feat(a11y): add mobile navigation disclosure menu"
```

---

## Workstream A — SEO & discoverability

### Task 5: sitemap + robots

**Files:** Create `src/app/sitemap.ts`, `src/app/robots.ts`, `src/app/__tests__/sitemap.test.ts`, `src/app/__tests__/robots.test.ts`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/app/__tests__/sitemap.test.ts
import { describe, it, expect } from "vitest";
import sitemap from "@/app/sitemap";

describe("sitemap", () => {
  it("includes the core static routes, projects, and posts", () => {
    const urls = sitemap().map((e) => e.url);
    expect(urls).toContain("https://elopenmike.com");
    expect(urls).toContain("https://elopenmike.com/contact");
    expect(urls).toContain("https://elopenmike.com/blog");
    expect(urls.some((u) => u.startsWith("https://elopenmike.com/projects/"))).toBe(true);
    expect(urls.some((u) => u.startsWith("https://elopenmike.com/blog/"))).toBe(true);
  });
});
```

```ts
// src/app/__tests__/robots.test.ts
import { describe, it, expect } from "vitest";
import robots from "@/app/robots";

describe("robots", () => {
  it("allows all and references the sitemap", () => {
    const r = robots();
    expect(r.sitemap).toBe("https://elopenmike.com/sitemap.xml");
    expect(r.rules).toMatchObject({ userAgent: "*", allow: "/" });
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `pnpm test -- src/app/__tests__/sitemap.test.ts src/app/__tests__/robots.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

```ts
// src/app/sitemap.ts
import type { MetadataRoute } from "next";
import { getAllSlugs } from "@/data/projects";
import { getPostSlugs } from "@/lib/blog";

const BASE = "https://elopenmike.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const staticPaths = ["", "/projects", "/comedy", "/blog", "/contact"];
  const entries: MetadataRoute.Sitemap = staticPaths.map((p) => ({
    url: `${BASE}${p}`,
    lastModified: now,
  }));
  for (const slug of getAllSlugs()) {
    entries.push({ url: `${BASE}/projects/${slug}`, lastModified: now });
  }
  for (const slug of getPostSlugs()) {
    entries.push({ url: `${BASE}/blog/${slug}`, lastModified: now });
  }
  return entries;
}
```

```ts
// src/app/robots.ts
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: "https://elopenmike.com/sitemap.xml",
  };
}
```

- [ ] **Step 4: Run tests, expect PASS**

Run: `pnpm test -- src/app/__tests__/sitemap.test.ts src/app/__tests__/robots.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/sitemap.ts src/app/robots.ts src/app/__tests__/sitemap.test.ts src/app/__tests__/robots.test.ts
git commit -m "feat(seo): add sitemap and robots"
```

### Task 6: JSON-LD structured data

**Files:** Create `src/components/seo/JsonLd.tsx` + `src/components/seo/__tests__/JsonLd.test.tsx`; Modify `src/app/layout.tsx`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/seo/__tests__/JsonLd.test.tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { JsonLd } from "@/components/seo/JsonLd";

describe("JsonLd", () => {
  it("emits a Person graph as ld+json", () => {
    const { container } = render(<JsonLd />);
    const script = container.querySelector('script[type="application/ld+json"]');
    expect(script).toBeTruthy();
    const data = JSON.parse(script!.textContent!);
    const types = data["@graph"].map((n: { "@type": string }) => n["@type"]);
    expect(types).toContain("Person");
    expect(types).toContain("WebSite");
    expect(JSON.stringify(data)).toContain("Miguel Casillas");
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `pnpm test -- src/components/seo/__tests__/JsonLd.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```tsx
// src/components/seo/JsonLd.tsx
import { site } from "@/lib/site";

const BASE = "https://elopenmike.com";

export function JsonLd() {
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Person",
        name: site.name,
        jobTitle: site.role,
        url: BASE,
        sameAs: site.socials
          .filter((s) => s.href.startsWith("http"))
          .map((s) => s.href),
      },
      { "@type": "WebSite", name: site.name, url: BASE },
    ],
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
```

- [ ] **Step 4: Mount in the layout.** In `src/app/layout.tsx`, import and render `<JsonLd />` just inside `<body>` (after `<SkipLink />`):

```tsx
import { JsonLd } from "@/components/seo/JsonLd";
// inside body:
        <SkipLink />
        <JsonLd />
```

- [ ] **Step 5: Run tests + build**

Run: `pnpm test -- src/components/seo/__tests__/JsonLd.test.tsx` → PASS.
Run: `pnpm run build` → exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/components/seo/JsonLd.tsx src/components/seo/__tests__/JsonLd.test.tsx src/app/layout.tsx
git commit -m "feat(seo): add Person/WebSite JSON-LD"
```

### Task 7: Dynamic OG images

**Files:** Create `src/lib/og.tsx`, `src/app/opengraph-image.tsx`, `src/app/blog/[slug]/opengraph-image.tsx`; Modify `src/app/layout.tsx` (twitter metadata).

This task is verified by the build emitting images (no unit test of pixels).

- [ ] **Step 1: Shared OG template**

```tsx
// src/lib/og.tsx
import { ImageResponse } from "next/og";

export const ogSize = { width: 1200, height: 630 };
export const ogContentType = "image/png";

export function renderOgImage(title?: string) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          backgroundColor: "#0b0e14",
          backgroundImage:
            "repeating-linear-gradient(135deg, #e6242933 0 1px, transparent 1px 24px), repeating-linear-gradient(45deg, #1b6fe333 0 1px, transparent 1px 24px)",
          color: "#e8eaed",
        }}
      >
        <div style={{ display: "flex", fontSize: 34, color: "#ff5a5a", fontWeight: 700 }}>
          elopenmike.com
        </div>
        <div style={{ display: "flex", fontSize: 76, fontWeight: 800, marginTop: 12 }}>
          {title ?? "Miguel Casillas"}
        </div>
        <div style={{ display: "flex", fontSize: 36, color: "#9aa3b2", marginTop: 16 }}>
          {title ? "elOpenMike — the blog" : "Software Engineer · builder · stand-up comedian"}
        </div>
      </div>
    ),
    { ...ogSize },
  );
}
```

> **Font note:** `ImageResponse` ships with a built-in font and renders Latin text without an explicit `fonts` option. If `pnpm build` (Step 4) errors complaining about fonts, bundle one: `mkdir -p src/og-assets && cp node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf src/og-assets/og.ttf`, then in `renderOgImage` read it with `import { readFileSync } from "node:fs"; import { join } from "node:path";` and pass `{ ...ogSize, fonts: [{ name: "og", data: readFileSync(join(process.cwd(), "src/og-assets/og.ttf")), style: "normal" }] }`. (OG images are generated at build time, where `src/` is present.)

- [ ] **Step 2: Root OG image route**

```tsx
// src/app/opengraph-image.tsx
import { renderOgImage, ogSize, ogContentType } from "@/lib/og";

export const alt = "Miguel Casillas — Software Engineer";
export const size = ogSize;
export const contentType = ogContentType;

export default function Image() {
  return renderOgImage();
}
```

- [ ] **Step 3: Per-post OG image route**

```tsx
// src/app/blog/[slug]/opengraph-image.tsx
import { renderOgImage, ogSize, ogContentType } from "@/lib/og";
import { getAllPosts, getPostSlugs } from "@/lib/blog";

export const alt = "elOpenMike blog post";
export const size = ogSize;
export const contentType = ogContentType;
export const dynamicParams = false;

export function generateStaticParams() {
  return getPostSlugs().map((slug) => ({ slug }));
}

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const title = getAllPosts().find((p) => p.slug === slug)?.title;
  return renderOgImage(title);
}
```

- [ ] **Step 4: Add twitter metadata + verify build.** In `src/app/layout.tsx` `metadata`, add a `twitter` block alongside `openGraph`:

```tsx
  twitter: {
    card: "summary_large_image",
    title: "Miguel Casillas — Software Engineer",
    description: "Software Engineer, builder, and stand-up comedian.",
  },
```

Run: `pnpm run build`
Expected: exit 0. The route list shows `/opengraph-image` and `/blog/[slug]/opengraph-image`. If it errors on fonts, apply the font note in Step 1 and rebuild.

- [ ] **Step 5: Commit**

```bash
git add src/lib/og.tsx src/app/opengraph-image.tsx "src/app/blog/[slug]/opengraph-image.tsx" src/app/layout.tsx src/og-assets 2>/dev/null
git commit -m "feat(seo): dynamic Open Graph images via next/og"
```

---

## Workstream C — Subtle animations

### Task 8: Reveal-on-scroll + hover lift

**Files:** Create `src/components/ui/Reveal.tsx` + `src/components/ui/__tests__/Reveal.test.tsx`; Modify `src/app/globals.css`, `src/app/layout.tsx`, `src/components/ui/Section.tsx`, `src/components/projects/ProjectCard.tsx`, `src/components/blog/PostCard.tsx`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/ui/__tests__/Reveal.test.tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Reveal } from "@/components/ui/Reveal";

afterEach(() => vi.unstubAllGlobals());

describe("Reveal", () => {
  it("renders its children", () => {
    render(<Reveal>hello world</Reveal>);
    expect(screen.getByText("hello world")).toBeInTheDocument();
  });

  it("adds is-visible when it intersects", () => {
    let cb: (entries: { isIntersecting: boolean }[]) => void = () => {};
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(c: typeof cb) { cb = c; }
        observe() { cb([{ isIntersecting: true }]); }
        disconnect() {}
        unobserve() {}
        takeRecords() { return []; }
      },
    );
    const { container } = render(<Reveal>content</Reveal>);
    expect(container.firstChild).toHaveClass("is-visible");
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `pnpm test -- src/components/ui/__tests__/Reveal.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement Reveal**

```tsx
// src/components/ui/Reveal.tsx
"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export function Reveal({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={`reveal ${visible ? "is-visible" : ""} ${className}`.trim()}>
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Add CSS (no-JS safe, reduced-motion safe).** Append to `src/app/globals.css`:

```css
/* Reveal-on-scroll. Visible by default so no-JS users see content;
   only the `js`-flagged document hides-then-reveals. */
.reveal {
  opacity: 1;
}
html.js .reveal {
  opacity: 0;
  transform: translateY(8px);
  transition: opacity 0.5s ease, transform 0.5s ease;
}
html.js .reveal.is-visible {
  opacity: 1;
  transform: none;
}
@media (prefers-reduced-motion: reduce) {
  html.js .reveal {
    opacity: 1;
    transform: none;
    transition: none;
  }
}
```

- [ ] **Step 5: Flag the document as JS-enabled (before paint).** In `src/app/layout.tsx`, add a tiny script as the first child of `<body>` (before `<SkipLink />`):

```tsx
        <script
          dangerouslySetInnerHTML={{
            __html: "document.documentElement.classList.add('js')",
          }}
        />
```

- [ ] **Step 6: Apply Reveal to sections.** In `src/components/ui/Section.tsx`, import `Reveal` and wrap the inner content:

```tsx
import { Reveal } from "@/components/ui/Reveal";
// ...
      <Container>
        <Reveal>
          {eyebrow && (
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-web-strong">
              {eyebrow}
            </p>
          )}
          <h2 className="mt-2 font-display text-3xl font-extrabold sm:text-4xl">
            {title}
          </h2>
          <div className="mt-10">{children}</div>
        </Reveal>
      </Container>
```

- [ ] **Step 7: Hover lift on cards (motion-safe).** In `src/components/projects/ProjectCard.tsx` and `src/components/blog/PostCard.tsx`, add to the root `<article>`'s className: `motion-safe:transition-transform motion-safe:hover:-translate-y-0.5`.

- [ ] **Step 8: Run tests + build**

Run: `pnpm test` → all PASS (Reveal + existing Section tests still green).
Run: `pnpm run build` → exit 0.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(motion): reveal-on-scroll and hover lift (reduced-motion safe)"
```

---

## Workstream D — Spidey-mode easter egg

### Task 9: Konami hook + web-slinger mode

**Files:** Create `src/lib/useKonami.ts` + `src/lib/__tests__/useKonami.test.tsx`; Create `src/components/spidey/SpideyMode.tsx` + `src/components/spidey/__tests__/SpideyMode.test.tsx`; Create `src/components/spidey/SpideyTrigger.tsx`; Modify `src/app/layout.tsx`, `src/components/layout/Footer.tsx`.

- [ ] **Step 1: Write the failing hook test**

```tsx
// src/lib/__tests__/useKonami.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { useKonami } from "@/lib/useKonami";

function Probe({ onHit }: { onHit: () => void }) {
  useKonami(onHit);
  return null;
}

const SEQ = ["ArrowUp","ArrowUp","ArrowDown","ArrowDown","ArrowLeft","ArrowRight","ArrowLeft","ArrowRight","b","a"];

describe("useKonami", () => {
  it("fires after the full sequence", () => {
    const onHit = vi.fn();
    render(<Probe onHit={onHit} />);
    for (const key of SEQ) fireEvent.keyDown(window, { key });
    expect(onHit).toHaveBeenCalledTimes(1);
  });

  it("does not fire on a wrong sequence", () => {
    const onHit = vi.fn();
    render(<Probe onHit={onHit} />);
    for (const key of ["ArrowUp", "ArrowUp", "a"]) fireEvent.keyDown(window, { key });
    expect(onHit).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**, then implement the hook:

```ts
// src/lib/useKonami.ts
import { useEffect, useRef } from "react";

const SEQUENCE = [
  "ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown",
  "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a",
];

export function useKonami(onTrigger: () => void) {
  const index = useRef(0);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (key === SEQUENCE[index.current]) {
        index.current += 1;
        if (index.current === SEQUENCE.length) {
          index.current = 0;
          onTrigger();
        }
      } else {
        index.current = key === SEQUENCE[0] ? 1 : 0;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onTrigger]);
}
```

Run: `pnpm test -- src/lib/__tests__/useKonami.test.tsx` → PASS.

- [ ] **Step 3: Write the failing SpideyMode test**

```tsx
// src/components/spidey/__tests__/SpideyMode.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { SpideyMode } from "@/components/spidey/SpideyMode";

describe("SpideyMode", () => {
  it("toggles the THWIP toast on the spidey:toggle event", () => {
    render(<SpideyMode />);
    expect(screen.queryByText(/THWIP/i)).not.toBeInTheDocument();
    act(() => {
      window.dispatchEvent(new CustomEvent("spidey:toggle"));
    });
    expect(screen.getByText(/THWIP/i)).toBeInTheDocument();
    act(() => {
      window.dispatchEvent(new CustomEvent("spidey:toggle"));
    });
    expect(screen.queryByText(/THWIP/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run, expect FAIL**, then implement:

```tsx
// src/components/spidey/SpideyMode.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useKonami } from "@/lib/useKonami";
import { WebCorner } from "@/components/ui/WebCorner";

export function SpideyMode() {
  const [on, setOn] = useState(false);
  const [toast, setToast] = useState(false);
  const toggle = useCallback(() => setOn((o) => !o), []);

  useKonami(toggle);

  useEffect(() => {
    function onEvt() { toggle(); }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOn(false); }
    window.addEventListener("spidey:toggle", onEvt);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("spidey:toggle", onEvt);
      window.removeEventListener("keydown", onKey);
    };
  }, [toggle]);

  useEffect(() => {
    if (!on) { setToast(false); return; }
    setToast(true);
    const t = setTimeout(() => setToast(false), 2500);
    return () => clearTimeout(t);
  }, [on]);

  return (
    <>
      <div aria-live="polite" className="sr-only">
        {on ? "Web-slinger mode on" : "Web-slinger mode off"}
      </div>
      {on && (
        <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-40">
          <WebCorner className="left-0 top-0" />
          <WebCorner className="right-0 top-0" />
          <WebCorner className="bottom-0 left-0" />
          <WebCorner className="bottom-0 right-0" />
        </div>
      )}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <span className="rounded-lg border border-edge bg-surface px-4 py-2 font-display font-bold text-spidey-strong">
            THWIP! 🕸️
          </span>
        </div>
      )}
    </>
  );
}
```

Run: `pnpm test -- src/components/spidey/__tests__/SpideyMode.test.tsx` → PASS.

- [ ] **Step 5: The subtle footer trigger**

```tsx
// src/components/spidey/SpideyTrigger.tsx
"use client";

export function SpideyTrigger() {
  return (
    <button
      type="button"
      aria-label="Toggle web-slinger mode"
      onClick={() => window.dispatchEvent(new CustomEvent("spidey:toggle"))}
      className="opacity-30 transition-opacity hover:opacity-100"
    >
      <span aria-hidden="true">🕷️</span>
    </button>
  );
}
```

- [ ] **Step 6: Mount.** In `src/app/layout.tsx`, render `<SpideyMode />` inside `<body>` (e.g. right after `<Footer />`): `import { SpideyMode } from "@/components/spidey/SpideyMode";`. In `src/components/layout/Footer.tsx`, import `SpideyTrigger` and place it somewhere unobtrusive (e.g. at the end of the footer's content row): `<SpideyTrigger />`.

- [ ] **Step 7: Run tests + build**

Run: `pnpm test` → all PASS.
Run: `pnpm run build` → exit 0.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: Spidey-mode easter egg (Konami + footer trigger)"
```

---

## Workstream E — Playwright e2e

### Task 10: Playwright setup + smoke specs + CI

**Files:** Modify `package.json`, `.gitignore`, `.github/workflows/deploy.yml`; Create `playwright.config.ts`, `e2e/smoke.spec.ts`, `e2e/contact.spec.ts`.

- [ ] **Step 1: Add the dev dependency (mature version, clears the 7-day cooldown)**

```bash
pnpm add -D @playwright/test@1.60.0
pnpm exec playwright install chromium
```

Expected: installs cleanly. pnpm may report a blocked build script for `@playwright/test`/`playwright` — that's fine (browsers are installed explicitly above; do not add it to `allowBuilds`).

- [ ] **Step 2: Playwright config**

```ts
// playwright.config.ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: { baseURL: "http://localhost:3000", trace: "on-first-retry" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm build && pnpm start",
    url: "http://localhost:3000",
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
  },
});
```

- [ ] **Step 3: Smoke spec**

```ts
// e2e/smoke.spec.ts
import { test, expect } from "@playwright/test";

test("home renders and links to the blog", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("link", { name: "Blog" }).first().click();
  await expect(page).toHaveURL(/\/blog$/);
});

test("the blog list opens a post", async ({ page }) => {
  await page.goto("/blog");
  await page.locator("article a").first().click();
  await expect(page).toHaveURL(/\/blog\/.+/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
```

- [ ] **Step 4: Contact spec (validation only — no real send)**

```ts
// e2e/contact.spec.ts
import { test, expect } from "@playwright/test";

test("empty submit shows field validation errors", async ({ page }) => {
  await page.goto("/contact");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Please enter your name.")).toBeVisible();
  await expect(page.getByText("Please enter your email address.")).toBeVisible();
  await expect(page.getByText("Please enter a message.")).toBeVisible();
});

test("the honeypot field is present and hidden", async ({ page }) => {
  await page.goto("/contact");
  const honeypot = page.locator('input[name="company"]');
  await expect(honeypot).toHaveCount(1);
  await expect(honeypot).toBeHidden();
});
```

- [ ] **Step 5: Scripts + ignores.** In `package.json` `scripts`, add `"e2e": "playwright test"`. Append to `.gitignore`:

```
# playwright
/playwright-report/
/test-results/
/playwright/.cache/
```

(No vitest change needed: its `include` is `src/**/*.test.{ts,tsx}`, so `e2e/*.spec.ts` is ignored by the unit runner.)

- [ ] **Step 6: Run e2e locally**

Run: `pnpm e2e`
Expected: PASS (4 tests, chromium). The webServer builds + starts the app; the run completes with no live email sent.

- [ ] **Step 7: Add the CI job.** In `.github/workflows/deploy.yml`, add an `e2e` job after `test`, and make `deploy` depend on both:

```yaml
  e2e:
    name: E2E (Playwright)
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm e2e

  deploy:
    name: Deploy to Fly.io
    needs: [test, e2e]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - run: flyctl deploy --remote-only
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
```

(Replace the existing `deploy:` job's `needs: test` with `needs: [test, e2e]`; leave the rest of `deploy` unchanged.)

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-lock.yaml playwright.config.ts e2e .gitignore .github/workflows/deploy.yml
git commit -m "test(e2e): add Playwright smoke + contact-validation specs and CI job"
```

---

### Task 11: Final verification

- [ ] **Step 1: Full unit suite** — Run: `pnpm test` → all green (≈ 74 prior + new tests).
- [ ] **Step 2: Production build** — Run: `pnpm run build` → exit 0; route list includes `/opengraph-image`, `/blog/[slug]/opengraph-image`, `/sitemap.xml`, `/robots.txt`.
- [ ] **Step 3: e2e** — Run: `pnpm e2e` → PASS.
- [ ] **Step 4:** Confirm no stray `text-web`/`text-spidey` on small text remain unaddressed: `grep -rn "text-web\b\|text-spidey\b" src/ --include=*.tsx` and eyeball each.

---

## Plan Self-Review

- **Spec coverage:** A (sitemap/robots T5, JSON-LD T6, OG T7, twitter meta T7) · B (skip-link T2, contrast T3, mobile nav T4) · C (Reveal + hover T8) · D (Konami + SpideyMode + trigger T9) · E (Playwright + CI T10) · F (mailto T1). All workstreams covered; final verification T11.
- **Placeholders:** none — every code step has concrete content. Contrast hexes are concrete with a verify-and-adjust instruction; OG font has a concrete fallback.
- **Type/name consistency:** `renderOgImage(title?)`, `ogSize`, `ogContentType` used identically across `og.tsx` and both image routes. `useKonami(onTrigger)` matches its test and `SpideyMode` usage. `--color-web-strong`/`--color-spidey-strong` defined in T3 and used in T3/T4/T8. `spidey:toggle` event name consistent across `SpideyMode`, `SpideyTrigger`, and the SpideyMode test. `getAllSlugs`/`getPostSlugs`/`getAllPosts` match the existing loader exports.
- **Independence:** Tasks are grouped by workstream and ordered so shared files (`layout.tsx`, `globals.css`) accrete additively; later tasks append rather than rewrite earlier additions.
