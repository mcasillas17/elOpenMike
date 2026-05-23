# elOpenMike — Plan 1: Foundation & Recruiter-First Core

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Next.js site with its design system and ship a deployable, recruiter-first home page (Hero + Experience + résumé download).

**Architecture:** Next.js 15 App Router (TypeScript, `src/` dir, `@/*` alias). Tailwind CSS v4 with CSS-first theming — design tokens live in a `@theme` block in `globals.css`. Fonts via `next/font` (Sora display, Inter body). Reusable UI primitives (`Button`, `Section`, `Container`, `WebCorner`) compose into layout (`Header`/`Footer`) and home sections (`Hero`, `Experience`). Experience content lives in a typed data file. Tests use Vitest + React Testing Library (jsdom).

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS v4, next/font, Vitest, @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-05-23-elopenmike-personal-site-design.md`

**Conventions for this plan:**
- Package manager: **npm**. Run all commands from the repo root `/Users/elopenmike/build/Apps/MikeSite/elOpenMike` unless stated otherwise.
- Commits use Conventional Commits and end with the Co-Authored-By trailer:
  ```
  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  ```
- Tailwind v4 has **no `tailwind.config.ts`** — tokens and custom utilities go in `src/app/globals.css`.

---

## File Structure (created/modified in this plan)

```
src/
  app/
    layout.tsx            # MODIFY: fonts, metadata, Header + Footer, body classes
    page.tsx              # MODIFY: home = Hero + Experience
    globals.css           # MODIFY: Tailwind import + @theme tokens + halftone/scroll utilities
    not-found.tsx         # CREATE: themed 404
    error.tsx             # CREATE: error boundary
    loading.tsx           # CREATE: loading state
  components/
    ui/
      Container.tsx       # CREATE: max-width wrapper
      Button.tsx          # CREATE: red primary / outline secondary; renders <a> or <button>
      WebCorner.tsx       # CREATE: decorative web-grid corner accent
      Section.tsx         # CREATE: <section id> + eyebrow + heading + children
    layout/
      Header.tsx          # CREATE: sticky nav, smooth-scroll anchors, active highlight
      Footer.tsx          # CREATE: socials + copyright
    sections/
      Hero.tsx            # CREATE: name, tagline, CTAs
      Experience.tsx      # CREATE: timeline rendered from data
  lib/
    site.ts               # CREATE: site config (name, tagline, nav, socials)
    fonts.ts              # CREATE: next/font Sora + Inter
    useActiveSection.ts   # CREATE: hook for nav active-section highlight
  data/
    experience.ts         # CREATE: Role type + experience entries
public/
  resume.pdf              # CREATE: placeholder (user replaces with real résumé)
  images/.gitkeep         # CREATE
vitest.config.mts         # CREATE
vitest.setup.ts           # CREATE
README.md                 # MODIFY: project + deploy notes
```

---

## Task 1: Scaffold the Next.js app

The repo is non-empty (`LICENSE`, `.gitignore`, `docs/`, `.superpowers/`). `create-next-app` allows `LICENSE`/`docs`/`.git`/`.gitignore` but not `.superpowers/`, so we move it aside, scaffold, then restore and re-protect it in `.gitignore`.

**Files:**
- Create: entire Next.js scaffold under repo root + `src/`
- Modify: `.gitignore`

- [ ] **Step 1: Move the brainstorm scratch dir aside**

```bash
mv /Users/elopenmike/build/Apps/MikeSite/elOpenMike/.superpowers /tmp/elopenmike-superpowers-bak
```

- [ ] **Step 2: Scaffold Next.js (non-interactive)**

Run from repo root:

```bash
npx create-next-app@latest . \
  --ts --eslint --tailwind --app --src-dir \
  --import-alias "@/*" --no-turbopack --use-npm
```

Expected: completes with "Success! Created ..." and installs dependencies. It creates `src/app/{layout.tsx,page.tsx,globals.css}`, `package.json`, `eslint.config.mjs`, `postcss.config.mjs`, `next.config.ts`, and overwrites `.gitignore` and `README.md`.

- [ ] **Step 3: Restore scratch dir and re-protect it**

```bash
mv /tmp/elopenmike-superpowers-bak /Users/elopenmike/build/Apps/MikeSite/elOpenMike/.superpowers
printf '\n# Brainstorming scratch (visual companion)\n.superpowers/\n' >> .gitignore
```

- [ ] **Step 4: Verify the production build succeeds**

```bash
npm run build
```

Expected: "Compiled successfully" and a route table listing `/`. No type or lint errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app (TS, Tailwind v4, App Router)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Set up Vitest + React Testing Library

**Files:**
- Create: `vitest.config.mts`, `vitest.setup.ts`, `src/lib/__tests__/sanity.test.ts`
- Modify: `package.json` (test script)

- [ ] **Step 1: Install test dependencies**

```bash
npm install -D vitest@^2 @vitejs/plugin-react jsdom \
  @testing-library/react @testing-library/dom @testing-library/jest-dom \
  @testing-library/user-event vite-tsconfig-paths
```

- [ ] **Step 2: Create the Vitest config**

Create `vitest.config.mts`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: false,
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
```

- [ ] **Step 3: Create the test setup file**

Create `vitest.setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});

// jsdom has no IntersectionObserver. Provide a no-op default so components
// that use it (e.g. via useActiveSection) render in tests without crashing.
// Tests that need to drive the callback override this with vi.stubGlobal.
vi.stubGlobal(
  "IntersectionObserver",
  class {
    observe() {}
    disconnect() {}
    unobserve() {}
    takeRecords() {
      return [];
    }
  },
);
```

- [ ] **Step 4: Add the test script**

In `package.json`, add to `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Write a sanity test**

Create `src/lib/__tests__/sanity.test.ts`:

```ts
import { describe, it, expect } from "vitest";

describe("test harness", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: Run the test (expect PASS)**

```bash
npm test
```

Expected: 1 passed. (If it fails, the harness is misconfigured — fix before moving on.)

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "test: configure Vitest + React Testing Library

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Design tokens, fonts, and global styles

Encode the locked palette + typography as Tailwind v4 tokens and apply the halftone background.

**Files:**
- Create: `src/lib/fonts.ts`
- Modify: `src/app/globals.css`, `src/app/layout.tsx`

- [ ] **Step 1: Create the fonts module**

Create `src/lib/fonts.ts`:

```ts
import { Sora, Inter } from "next/font/google";

export const sora = Sora({
  subsets: ["latin"],
  weight: ["600", "800"],
  variable: "--font-sora",
  display: "swap",
});

export const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-inter",
  display: "swap",
});
```

- [ ] **Step 2: Replace globals.css with tokens + utilities**

Overwrite `src/app/globals.css` (keep the `@import "tailwindcss";` line that create-next-app generated; replace the rest):

```css
@import "tailwindcss";

@theme {
  --color-canvas: #0b0e14;
  --color-surface: #171c28;
  --color-spidey: #e62429;
  --color-web: #1b6fe3;
  --color-ink: #e8eaed;
  --color-muted: #9aa3b2;

  --font-display: var(--font-sora), system-ui, sans-serif;
  --font-body: var(--font-inter), system-ui, sans-serif;
}

html {
  scroll-behavior: smooth;
}

@media (prefers-reduced-motion: reduce) {
  html {
    scroll-behavior: auto;
  }
}

body {
  background-color: var(--color-canvas);
  background-image: radial-gradient(var(--color-surface) 1px, transparent 1.5px);
  background-size: 11px 11px;
  color: var(--color-ink);
}

/* Offset for the sticky header when anchor-scrolling to a section. */
.scroll-anchor {
  scroll-margin-top: 5rem;
}
```

- [ ] **Step 3: Apply fonts and base classes in the root layout**

Overwrite `src/app/layout.tsx` (we fully wire metadata + chrome in Task 8; this step gets fonts/classes in place):

```tsx
import type { Metadata } from "next";
import { sora, inter } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Miguel Casillas",
  description: "Software Engineer, builder, and stand-up comedian.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sora.variable} ${inter.variable}`}>
      <body className="font-[family-name:var(--font-body)] antialiased">
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Verify the build still compiles**

```bash
npm run build
```

Expected: "Compiled successfully".

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add design tokens, fonts, and halftone background

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: UI primitives (Container, Button, WebCorner, Section)

**Files:**
- Create: `src/components/ui/Container.tsx`, `Button.tsx`, `WebCorner.tsx`, `Section.tsx`
- Test: `src/components/ui/__tests__/Button.test.tsx`, `Section.test.tsx`

- [ ] **Step 1: Write the failing Button test**

Create `src/components/ui/__tests__/Button.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "@/components/ui/Button";

describe("Button", () => {
  it("renders a <button> by default with its children", () => {
    render(<Button>Click me</Button>);
    const el = screen.getByRole("button", { name: "Click me" });
    expect(el.tagName).toBe("BUTTON");
  });

  it("renders an <a> when href is provided", () => {
    render(<Button href="/resume.pdf">Resume</Button>);
    const link = screen.getByRole("link", { name: "Resume" });
    expect(link).toHaveAttribute("href", "/resume.pdf");
  });

  it("applies a download attribute when download is set", () => {
    render(
      <Button href="/resume.pdf" download>
        Resume
      </Button>,
    );
    expect(screen.getByRole("link", { name: "Resume" })).toHaveAttribute(
      "download",
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/components/ui/__tests__/Button.test.tsx
```

Expected: FAIL — cannot resolve `@/components/ui/Button`.

- [ ] **Step 3: Implement Button**

Create `src/components/ui/Button.tsx`:

```tsx
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "secondary";

const base =
  "inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web";

const variants: Record<Variant, string> = {
  primary: "bg-spidey text-white hover:bg-[#c81d22]",
  secondary:
    "border border-[#2a3242] text-ink hover:border-web hover:text-web",
};

type ButtonProps = {
  children: ReactNode;
  variant?: Variant;
  href?: string;
  download?: boolean;
  className?: string;
} & Omit<ComponentProps<"button">, "className">;

export function Button({
  children,
  variant = "primary",
  href,
  download,
  className = "",
  ...rest
}: ButtonProps) {
  const classes = `${base} ${variants[variant]} ${className}`.trim();

  if (href) {
    // Plain <a> for hash links, downloads, and external URLs.
    return (
      <a href={href} download={download} className={classes}>
        {children}
      </a>
    );
  }

  return (
    <button className={classes} {...rest}>
      {children}
    </button>
  );
}

// Internal route button (kept for later plans; uses next/link).
export function LinkButton({
  href,
  children,
  variant = "primary",
  className = "",
}: {
  href: string;
  children: ReactNode;
  variant?: Variant;
  className?: string;
}) {
  return (
    <Link href={href} className={`${base} ${variants[variant]} ${className}`.trim()}>
      {children}
    </Link>
  );
}
```

- [ ] **Step 4: Run the Button test (expect PASS)**

```bash
npx vitest run src/components/ui/__tests__/Button.test.tsx
```

Expected: 3 passed.

- [ ] **Step 5: Create Container**

Create `src/components/ui/Container.tsx`:

```tsx
import type { ReactNode } from "react";

export function Container({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mx-auto w-full max-w-5xl px-6 ${className}`.trim()}>
      {children}
    </div>
  );
}
```

- [ ] **Step 6: Create WebCorner (decorative accent)**

Create `src/components/ui/WebCorner.tsx`:

```tsx
// Faint crossed red/blue web-grid in a corner. Decorative only.
export function WebCorner({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute h-40 w-40 opacity-[0.16] ${className}`.trim()}
      style={{
        backgroundImage:
          "repeating-linear-gradient(135deg, #e62429 0 1px, transparent 1px 16px), repeating-linear-gradient(45deg, #1b6fe3 0 1px, transparent 1px 16px)",
      }}
    />
  );
}
```

- [ ] **Step 7: Write the failing Section test**

Create `src/components/ui/__tests__/Section.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Section } from "@/components/ui/Section";

describe("Section", () => {
  it("renders with the given id and heading", () => {
    const { container } = render(
      <Section id="experience" eyebrow="Career" title="Experience">
        <p>content</p>
      </Section>,
    );
    expect(container.querySelector("#experience")).not.toBeNull();
    expect(
      screen.getByRole("heading", { name: "Experience" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Career")).toBeInTheDocument();
    expect(screen.getByText("content")).toBeInTheDocument();
  });
});
```

- [ ] **Step 8: Run the Section test to verify it fails**

```bash
npx vitest run src/components/ui/__tests__/Section.test.tsx
```

Expected: FAIL — cannot resolve `@/components/ui/Section`.

- [ ] **Step 9: Implement Section**

Create `src/components/ui/Section.tsx`:

```tsx
import type { ReactNode } from "react";
import { Container } from "@/components/ui/Container";

export function Section({
  id,
  eyebrow,
  title,
  children,
  className = "",
}: {
  id: string;
  eyebrow?: string;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={`scroll-anchor py-20 ${className}`.trim()}>
      <Container>
        {eyebrow && (
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-web">
            {eyebrow}
          </p>
        )}
        <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-extrabold sm:text-4xl">
          {title}
        </h2>
        <div className="mt-10">{children}</div>
      </Container>
    </section>
  );
}
```

- [ ] **Step 10: Run all tests (expect PASS)**

```bash
npm test
```

Expected: all passing (sanity + Button + Section).

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: add UI primitives (Container, Button, WebCorner, Section)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Site config, nav active-section hook, Header, Footer

Nav only links to sections that exist in this plan (Experience) plus the résumé and socials. Later plans add nav items.

**Files:**
- Create: `src/lib/site.ts`, `src/lib/useActiveSection.ts`, `src/components/layout/Header.tsx`, `src/components/layout/Footer.tsx`
- Test: `src/lib/__tests__/useActiveSection.test.tsx`, `src/components/layout/__tests__/Header.test.tsx`

- [ ] **Step 1: Create the site config**

Create `src/lib/site.ts`:

```ts
export type NavItem = { label: string; href: string };

export const site = {
  name: "Miguel Casillas",
  tagline: "Builder by day, open-mic by night.",
  intro:
    "I ship software, lift heavy, and occasionally make rooms laugh. Software Engineer focused on building things that work — and a few that web-sling.",
  resumeHref: "/resume.pdf",
  // Only sections that exist in Plan 1. Grow this as later plans land.
  nav: [{ label: "Experience", href: "#experience" }] as NavItem[],
  socials: [
    { label: "GitHub", href: "https://github.com/mcasillas17" },
    { label: "LinkedIn", href: "https://www.linkedin.com/" },
    { label: "Email", href: "mailto:micasillm@gmail.com" },
  ],
} as const;
```

- [ ] **Step 2: Write the failing useActiveSection test**

Create `src/lib/__tests__/useActiveSection.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { useActiveSection } from "@/lib/useActiveSection";

// Capture the IntersectionObserver callback so the test can drive it.
let ioCallback: (entries: Array<Partial<IntersectionObserverEntry>>) => void;

beforeEach(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: typeof ioCallback) {
        ioCallback = cb;
      }
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
});

function Probe() {
  const active = useActiveSection(["experience", "projects"]);
  return <span data-testid="active">{active}</span>;
}

describe("useActiveSection", () => {
  it("reports the id of the intersecting section", () => {
    // Provide elements for the hook to observe.
    document.body.innerHTML =
      '<div id="experience"></div><div id="projects"></div>';
    render(<Probe />);

    act(() => {
      ioCallback([
        {
          isIntersecting: true,
          target: document.getElementById("projects")!,
        },
      ]);
    });

    expect(screen.getByTestId("active")).toHaveTextContent("projects");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
npx vitest run src/lib/__tests__/useActiveSection.test.tsx
```

Expected: FAIL — cannot resolve `@/lib/useActiveSection`.

- [ ] **Step 4: Implement the hook**

Create `src/lib/useActiveSection.ts`:

```ts
"use client";

import { useEffect, useState } from "react";

/**
 * Returns the id of the section currently in view, for nav highlighting.
 * Pass the ids (without "#") of the sections to track.
 */
export function useActiveSection(ids: string[]): string {
  const [active, setActive] = useState<string>(ids[0] ?? "");

  useEffect(() => {
    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(entry.target.id);
          }
        }
      },
      { rootMargin: "-40% 0px -55% 0px", threshold: 0 },
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [ids]);

  return active;
}
```

- [ ] **Step 5: Run the hook test (expect PASS)**

```bash
npx vitest run src/lib/__tests__/useActiveSection.test.tsx
```

Expected: 1 passed.

- [ ] **Step 6: Write the failing Header test**

Create `src/components/layout/__tests__/Header.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Header } from "@/components/layout/Header";

describe("Header", () => {
  it("renders the name and a nav link to Experience", () => {
    render(<Header />);
    expect(screen.getByText("Miguel Casillas")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Experience" }),
    ).toHaveAttribute("href", "#experience");
  });

  it("renders a résumé link", () => {
    render(<Header />);
    expect(
      screen.getByRole("link", { name: /résumé/i }),
    ).toHaveAttribute("href", "/resume.pdf");
  });
});
```

- [ ] **Step 7: Run the Header test to verify it fails**

```bash
npx vitest run src/components/layout/__tests__/Header.test.tsx
```

Expected: FAIL — cannot resolve `@/components/layout/Header`.

- [ ] **Step 8: Implement Header**

Create `src/components/layout/Header.tsx`:

```tsx
"use client";

import { site } from "@/lib/site";
import { useActiveSection } from "@/lib/useActiveSection";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";

export function Header() {
  const ids = site.nav.map((item) => item.href.replace("#", ""));
  const active = useActiveSection(ids);

  return (
    <header className="sticky top-0 z-50 border-b border-[#171c28]/80 bg-canvas/80 backdrop-blur">
      <Container className="flex h-16 items-center justify-between">
        <a
          href="#top"
          className="font-[family-name:var(--font-display)] text-lg font-extrabold"
        >
          Miguel <span className="text-spidey">Casillas</span>
        </a>

        <nav className="flex items-center gap-6">
          <ul className="hidden items-center gap-6 sm:flex">
            {site.nav.map((item) => {
              const id = item.href.replace("#", "");
              const isActive = active === id;
              return (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className={`text-sm transition-colors ${
                      isActive ? "text-web" : "text-muted hover:text-ink"
                    }`}
                  >
                    {item.label}
                  </a>
                </li>
              );
            })}
          </ul>
          <Button href={site.resumeHref} download variant="secondary">
            Résumé
          </Button>
        </nav>
      </Container>
    </header>
  );
}
```

- [ ] **Step 9: Run the Header test (expect PASS)**

```bash
npx vitest run src/components/layout/__tests__/Header.test.tsx
```

Expected: 2 passed.

- [ ] **Step 10: Implement Footer**

Create `src/components/layout/Footer.tsx`:

```tsx
import { site } from "@/lib/site";
import { Container } from "@/components/ui/Container";

export function Footer() {
  return (
    <footer className="border-t border-[#171c28] py-10">
      <Container className="flex flex-col items-center justify-between gap-4 sm:flex-row">
        <p className="text-sm text-muted">
          © {new Date().getFullYear()} {site.name}
        </p>
        <ul className="flex gap-5">
          {site.socials.map((s) => (
            <li key={s.href}>
              <a
                href={s.href}
                className="text-sm text-muted transition-colors hover:text-web"
                target={s.href.startsWith("http") ? "_blank" : undefined}
                rel={s.href.startsWith("http") ? "noreferrer" : undefined}
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </Container>
    </footer>
  );
}
```

- [ ] **Step 11: Run all tests (expect PASS)**

```bash
npm test
```

Expected: all passing.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat: add site config, active-section hook, Header, Footer

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Hero section

**Files:**
- Create: `src/components/sections/Hero.tsx`
- Test: `src/components/sections/__tests__/Hero.test.tsx`

- [ ] **Step 1: Write the failing Hero test**

Create `src/components/sections/__tests__/Hero.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Hero } from "@/components/sections/Hero";

describe("Hero", () => {
  it("renders the name and tagline", () => {
    render(<Hero />);
    expect(screen.getByText(/Casillas/)).toBeInTheDocument();
    expect(
      screen.getByText("Builder by day, open-mic by night."),
    ).toBeInTheDocument();
  });

  it("renders View work and résumé CTAs", () => {
    render(<Hero />);
    expect(
      screen.getByRole("link", { name: /view my work/i }),
    ).toHaveAttribute("href", "#experience");
    expect(
      screen.getByRole("link", { name: /résumé/i }),
    ).toHaveAttribute("href", "/resume.pdf");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/components/sections/__tests__/Hero.test.tsx
```

Expected: FAIL — cannot resolve `@/components/sections/Hero`.

- [ ] **Step 3: Implement Hero**

Create `src/components/sections/Hero.tsx`:

```tsx
import { site } from "@/lib/site";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { WebCorner } from "@/components/ui/WebCorner";

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden pb-16 pt-28 sm:pt-36">
      <WebCorner className="right-0 top-0" />
      <Container>
        <p className="text-xs font-medium uppercase tracking-[0.3em] text-web">
          Software Engineer
        </p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-5xl font-extrabold leading-[1.02] sm:text-6xl">
          Miguel <span className="text-spidey">Casillas</span>
        </h1>
        <p className="mt-4 text-lg text-ink">{site.tagline}</p>
        <p className="mt-3 max-w-xl text-muted">{site.intro}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button href="#experience">View my work</Button>
          <Button href={site.resumeHref} download variant="secondary">
            Download résumé
          </Button>
        </div>
      </Container>
    </section>
  );
}
```

- [ ] **Step 4: Run the Hero test (expect PASS)**

```bash
npx vitest run src/components/sections/__tests__/Hero.test.tsx
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Hero section

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Experience data + section

**Files:**
- Create: `src/data/experience.ts`, `src/components/sections/Experience.tsx`
- Test: `src/data/__tests__/experience.test.ts`, `src/components/sections/__tests__/Experience.test.tsx`

- [ ] **Step 1: Write the failing data-shape test**

Create `src/data/__tests__/experience.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { experience } from "@/data/experience";

describe("experience data", () => {
  it("has at least one role with required fields", () => {
    expect(experience.length).toBeGreaterThan(0);
    for (const role of experience) {
      expect(role.company).toBeTruthy();
      expect(role.title).toBeTruthy();
      expect(role.start).toBeTruthy();
      expect(Array.isArray(role.highlights)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/data/__tests__/experience.test.ts
```

Expected: FAIL — cannot resolve `@/data/experience`.

- [ ] **Step 3: Implement the experience data (placeholder content)**

Create `src/data/experience.ts`. Content is placeholder — Miguel replaces the entries with real roles.

```ts
export type Role = {
  company: string;
  title: string;
  start: string; // e.g. "2023"
  end: string; // e.g. "Present"
  location?: string;
  highlights: string[];
  stack?: string[];
};

export const experience: Role[] = [
  {
    company: "Company Name",
    title: "Software Engineer",
    start: "2023",
    end: "Present",
    location: "Remote",
    highlights: [
      "Replace with a measurable accomplishment (what you built, the impact).",
      "Add 2–4 bullets per role. Lead with verbs and numbers.",
    ],
    stack: ["TypeScript", "React", "Node.js"],
  },
  {
    company: "Earlier Company",
    title: "Software Engineer",
    start: "2021",
    end: "2023",
    location: "City, ST",
    highlights: [
      "Another accomplishment with concrete outcome.",
      "Keep these scannable for recruiters.",
    ],
    stack: ["Python", "PostgreSQL"],
  },
];
```

- [ ] **Step 4: Run the data test (expect PASS)**

```bash
npx vitest run src/data/__tests__/experience.test.ts
```

Expected: 1 passed.

- [ ] **Step 5: Write the failing Experience component test**

Create `src/components/sections/__tests__/Experience.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Experience } from "@/components/sections/Experience";
import { experience } from "@/data/experience";

describe("Experience", () => {
  it("renders the section heading", () => {
    render(<Experience />);
    expect(
      screen.getByRole("heading", { name: "Experience" }),
    ).toBeInTheDocument();
  });

  it("renders each role's company and title", () => {
    render(<Experience />);
    for (const role of experience) {
      expect(screen.getByText(role.company)).toBeInTheDocument();
      expect(screen.getAllByText(role.title).length).toBeGreaterThan(0);
    }
  });

  it("includes a résumé download link", () => {
    render(<Experience />);
    expect(
      screen.getByRole("link", { name: /résumé/i }),
    ).toHaveAttribute("href", "/resume.pdf");
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

```bash
npx vitest run src/components/sections/__tests__/Experience.test.tsx
```

Expected: FAIL — cannot resolve `@/components/sections/Experience`.

- [ ] **Step 7: Implement the Experience section**

Create `src/components/sections/Experience.tsx`:

```tsx
import { experience } from "@/data/experience";
import { site } from "@/lib/site";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";

export function Experience() {
  return (
    <Section id="experience" eyebrow="Career" title="Experience">
      <ol className="relative border-l border-[#2a3242] pl-6">
        {experience.map((role) => (
          <li key={`${role.company}-${role.start}`} className="mb-10 last:mb-0">
            <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-spidey" />
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-[family-name:var(--font-display)] text-xl font-bold">
                {role.title}
                <span className="text-muted"> · {role.company}</span>
              </h3>
              <span className="text-sm text-muted">
                {role.start} – {role.end}
                {role.location ? ` · ${role.location}` : ""}
              </span>
            </div>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-muted">
              {role.highlights.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ul>
            {role.stack && role.stack.length > 0 && (
              <p className="mt-3 text-sm text-web">{role.stack.join(" · ")}</p>
            )}
          </li>
        ))}
      </ol>

      <div className="mt-10">
        <Button href={site.resumeHref} download>
          Download résumé
        </Button>
      </div>
    </Section>
  );
}
```

- [ ] **Step 8: Run all tests (expect PASS)**

```bash
npm test
```

Expected: all passing.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add Experience data model and timeline section

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Compose the home page + chrome + error/loading/404

**Files:**
- Modify: `src/app/layout.tsx`, `src/app/page.tsx`
- Create: `src/app/not-found.tsx`, `src/app/error.tsx`, `src/app/loading.tsx`
- Test: `src/app/__tests__/page.test.tsx`

- [ ] **Step 1: Wire Header + Footer into the layout**

Overwrite `src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { sora, inter } from "@/lib/fonts";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://elopenmike.dev"),
  title: {
    default: "Miguel Casillas — Software Engineer",
    template: "%s — Miguel Casillas",
  },
  description:
    "Software Engineer, builder, and stand-up comedian. Experience, projects, and the occasional joke.",
  openGraph: {
    title: "Miguel Casillas — Software Engineer",
    description:
      "Software Engineer, builder, and stand-up comedian.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sora.variable} ${inter.variable}`}>
      <body className="font-[family-name:var(--font-body)] antialiased">
        <Header />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
```

> Note: `metadataBase` uses a placeholder domain `https://elopenmike.dev`. Update it to the real deploy URL in Plan 6 (or now if the domain is known).

- [ ] **Step 2: Write the failing home page test**

Create `src/app/__tests__/page.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Home from "@/app/page";

describe("Home page", () => {
  it("renders the hero name and the experience heading", () => {
    render(<Home />);
    expect(screen.getByText(/Casillas/)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Experience" }),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
npx vitest run src/app/__tests__/page.test.tsx
```

Expected: FAIL — current `page.tsx` is the create-next-app default; no "Experience" heading.

- [ ] **Step 4: Implement the home page**

Overwrite `src/app/page.tsx`:

```tsx
import { Hero } from "@/components/sections/Hero";
import { Experience } from "@/components/sections/Experience";

export default function Home() {
  return (
    <>
      <Hero />
      <Experience />
    </>
  );
}
```

- [ ] **Step 5: Run the home page test (expect PASS)**

```bash
npx vitest run src/app/__tests__/page.test.tsx
```

Expected: 1 passed.

- [ ] **Step 6: Add the themed 404 page**

Create `src/app/not-found.tsx`:

```tsx
import { Container } from "@/components/ui/Container";
import { LinkButton } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <Container className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <p className="font-[family-name:var(--font-display)] text-7xl font-extrabold text-spidey">
        404
      </p>
      <h1 className="mt-4 font-[family-name:var(--font-display)] text-2xl font-bold">
        This page got webbed up.
      </h1>
      <p className="mt-2 text-muted">
        The thing you’re looking for swung off somewhere else.
      </p>
      <div className="mt-8">
        <LinkButton href="/">Back home</LinkButton>
      </div>
    </Container>
  );
}
```

- [ ] **Step 7: Add the error boundary**

Create `src/app/error.tsx`:

```tsx
"use client";

import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <Container className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold">
        Something snapped.
      </h1>
      <p className="mt-2 text-muted">An unexpected error occurred.</p>
      <div className="mt-8">
        <Button onClick={() => reset()}>Try again</Button>
      </div>
    </Container>
  );
}
```

- [ ] **Step 8: Add the loading state**

Create `src/app/loading.tsx`:

```tsx
import { Container } from "@/components/ui/Container";

export default function Loading() {
  return (
    <Container className="flex min-h-[60vh] items-center justify-center">
      <p className="text-muted">Loading…</p>
    </Container>
  );
}
```

- [ ] **Step 9: Run the full test suite + build**

```bash
npm test && npm run build
```

Expected: all tests pass; build compiles with `/` and the `_not-found` route listed.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: compose recruiter-first home page with chrome and error states

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Placeholder résumé, images dir, README & deploy notes

**Files:**
- Create: `public/resume.pdf`, `public/images/.gitkeep`
- Modify: `README.md`

- [ ] **Step 1: Add a placeholder résumé and images dir**

```bash
mkdir -p public/images
touch public/images/.gitkeep
printf '%%PDF-1.4\n%%Placeholder résumé — replace public/resume.pdf with the real file.\n' > public/resume.pdf
```

> The placeholder makes the download link resolve. Miguel replaces `public/resume.pdf` with his real résumé before sharing the site.

- [ ] **Step 2: Write the README**

Overwrite `README.md`:

```markdown
# elOpenMike

Personal website for Miguel Casillas — Software Engineer, builder, and stand-up comedian.

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind CSS v4 · next/font (Sora + Inter) · Vitest + React Testing Library.

## Develop

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # run unit/component tests
npm run build    # production build
```

## Content to personalize

- `src/data/experience.ts` — your roles and accomplishments.
- `public/resume.pdf` — your real résumé (replace the placeholder).
- `src/lib/site.ts` — name, tagline, social links.

## Deploy (Vercel)

1. Push to `main` on `github.com/mcasillas17/elOpenMike`.
2. Import the repo at vercel.com → New Project (framework auto-detected as Next.js).
3. Deploy. Add a custom domain later under Project → Settings → Domains.

## Design

See `docs/superpowers/specs/2026-05-23-elopenmike-personal-site-design.md`.
```

- [ ] **Step 3: Final verification**

```bash
npm test && npm run build
```

Expected: all tests pass; build succeeds.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: add placeholder résumé, images dir, README and deploy notes

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Done criteria for Plan 1

- `npm run build` succeeds; `npm test` is green.
- `npm run dev` shows a dark, halftone-textured home page: sticky header, Hero (name + tagline + two CTAs), Experience timeline, footer with socials.
- "Download résumé" links resolve; nav highlights the Experience section on scroll.
- Site is ready to import into Vercel.

## Manual verification (run after implementation)

```bash
npm run dev
```

Then in a browser at `http://localhost:3000`, confirm:
- [ ] Dark canvas with subtle halftone dots; Sora headings, Inter body.
- [ ] Sticky header stays on scroll; "Experience" link smooth-scrolls and highlights.
- [ ] Both résumé buttons download `resume.pdf`.
- [ ] Visiting `/does-not-exist` shows the themed 404.
- [ ] Layout looks right at mobile width (~375px) and desktop.
