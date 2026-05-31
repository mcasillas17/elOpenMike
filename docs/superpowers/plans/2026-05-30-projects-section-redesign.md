# Projects Section Redesign — Comic Panels — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the four Projects surfaces (Home section, `/projects` index, `ProjectCard`, `/projects/[slug]` detail) around a comic-issue panel motif with deterministic tints and POW marks.

**Architecture:** Five small server components in `src/components/ui/comic/` carry the visual vocabulary (panel, halftone, issue sticker, POW mark, comic button). One pure helper in `src/lib/projectVisuals.ts` derives the deterministic per-project tint and mark from index + slug hash. The four surfaces consume both.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind v4 (CSS-first `@theme`), Vitest + Testing Library + jsdom, pnpm.

**Spec:** `docs/superpowers/specs/2026-05-30-projects-section-redesign-design.md`

---

## File Map

**New files**
- `src/lib/projectVisuals.ts` — `hashSlug`, `getTint`, `getMark`, `MARKS`, types
- `src/lib/__tests__/projectVisuals.test.ts`
- `src/components/ui/comic/Halftone.tsx`
- `src/components/ui/comic/PowMark.tsx`
- `src/components/ui/comic/IssueTag.tsx`
- `src/components/ui/comic/ComicPanel.tsx`
- `src/components/ui/comic/ComicButton.tsx` — exports `ComicButton` (external `<a>`) and `ComicLinkButton` (`next/link`)
- `src/components/ui/comic/__tests__/Halftone.test.tsx`
- `src/components/ui/comic/__tests__/PowMark.test.tsx`
- `src/components/ui/comic/__tests__/IssueTag.test.tsx`
- `src/components/ui/comic/__tests__/ComicPanel.test.tsx`
- `src/components/ui/comic/__tests__/ComicButton.test.tsx`

**Modified files**
- `src/app/globals.css` — add `--color-panel-border` and `--color-panel-shadow` to `@theme`
- `src/components/projects/ProjectCard.tsx` — full rewrite with `variant` prop
- `src/components/projects/__tests__/ProjectCard.test.tsx` — full rewrite
- `src/components/sections/Projects.tsx` — new hybrid 6-column grid, "View All Issues" CTA
- `src/components/sections/__tests__/Projects.test.tsx` — update heading + count assertions
- `src/app/projects/page.tsx` — "The Casefile" h1, featured row + uniform grid
- `src/app/projects/__tests__/page.test.tsx` — update heading assertion (visible h1) and keep card linkage assertion
- `src/app/projects/[slug]/page.tsx` — cover panel hero, comic-styled buttons, splash panel for media, numbered highlight panels
- `src/app/projects/[slug]/__tests__/page.test.tsx` — back-link text update

**Untouched (called out explicitly so the engineer doesn't drift)**
- `src/data/projects.ts` — data shape and content unchanged
- `src/components/ui/Section.tsx`, `Container.tsx`, `Carousel.tsx`, `Tag.tsx`, `Button.tsx`, `WebCorner.tsx`, `Reveal.tsx`
- `SpideyMode`, `SpideyTrigger`, Konami easter egg
- Routing, sitemap, `robots.ts`, `manifest.ts`
- Metadata `title`/`description` for `/projects` (h1 changes to "The Casefile" but metadata title stays "Projects" per spec §1 out-of-scope)

---

## Conventions

- **pnpm.** `pnpm test` runs vitest once. For a single file: `pnpm test -- src/path/to/file.test.ts`. For watch mode use `pnpm test:watch`.
- **Vitest with explicit imports** — `import { describe, it, expect } from "vitest";`. Globals are off (see `vitest.config.mts`).
- **Commit style** — Conventional Commits, optional scope. Match the recent history (`feat(projects): …`, `style(theme): …`). Trailer:
  ```
  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  ```
- **Tailwind v4** — design tokens declared in `@theme` are auto-exposed as utilities. `--color-panel-border` → `border-panel-border`, `bg-panel-border`. The hard-shadow + transform-rotate need arbitrary values or inline `style`; prefer inline `style` for clarity on these one-off comic styles.
- **`accentedTitle` pattern** — preserve the "last word in a Spidey accent color" pattern from the existing detail page when rendering project titles in the new cover panel.
- **Server components by default** — none of the new components need client state; do not add `"use client"`.

---

## Task 1: Add panel tokens to the theme

**Files:**
- Modify: `src/app/globals.css` (the `@theme` block)

- [ ] **Step 1: Add tokens**

In `src/app/globals.css`, inside the existing `@theme { ... }` block (between `--color-spidey-strong: #ff5a5a;` and `--font-display: …`), insert:

```css
  --color-panel-border: #000;
  --color-panel-shadow: #000;
```

(Both intentionally black — the comic look depends on hard black borders regardless of dark mode.)

- [ ] **Step 2: Verify build still passes**

Run: `pnpm run build`
Expected: succeeds. The added tokens are unused at this point; just confirm no syntax error.

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "$(cat <<'EOF'
style(theme): add panel-border and panel-shadow tokens

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `projectVisuals` helper (pure functions, TDD)

**Files:**
- Create: `src/lib/projectVisuals.ts`
- Test: `src/lib/__tests__/projectVisuals.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/__tests__/projectVisuals.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  hashSlug,
  getTint,
  getMark,
  MARKS,
  type Tint,
} from "@/lib/projectVisuals";
import type { Project } from "@/data/projects";

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    slug: "demo",
    title: "Demo",
    summary: "demo summary",
    year: "2026",
    tags: [],
    stack: [],
    highlights: [],
    images: [],
    ...overrides,
  };
}

describe("hashSlug", () => {
  it("is deterministic for the same input", () => {
    expect(hashSlug("turingagent")).toBe(hashSlug("turingagent"));
  });

  it("differs for different inputs (collision-resistant in our small set)", () => {
    const a = hashSlug("turingagent");
    const b = hashSlug("turingcare");
    const c = hashSlug("light-master");
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it("returns a non-negative integer", () => {
    expect(hashSlug("zzz")).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(hashSlug("zzz"))).toBe(true);
  });
});

describe("getTint", () => {
  it("always returns 'cover' for the first project (index 0)", () => {
    const p = makeProject({ tags: ["Game"] });
    expect(getTint(p, 0)).toBe<Tint>("cover");
  });

  it("maps AI/Full-stack tags to blue", () => {
    expect(getTint(makeProject({ tags: ["AI"] }), 1)).toBe("blue");
    expect(getTint(makeProject({ tags: ["Full-stack"] }), 2)).toBe("blue");
  });

  it("maps Web app to red", () => {
    expect(getTint(makeProject({ tags: ["Web app"] }), 1)).toBe("red");
  });

  it("maps Game/Unity to green", () => {
    expect(getTint(makeProject({ tags: ["Game"] }), 1)).toBe("green");
    expect(getTint(makeProject({ tags: ["Unity"] }), 1)).toBe("green");
  });

  it("maps Open source (only) to purple", () => {
    expect(getTint(makeProject({ tags: ["Open source"] }), 1)).toBe("purple");
  });

  it("prefers AI over Open source when both present", () => {
    expect(
      getTint(makeProject({ tags: ["AI", "Open source"] }), 1),
    ).toBe("blue");
  });

  it("falls back to a deterministic non-cover tint when no tags match", () => {
    const p = makeProject({ slug: "fallback-slug", tags: ["Other"] });
    const t = getTint(p, 1);
    expect(["blue", "red", "green", "purple"]).toContain(t);
    // Determinism: calling again returns the same tint.
    expect(getTint(p, 1)).toBe(t);
  });
});

describe("getMark", () => {
  it("always returns a mark for the first project (index 0)", () => {
    expect(getMark(makeProject(), 0)).not.toBeNull();
  });

  it("is deterministic — same slug yields same result on repeated calls", () => {
    const p = makeProject({ slug: "stable-slug" });
    expect(getMark(p, 5)).toBe(getMark(p, 5));
  });

  it("returns null when hash falls outside the threshold (non-featured only)", () => {
    // hashSlug % 100 < 35 is the gate. Walk a few slugs and assert that at
    // least one returns null (the threshold gate is honored for non-index-0
    // projects).
    const slugs = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const nonFeatured = slugs.map((s) => getMark(makeProject({ slug: s }), 1));
    expect(nonFeatured.some((m) => m === null)).toBe(true);
  });

  it("returns a value from the MARKS pool when not null", () => {
    const m = getMark(makeProject({ slug: "z" }), 0);
    expect(MARKS).toContain(m as (typeof MARKS)[number]);
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `pnpm test -- src/lib/__tests__/projectVisuals.test.ts`
Expected: FAIL — module `@/lib/projectVisuals` cannot be resolved.

- [ ] **Step 3: Implement `projectVisuals.ts`**

Create `src/lib/projectVisuals.ts`:

```ts
import type { Project } from "@/data/projects";

export const MARKS = [
  "THWIP!",
  "BAMF!",
  "ZAP!",
  "BOOM!",
  "KAPOW!",
  "SNIKT!",
] as const;

export type Tint = "cover" | "blue" | "red" | "green" | "purple";

const FALLBACK_TINTS: ReadonlyArray<Exclude<Tint, "cover">> = [
  "blue",
  "red",
  "green",
  "purple",
];

// Small stable string hash (DJB2). Same input → same output. Not crypto.
export function hashSlug(slug: string): number {
  let h = 5381;
  for (let i = 0; i < slug.length; i++) {
    h = ((h << 5) + h + slug.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function getTint(project: Project, index: number): Tint {
  if (index === 0) return "cover";
  const tags = new Set(project.tags);
  if (tags.has("AI") || tags.has("Full-stack")) return "blue";
  if (tags.has("Web app")) return "red";
  if (tags.has("Game") || tags.has("Unity")) return "green";
  if (tags.has("Open source")) return "purple";
  return FALLBACK_TINTS[hashSlug(project.slug) % FALLBACK_TINTS.length];
}

export function getMark(project: Project, index: number): string | null {
  const idx = hashSlug(project.slug) % MARKS.length;
  if (index === 0) return MARKS[idx];
  if (hashSlug(project.slug) % 100 >= 35) return null;
  return MARKS[idx];
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `pnpm test -- src/lib/__tests__/projectVisuals.test.ts`
Expected: PASS — all assertions green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/projectVisuals.ts src/lib/__tests__/projectVisuals.test.ts
git commit -m "$(cat <<'EOF'
feat(projects): projectVisuals helper — deterministic tint + POW mark

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Comic primitives — `Halftone` and `PowMark`

**Files:**
- Create: `src/components/ui/comic/Halftone.tsx`
- Create: `src/components/ui/comic/PowMark.tsx`
- Test: `src/components/ui/comic/__tests__/Halftone.test.tsx`
- Test: `src/components/ui/comic/__tests__/PowMark.test.tsx`

- [ ] **Step 1: Write failing tests for Halftone**

Create `src/components/ui/comic/__tests__/Halftone.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Halftone } from "@/components/ui/comic/Halftone";

describe("Halftone", () => {
  it("renders an aria-hidden, pointer-events-none overlay", () => {
    const { container } = render(<Halftone />);
    const el = container.firstChild as HTMLElement;
    expect(el).toBeTruthy();
    expect(el.getAttribute("aria-hidden")).toBe("true");
    expect(el.className).toMatch(/pointer-events-none/);
    expect(el.className).toMatch(/absolute/);
  });

  it("respects an opacity multiplier", () => {
    const { container } = render(<Halftone opacity={0.5} />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.opacity).toBe("0.5");
  });
});
```

- [ ] **Step 2: Write failing tests for PowMark**

Create `src/components/ui/comic/__tests__/PowMark.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PowMark } from "@/components/ui/comic/PowMark";

describe("PowMark", () => {
  it("renders the word", () => {
    render(<PowMark word="THWIP!" />);
    expect(screen.getByText("THWIP!")).toBeInTheDocument();
  });

  it("is aria-hidden", () => {
    render(<PowMark word="ZAP!" />);
    expect(screen.getByText("ZAP!").getAttribute("aria-hidden")).toBe("true");
  });

  it("applies the requested rotation via inline style", () => {
    render(<PowMark word="BAMF!" rotate={-6} />);
    const el = screen.getByText("BAMF!");
    expect(el.style.transform).toContain("rotate(-6deg)");
  });
});
```

- [ ] **Step 3: Run the tests to confirm they fail**

Run: `pnpm test -- src/components/ui/comic/__tests__/`
Expected: FAIL — modules cannot be resolved.

- [ ] **Step 4: Implement `Halftone.tsx`**

Create `src/components/ui/comic/Halftone.tsx`:

```tsx
type Props = { opacity?: number };

// Decorative dot-pattern overlay used inside ComicPanel. aria-hidden because
// it carries no information.
export function Halftone({ opacity = 1 }: Props) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      style={{
        backgroundImage:
          "radial-gradient(rgba(255,255,255,0.07) 1px, transparent 1.5px)",
        backgroundSize: "6px 6px",
        opacity,
      }}
    />
  );
}
```

- [ ] **Step 5: Implement `PowMark.tsx`**

Create `src/components/ui/comic/PowMark.tsx`:

```tsx
type Color = "spidey" | "web";

type Props = {
  word: string;
  color?: Color;
  rotate?: number; // degrees
};

const COLOR: Record<Color, string> = {
  spidey: "text-spidey-strong",
  web: "text-web-strong",
};

// Top-right rotated "THWIP!"-style tag. Decorative — aria-hidden.
export function PowMark({ word, color = "spidey", rotate = 8 }: Props) {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute right-3.5 top-3 font-display text-xs font-black tracking-widest ${COLOR[color]}`}
      style={{
        transform: `rotate(${rotate}deg)`,
        textShadow: "1px 1px 0 #000",
      }}
    >
      {word}
    </span>
  );
}
```

- [ ] **Step 6: Run the tests to confirm they pass**

Run: `pnpm test -- src/components/ui/comic/__tests__/Halftone.test.tsx src/components/ui/comic/__tests__/PowMark.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/comic/Halftone.tsx src/components/ui/comic/PowMark.tsx src/components/ui/comic/__tests__/Halftone.test.tsx src/components/ui/comic/__tests__/PowMark.test.tsx
git commit -m "$(cat <<'EOF'
feat(projects): comic primitives — Halftone + PowMark

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Comic primitive — `IssueTag`

**Files:**
- Create: `src/components/ui/comic/IssueTag.tsx`
- Test: `src/components/ui/comic/__tests__/IssueTag.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `src/components/ui/comic/__tests__/IssueTag.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { IssueTag } from "@/components/ui/comic/IssueTag";

describe("IssueTag", () => {
  it("renders the issue number with a № prefix", () => {
    render(<IssueTag number="04" />);
    expect(screen.getByText(/№04/)).toBeInTheDocument();
  });

  it("appends a label when provided", () => {
    render(<IssueTag number="01" label="NEW" />);
    expect(screen.getByText(/№01 · NEW/)).toBeInTheDocument();
  });

  it("uses the requested background variant class", () => {
    const { container } = render(
      <IssueTag number="02" variant="blue" />,
    );
    const el = container.firstChild as HTMLElement;
    expect(el.className).toMatch(/bg-web/);
  });

  it("applies the requested rotation", () => {
    const { container } = render(
      <IssueTag number="03" rotate={2} />,
    );
    const el = container.firstChild as HTMLElement;
    expect(el.style.transform).toContain("rotate(2deg)");
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `pnpm test -- src/components/ui/comic/__tests__/IssueTag.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `IssueTag.tsx`**

Create `src/components/ui/comic/IssueTag.tsx`:

```tsx
type Variant = "red" | "blue" | "dark";

type Props = {
  number: string;
  label?: string;
  variant?: Variant;
  rotate?: number; // degrees
};

const VARIANT_BG: Record<Variant, string> = {
  red: "bg-spidey",
  blue: "bg-web",
  dark: "bg-[#111]",
};

// Rotated "№XX" sticker pinned to the top-left of a ComicPanel.
export function IssueTag({
  number,
  label,
  variant = "red",
  rotate = -3,
}: Props) {
  return (
    <span
      className={`absolute -top-2 left-3 z-20 inline-block border-2 border-panel-border px-2.5 py-1 font-display text-[11px] font-black tracking-widest text-white ${VARIANT_BG[variant]}`}
      style={{
        transform: `rotate(${rotate}deg)`,
        boxShadow: "2px 2px 0 var(--color-panel-shadow)",
      }}
    >
      №{number}
      {label ? ` · ${label}` : ""}
    </span>
  );
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `pnpm test -- src/components/ui/comic/__tests__/IssueTag.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/comic/IssueTag.tsx src/components/ui/comic/__tests__/IssueTag.test.tsx
git commit -m "$(cat <<'EOF'
feat(projects): comic IssueTag primitive

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Comic primitive — `ComicPanel`

**Files:**
- Create: `src/components/ui/comic/ComicPanel.tsx`
- Test: `src/components/ui/comic/__tests__/ComicPanel.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `src/components/ui/comic/__tests__/ComicPanel.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ComicPanel } from "@/components/ui/comic/ComicPanel";

describe("ComicPanel", () => {
  it("renders children", () => {
    render(
      <ComicPanel tint="blue">
        <span>hello</span>
      </ComicPanel>,
    );
    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  it("renders a halftone overlay", () => {
    const { container } = render(
      <ComicPanel tint="blue">
        <span>hello</span>
      </ComicPanel>,
    );
    // Halftone is a child div with aria-hidden="true" and absolute inset-0.
    const halftone = container.querySelector(
      '[aria-hidden="true"].pointer-events-none.absolute',
    );
    expect(halftone).toBeTruthy();
  });

  it("renders as an <article>", () => {
    const { container } = render(
      <ComicPanel tint="cover">
        <span>x</span>
      </ComicPanel>,
    );
    expect(container.firstChild?.nodeName).toBe("ARTICLE");
  });

  it("merges extra className without dropping base classes", () => {
    const { container } = render(
      <ComicPanel tint="blue" className="h-32">
        <span>x</span>
      </ComicPanel>,
    );
    const el = container.firstChild as HTMLElement;
    expect(el.className).toMatch(/h-32/);
    expect(el.className).toMatch(/border-/); // base panel border still present
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `pnpm test -- src/components/ui/comic/__tests__/ComicPanel.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `ComicPanel.tsx`**

Create `src/components/ui/comic/ComicPanel.tsx`:

```tsx
import type { CSSProperties, ReactNode } from "react";
import { Halftone } from "./Halftone";
import type { Tint } from "@/lib/projectVisuals";

type Props = {
  tint?: Tint;
  className?: string;
  children: ReactNode;
};

const TINT_STYLE: Record<Tint, CSSProperties> = {
  cover: {
    backgroundImage:
      "radial-gradient(circle at 25% 30%, rgba(27,111,227,0.5), transparent 55%), radial-gradient(circle at 75% 75%, rgba(230,36,41,0.45), transparent 55%)",
    backgroundColor: "#0e1320",
  },
  blue: { backgroundImage: "linear-gradient(135deg, #0e1320, #14274a)" },
  red: { backgroundImage: "linear-gradient(120deg, #1a0e14, #2a1418)" },
  green: { backgroundImage: "linear-gradient(120deg, #0e1a14, #163a26)" },
  purple: { backgroundImage: "linear-gradient(120deg, #1a1024, #2a1a3a)" },
};

const base =
  "relative overflow-hidden border-[3px] border-panel-border bg-surface focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-spidey";

// Comic-issue panel: thick black border, hard drop-shadow, halftone overlay,
// colored tint. Consumers put IssueTag / PowMark / content inside.
export function ComicPanel({ tint = "blue", className = "", children }: Props) {
  return (
    <article
      className={`${base} ${className}`.trim()}
      style={{
        ...TINT_STYLE[tint],
        boxShadow: "4px 4px 0 var(--color-panel-shadow)",
      }}
    >
      <Halftone />
      {children}
    </article>
  );
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `pnpm test -- src/components/ui/comic/__tests__/ComicPanel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/comic/ComicPanel.tsx src/components/ui/comic/__tests__/ComicPanel.test.tsx
git commit -m "$(cat <<'EOF'
feat(projects): ComicPanel wrapper with deterministic tint styles

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Comic primitive — `ComicButton` / `ComicLinkButton`

**Files:**
- Create: `src/components/ui/comic/ComicButton.tsx`
- Test: `src/components/ui/comic/__tests__/ComicButton.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `src/components/ui/comic/__tests__/ComicButton.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  ComicButton,
  ComicLinkButton,
} from "@/components/ui/comic/ComicButton";

describe("ComicButton", () => {
  it("renders an external <a> with the provided href and children", () => {
    render(
      <ComicButton href="https://example.com">Live demo</ComicButton>,
    );
    const link = screen.getByRole("link", { name: "Live demo" });
    expect(link).toHaveAttribute("href", "https://example.com");
  });

  it("sets rel='noopener noreferrer' when target='_blank' and rel is absent", () => {
    render(
      <ComicButton href="https://example.com" target="_blank">
        Source
      </ComicButton>,
    );
    expect(screen.getByRole("link", { name: "Source" })).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );
  });

  it("applies the ghost variant class when requested", () => {
    render(
      <ComicButton href="https://example.com" variant="ghost">
        Source
      </ComicButton>,
    );
    expect(screen.getByRole("link", { name: "Source" }).className).toMatch(
      /bg-surface/,
    );
  });
});

describe("ComicLinkButton", () => {
  it("renders an internal link with the provided href", () => {
    render(
      <ComicLinkButton href="/projects">
        View All Issues
      </ComicLinkButton>,
    );
    expect(
      screen.getByRole("link", { name: "View All Issues" }),
    ).toHaveAttribute("href", "/projects");
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `pnpm test -- src/components/ui/comic/__tests__/ComicButton.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `ComicButton.tsx`**

Create `src/components/ui/comic/ComicButton.tsx`:

```tsx
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "ghost";

const VARIANT: Record<Variant, string> = {
  primary: "bg-spidey text-white",
  ghost: "bg-surface text-ink",
};

const base =
  "inline-flex items-center justify-center border-2 border-panel-border px-3.5 py-2 font-display text-xs font-black uppercase tracking-widest focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web";

const shadowStyle = {
  boxShadow: "3px 3px 0 var(--color-panel-shadow)",
} as const;

// External-URL flavor: renders <a>. Mirrors Button.tsx's target/rel safety.
export function ComicButton(
  props: { href: string; variant?: Variant } & Omit<
    ComponentProps<"a">,
    "href"
  >,
) {
  const {
    href,
    variant = "primary",
    className = "",
    children,
    target,
    rel,
    ...rest
  } = props;
  const safeRel = target === "_blank" ? rel ?? "noopener noreferrer" : rel;
  return (
    <a
      href={href}
      target={target}
      rel={safeRel}
      className={`${base} ${VARIANT[variant]} ${className}`.trim()}
      style={shadowStyle}
      {...rest}
    >
      {children}
    </a>
  );
}

// Internal-route flavor: renders next/link.
export function ComicLinkButton({
  href,
  variant = "primary",
  className = "",
  children,
  ...rest
}: {
  href: string;
  variant?: Variant;
  className?: string;
  children: ReactNode;
} & Omit<ComponentProps<typeof Link>, "href" | "className" | "children">) {
  return (
    <Link
      href={href}
      className={`${base} ${VARIANT[variant]} ${className}`.trim()}
      style={shadowStyle}
      {...rest}
    >
      {children}
    </Link>
  );
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `pnpm test -- src/components/ui/comic/__tests__/ComicButton.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/comic/ComicButton.tsx src/components/ui/comic/__tests__/ComicButton.test.tsx
git commit -m "$(cat <<'EOF'
feat(projects): ComicButton and ComicLinkButton

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `ProjectCard` rewrite with variants

**Files:**
- Modify (full rewrite): `src/components/projects/ProjectCard.tsx`
- Modify (full rewrite): `src/components/projects/__tests__/ProjectCard.test.tsx`

- [ ] **Step 1: Replace the test file with the new contract**

Overwrite `src/components/projects/__tests__/ProjectCard.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProjectCard } from "@/components/projects/ProjectCard";
import type { Project } from "@/data/projects";

const base: Project = {
  slug: "demo",
  title: "Demo Project",
  summary: "A short summary.",
  year: "2025",
  tags: ["CLI", "Open source"],
  stack: ["TypeScript", "Node"],
  highlights: ["does a thing"],
  images: [],
  liveUrl: "https://live.example.com",
  repoUrl: "https://github.com/x/y",
};

describe("ProjectCard", () => {
  for (const variant of [
    "large",
    "tall",
    "wide",
    "small",
    "feature",
    "aux",
    "uniform",
  ] as const) {
    it(`(${variant}) links the title to the project detail page`, () => {
      render(
        <ProjectCard
          project={base}
          index={0}
          variant={variant}
          issueNumber="04"
        />,
      );
      expect(
        screen.getByRole("link", { name: "Demo Project" }),
      ).toHaveAttribute("href", "/projects/demo");
    });
  }

  it("renders the summary in non-small variants", () => {
    render(
      <ProjectCard
        project={base}
        index={1}
        variant="uniform"
        issueNumber="03"
      />,
    );
    expect(screen.getByText("A short summary.")).toBeInTheDocument();
  });

  it("omits the summary in the small variant", () => {
    render(
      <ProjectCard
        project={base}
        index={3}
        variant="small"
        issueNumber="01"
      />,
    );
    expect(screen.queryByText("A short summary.")).toBeNull();
  });

  it("never renders Live demo or Source links on listing variants", () => {
    render(
      <ProjectCard
        project={base}
        index={0}
        variant="large"
        issueNumber="04"
      />,
    );
    expect(screen.queryByRole("link", { name: /live demo/i })).toBeNull();
    expect(
      screen.queryByRole("link", { name: /^source$/i }),
    ).toBeNull();
  });

  it("never renders tag pills on listing variants", () => {
    render(
      <ProjectCard
        project={base}
        index={0}
        variant="large"
        issueNumber="04"
      />,
    );
    expect(screen.queryByText("CLI")).toBeNull();
    expect(screen.queryByText("Open source")).toBeNull();
  });

  it("renders the issue number with the № prefix", () => {
    render(
      <ProjectCard
        project={base}
        index={0}
        variant="large"
        issueNumber="04"
      />,
    );
    expect(screen.getByText(/№04/)).toBeInTheDocument();
  });

  it("always renders a POW mark for the first project (index 0)", () => {
    render(
      <ProjectCard
        project={base}
        index={0}
        variant="large"
        issueNumber="04"
      />,
    );
    // The MARKS pool: THWIP! BAMF! ZAP! BOOM! KAPOW! SNIKT!
    const found = [
      "THWIP!",
      "BAMF!",
      "ZAP!",
      "BOOM!",
      "KAPOW!",
      "SNIKT!",
    ].some((m) => screen.queryByText(m) !== null);
    expect(found).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `pnpm test -- src/components/projects/__tests__/ProjectCard.test.tsx`
Expected: FAIL — assertions break against the current image-left card.

- [ ] **Step 3: Replace `ProjectCard.tsx`**

Overwrite `src/components/projects/ProjectCard.tsx`:

```tsx
import Link from "next/link";
import type { Project } from "@/data/projects";
import { ComicPanel } from "@/components/ui/comic/ComicPanel";
import { IssueTag } from "@/components/ui/comic/IssueTag";
import { PowMark } from "@/components/ui/comic/PowMark";
import { getTint, getMark } from "@/lib/projectVisuals";

export type ProjectCardVariant =
  | "large"
  | "tall"
  | "wide"
  | "small"
  | "feature"
  | "aux"
  | "uniform";

type Props = {
  project: Project;
  index: number;
  variant: ProjectCardVariant;
  issueNumber: string;
  className?: string;
};

const TITLE_SIZE: Record<ProjectCardVariant, string> = {
  large: "text-2xl sm:text-3xl",
  feature: "text-2xl sm:text-3xl",
  tall: "text-lg",
  wide: "text-lg",
  aux: "text-lg",
  uniform: "text-lg",
  small: "text-sm",
};

const SHOW_SUMMARY: Record<ProjectCardVariant, boolean> = {
  large: true,
  feature: true,
  tall: true,
  wide: true,
  aux: true,
  uniform: true,
  small: false,
};

const ISSUE_VARIANT_BY_INDEX = ["red", "blue", "dark"] as const;
const ISSUE_ROTATE_BY_INDEX = [-3, 2, -1] as const;

export function ProjectCard({
  project,
  index,
  variant,
  issueNumber,
  className = "",
}: Props) {
  const tint = getTint(project, index);
  const mark = getMark(project, index);
  const issueVariant =
    ISSUE_VARIANT_BY_INDEX[index % ISSUE_VARIANT_BY_INDEX.length];
  const issueRotate =
    ISSUE_ROTATE_BY_INDEX[index % ISSUE_ROTATE_BY_INDEX.length];
  const isFeatured = variant === "large" || variant === "feature";
  const label = index === 0 && isFeatured ? "NEW" : undefined;

  return (
    <ComicPanel tint={tint} className={`h-full w-full ${className}`}>
      <IssueTag
        number={issueNumber}
        label={label}
        variant={issueVariant}
        rotate={issueRotate}
      />
      {mark && (
        <PowMark
          word={mark}
          color={index % 2 === 0 ? "spidey" : "web"}
          rotate={isFeatured ? 8 : -6}
        />
      )}
      <div className="absolute inset-x-4 bottom-3 z-10">
        <h3
          className={`font-display font-black leading-none ${TITLE_SIZE[variant]}`}
          style={{ textShadow: "0 2px 6px rgba(0,0,0,0.7)" }}
        >
          <Link
            href={`/projects/${project.slug}`}
            className="after:absolute after:inset-0 after:content-['']"
          >
            {project.title}
          </Link>
        </h3>
        {SHOW_SUMMARY[variant] && (
          <p
            className={`mt-1.5 max-w-[90%] ${
              isFeatured ? "text-sm text-ink" : "text-xs text-muted"
            }`}
          >
            {project.summary}
          </p>
        )}
      </div>
    </ComicPanel>
  );
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `pnpm test -- src/components/projects/__tests__/ProjectCard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/projects/ProjectCard.tsx src/components/projects/__tests__/ProjectCard.test.tsx
git commit -m "$(cat <<'EOF'
feat(projects): ProjectCard with variants — comic panel layout

Replaces image-left horizontal card with a ComicPanel-driven card whose
variant controls title size and summary presence. Listing cards no longer
render Live demo / Source / tag pills — those live on the detail page.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Home `Projects` section — hybrid 6-column grid

**Files:**
- Modify (full rewrite): `src/components/sections/Projects.tsx`
- Modify: `src/components/sections/__tests__/Projects.test.tsx`

- [ ] **Step 1: Update the test**

Overwrite `src/components/sections/__tests__/Projects.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Projects } from "@/components/sections/Projects";
import { projects } from "@/data/projects";

describe("Projects (home section)", () => {
  it("renders the 'Selected Projects' heading", () => {
    render(<Projects />);
    expect(
      screen.getByRole("heading", { name: "Selected Projects" }),
    ).toBeInTheDocument();
  });

  it("renders a 'View All Issues' link to /projects", () => {
    render(<Projects />);
    expect(
      screen.getByRole("link", { name: /view all issues/i }),
    ).toHaveAttribute("href", "/projects");
  });

  it("renders up to the first 4 projects, each linked to its detail page", () => {
    render(<Projects />);
    for (const p of projects.slice(0, 4)) {
      expect(
        screen.getByRole("link", { name: p.title }),
      ).toHaveAttribute("href", `/projects/${p.slug}`);
    }
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `pnpm test -- src/components/sections/__tests__/Projects.test.tsx`
Expected: FAIL — current section still says "Projects" / "View all projects".

- [ ] **Step 3: Replace `Projects.tsx`**

Overwrite `src/components/sections/Projects.tsx`:

```tsx
import { Section } from "@/components/ui/Section";
import { ComicLinkButton } from "@/components/ui/comic/ComicButton";
import {
  ProjectCard,
  type ProjectCardVariant,
} from "@/components/projects/ProjectCard";
import { projects } from "@/data/projects";

// Hybrid 6-column grid: large + tall side-by-side on top, wide + small on
// bottom. Collapses to single column below md.
const HOME_VARIANTS: readonly ProjectCardVariant[] = [
  "large",
  "tall",
  "wide",
  "small",
];

const CELL_CLASS: readonly string[] = [
  "md:col-span-4 md:row-span-2 min-h-[200px]",
  "md:col-span-2 md:row-span-2 min-h-[160px]",
  "md:col-span-4 md:row-span-1 min-h-[140px]",
  "md:col-span-2 md:row-span-1 min-h-[140px]",
];

export function Projects() {
  const featured = projects.slice(0, 4);
  const total = projects.length;

  return (
    <Section id="projects" eyebrow="Work" title="Selected Projects">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-6 md:grid-rows-[140px_140px_140px] md:gap-2">
        {featured.map((p, i) => (
          <div key={p.slug} className={CELL_CLASS[i]}>
            <ProjectCard
              project={p}
              index={i}
              variant={HOME_VARIANTS[i] ?? "small"}
              issueNumber={String(total - i).padStart(2, "0")}
            />
          </div>
        ))}
      </div>
      <div className="mt-8">
        <ComicLinkButton href="/projects" variant="primary">
          View All Issues →
        </ComicLinkButton>
      </div>
    </Section>
  );
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `pnpm test -- src/components/sections/__tests__/Projects.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/sections/Projects.tsx src/components/sections/__tests__/Projects.test.tsx
git commit -m "$(cat <<'EOF'
feat(projects): home Projects section — comic panel hybrid grid

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: `/projects` index — "The Casefile" with featured row + uniform grid

**Files:**
- Modify (full rewrite): `src/app/projects/page.tsx`
- Modify: `src/app/projects/__tests__/page.test.tsx`

- [ ] **Step 1: Update the test**

Overwrite `src/app/projects/__tests__/page.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ProjectsPage from "@/app/projects/page";
import { projects } from "@/data/projects";

describe("/projects page", () => {
  it("renders 'The Casefile' as the visible h1", () => {
    render(<ProjectsPage />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toMatch(/Casefile/);
  });

  it("renders one card per project, each linked to its detail page", () => {
    render(<ProjectsPage />);
    for (const p of projects) {
      expect(
        screen.getByRole("link", { name: p.title }),
      ).toHaveAttribute("href", `/projects/${p.slug}`);
    }
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `pnpm test -- src/app/projects/__tests__/page.test.tsx`
Expected: FAIL — current page still says "Projects".

- [ ] **Step 3: Replace `page.tsx`**

Overwrite `src/app/projects/page.tsx`:

```tsx
import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { projects } from "@/data/projects";

// Metadata title stays "Projects" for searchability (per spec §1 out-of-scope).
// Visible h1 is "The Casefile."
export const metadata: Metadata = {
  title: "Projects",
  description: "Things I've built — personal projects and open-source work.",
};

export default function ProjectsPage() {
  const total = projects.length;
  const feature = projects[0];
  const aux = projects[1];
  const rest = projects.slice(2);

  return (
    <Container className="py-20">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-web-strong">
        Work
      </p>
      <h1 className="mt-2 font-display text-4xl font-extrabold sm:text-5xl">
        The <span className="text-spidey">Casefile</span>
      </h1>
      <p className="mt-3 max-w-xl text-muted">
        A few things I&rsquo;ve designed and built &mdash; newest first.
      </p>

      {(feature || aux) && (
        <div className="mt-10 grid grid-cols-1 gap-3 md:grid-cols-3 md:grid-rows-[220px] md:gap-2">
          {feature && (
            <div className="md:col-span-2 min-h-[200px] md:min-h-0">
              <ProjectCard
                project={feature}
                index={0}
                variant="feature"
                issueNumber={String(total).padStart(2, "0")}
              />
            </div>
          )}
          {aux && (
            <div className="md:col-span-1 min-h-[160px] md:min-h-0">
              <ProjectCard
                project={aux}
                index={1}
                variant="aux"
                issueNumber={String(total - 1).padStart(2, "0")}
              />
            </div>
          )}
        </div>
      )}

      {rest.length > 0 && (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 md:gap-2">
          {rest.map((p, idx) => {
            const i = idx + 2;
            return (
              <div key={p.slug} className="aspect-[4/3]">
                <ProjectCard
                  project={p}
                  index={i}
                  variant="uniform"
                  issueNumber={String(total - i).padStart(2, "0")}
                />
              </div>
            );
          })}
        </div>
      )}
    </Container>
  );
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `pnpm test -- src/app/projects/__tests__/page.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/projects/page.tsx src/app/projects/__tests__/page.test.tsx
git commit -m "$(cat <<'EOF'
feat(projects): /projects — The Casefile (featured row + uniform grid)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: `/projects/[slug]` detail page — comic cover hero + numbered highlight panels

**Files:**
- Modify (full rewrite): `src/app/projects/[slug]/page.tsx`
- Modify: `src/app/projects/[slug]/__tests__/page.test.tsx`

- [ ] **Step 1: Update the test**

Overwrite `src/app/projects/[slug]/__tests__/page.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ProjectDetailPage, {
  generateStaticParams,
  generateMetadata,
} from "@/app/projects/[slug]/page";
import { projects, getAllSlugs } from "@/data/projects";

const sample = projects[0];

describe("/projects/[slug] detail page", () => {
  it("generateStaticParams returns every slug", () => {
    expect(generateStaticParams()).toEqual(
      getAllSlugs().map((slug) => ({ slug })),
    );
  });

  it("renders the project title as an h1", async () => {
    const ui = await ProjectDetailPage({
      params: Promise.resolve({ slug: sample.slug }),
    });
    render(ui);
    expect(
      screen.getByRole("heading", { level: 1, name: sample.title }),
    ).toBeInTheDocument();
  });

  it("renders the 'Back to The Casefile' link to /projects", async () => {
    const ui = await ProjectDetailPage({
      params: Promise.resolve({ slug: sample.slug }),
    });
    render(ui);
    expect(
      screen.getByRole("link", { name: /back to the casefile/i }),
    ).toHaveAttribute("href", "/projects");
  });

  it("renders each highlight bullet", async () => {
    const ui = await ProjectDetailPage({
      params: Promise.resolve({ slug: sample.slug }),
    });
    render(ui);
    for (const h of sample.highlights) {
      expect(screen.getByText(h)).toBeInTheDocument();
    }
  });

  it("sets metadata title and description from the project", async () => {
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: sample.slug }),
    });
    expect(meta.title).toBe(sample.title);
    expect(meta.description).toBe(sample.summary);
  });

  it("calls notFound for an unknown slug (throws)", async () => {
    await expect(
      ProjectDetailPage({ params: Promise.resolve({ slug: "nope" }) }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `pnpm test -- src/app/projects/[slug]/__tests__/page.test.tsx`
Expected: FAIL — current page says "Back to projects" (not "to The Casefile").

- [ ] **Step 3: Replace `page.tsx`**

Overwrite `src/app/projects/[slug]/page.tsx`:

```tsx
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { ComicPanel } from "@/components/ui/comic/ComicPanel";
import { IssueTag } from "@/components/ui/comic/IssueTag";
import {
  ComicButton,
} from "@/components/ui/comic/ComicButton";
import { Carousel } from "@/components/ui/Carousel";
import { YouTubeEmbed } from "@/components/comedy/YouTubeEmbed";
import { getProject, getAllSlugs, projects } from "@/data/projects";
import { getTint } from "@/lib/projectVisuals";

function accentedTitle(title: string): ReactNode {
  const parts = title.split(" ");
  if (parts.length < 2) return title;
  const last = parts[parts.length - 1];
  const rest = parts.slice(0, -1).join(" ");
  return (
    <>
      {rest} <span className="text-spidey-strong">{last}</span>
    </>
  );
}

export function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const project = getProject(slug);
  if (!project) return {};
  return { title: project.title, description: project.summary };
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const project = getProject(slug);
  if (!project) notFound();

  const index = projects.findIndex((p) => p.slug === slug);
  const issueNumber = String(projects.length - index).padStart(2, "0");
  const tint = getTint(project, index);

  return (
    <Container className="py-16">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/projects"
          className="rounded text-sm text-muted hover:text-web-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web"
        >
          ← Back to The Casefile
        </Link>

        {/* Cover panel */}
        <ComicPanel tint={tint} className="mt-6 border-[4px] p-7 sm:p-8">
          <IssueTag
            number={issueNumber}
            label={project.year}
            variant="red"
            rotate={-2}
          />
          <div className="relative z-10">
            <h1
              className="mt-6 font-display text-4xl font-black leading-none sm:text-5xl"
              style={{ textShadow: "0 2px 12px rgba(0,0,0,0.7)" }}
            >
              {accentedTitle(project.title)}
            </h1>
            <p className="mt-3 max-w-prose text-base text-ink">
              {project.summary}
            </p>
            {project.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {project.tags.map((t) => (
                  <span
                    key={t}
                    className="inline-block rounded border border-white/20 bg-black/55 px-2 py-0.5 text-xs text-ink"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
            {project.stack.length > 0 && (
              <p className="mt-3 text-sm text-web-strong">
                {project.stack.join(" · ")}
              </p>
            )}
          </div>
        </ComicPanel>

        {(project.liveUrl || project.repoUrl) && (
          <div className="mt-6 flex flex-wrap gap-3">
            {project.liveUrl && (
              <ComicButton
                href={project.liveUrl}
                target="_blank"
                variant="primary"
              >
                Live demo
              </ComicButton>
            )}
            {project.repoUrl && (
              <ComicButton
                href={project.repoUrl}
                target="_blank"
                variant="ghost"
              >
                View Source
              </ComicButton>
            )}
          </div>
        )}

        {project.youtubeId && (
          <div className="mt-8 border-[3px] border-panel-border" style={{ boxShadow: "4px 4px 0 var(--color-panel-shadow)" }}>
            <YouTubeEmbed
              youtubeId={project.youtubeId}
              title={`${project.title} — trailer`}
            />
          </div>
        )}

        {!project.youtubeId && project.images.length > 0 && (
          <div className="mt-8 border-[3px] border-panel-border overflow-hidden" style={{ boxShadow: "4px 4px 0 var(--color-panel-shadow)" }}>
            <Carousel
              images={project.images}
              altPrefix={`${project.title} screenshot`}
              aspectClassName="aspect-video"
            />
          </div>
        )}

        {project.highlights.length > 0 && (
          <>
            <div className="mt-10">
              <span
                className="inline-block border-2 border-panel-border bg-white px-2.5 py-1 font-display text-sm font-black uppercase tracking-widest text-black"
                style={{ boxShadow: "2px 2px 0 var(--color-web)" }}
              >
                What it does
              </span>
            </div>
            <div className="mt-5 flex flex-col gap-3">
              {project.highlights.map((h, i) => (
                <ComicPanel key={h} tint="blue" className="px-5 py-4 pl-16">
                  <span
                    aria-hidden="true"
                    className="absolute left-3.5 top-3 font-display text-3xl font-black leading-none text-spidey"
                    style={{ fontFamily: "ui-monospace, SFMono-Regular, monospace" }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <p className="relative z-10 text-base text-ink">{h}</p>
                </ComicPanel>
              ))}
            </div>
          </>
        )}
      </div>
    </Container>
  );
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `pnpm test -- src/app/projects/[slug]/__tests__/page.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/projects/[slug]/page.tsx src/app/projects/[slug]/__tests__/page.test.tsx
git commit -m "$(cat <<'EOF'
feat(projects): /projects/[slug] — comic cover hero + numbered panels

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Full verification (tests, build, e2e, manual visual check)

**Files:** none modified — verification only.

- [ ] **Step 1: Run the full vitest suite**

Run: `pnpm test`
Expected: PASS — all suites green. If any previously-untouched test fails, stop and investigate; the redesign should not affect Hero/Experience/Skills/About/Comedy tests.

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: no errors. Common issues to fix on the spot: unused imports left from the rewrites, `<a>` where `next/link` is preferred for internal hrefs (we already handle the internal `/projects` link via `ComicLinkButton` — but verify the detail page's "← Back to The Casefile" still uses `next/link` `Link` rather than `<a>`).

- [ ] **Step 3: Production build**

Run: `pnpm run build`
Expected: build succeeds, typechecks pass, static generation completes for every project slug. If a project slug fails to render at build time, the most likely cause is the detail page calling `projects.findIndex` for a slug not in the array — check `getProject` returned a value before `findIndex`.

- [ ] **Step 4: Run the existing Playwright suite**

Run: `pnpm e2e`
Expected: PASS. Existing tests target visible link names (`Demo Project` etc.) which are stable across the redesign. If a project-navigation test fails due to the home heading change (`Projects` → `Selected Projects`) or the "View all projects" link text change (→ `View All Issues`), update the e2e selector and re-run.

- [ ] **Step 5: Manual visual check across breakpoints**

Run: `pnpm dev` and visit:
- `http://localhost:3000/#projects` — confirm the hybrid 6-column grid renders correctly at desktop (`≥ md`) and collapses cleanly to a single column at mobile (`< md`).
- `http://localhost:3000/projects` — confirm "The Casefile" h1 with the spidey accent, featured row at the top, and the uniform grid below for the rest. With 4 projects today this means: 1 feature panel + 1 aux + the remaining 2 in the uniform grid.
- `http://localhost:3000/projects/turingagent` (or any slug) — confirm the comic-cover hero, the buttons, the splash panel if applicable, and the numbered highlight panels.
- Resize: 360px (smallest reasonable phone), 768px (md), 1280px (desktop). Confirm panel borders stay sharp, halftone overlays don't wash out the title, POW marks remain legible.

Document any visual issues in the commit message for any follow-up tuning commit.

- [ ] **Step 6: Final commit (if any follow-up tuning needed)**

If the manual check turns up small fixes (e.g., title text too tight on a phone width, halftone too dark over the cover tint), apply them as one final commit:

```bash
git add -A
git commit -m "$(cat <<'EOF'
style(projects): visual tuning from manual breakpoint check

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

If no fixes are needed, skip this step.

---

## Self-review checklist (already run, listed here for the implementing engineer)

- [x] **Spec coverage** — every spec section maps to at least one task. §2 visual direction → Tasks 3-7. §3 tint/mark derivation → Task 2. §4 primitives → Tasks 3-6. §5.1 home → Task 8. §5.2 index → Task 9. §5.3 ProjectCard → Task 7. §5.4 detail → Task 10. §6 tokens → Task 1. §7 responsive → covered inside Tasks 8/9 grid classes. §8 accessibility → asserted in primitive tests (aria-hidden). §9 testing → Tasks 7-10 (test updates) + Task 11. §10 single-PR migration → all surfaces flip together.
- [x] **No placeholders** — every step contains exact code, no "TODO" / "add validation" / "similar to Task N" lines.
- [x] **Type consistency** — `Tint`, `ProjectCardVariant`, `MARKS`, `getTint`, `getMark`, `hashSlug` use identical names everywhere they appear. `IssueTag` props (`number`, `label`, `variant`, `rotate`) match between Task 4 definition and Task 7/10 consumers.
- [x] **One opinionated call to flag during execution** — the detail page wraps `YouTubeEmbed` / `Carousel` in a bordered/shadowed `<div>` rather than a `ComicPanel`, because the embed/carousel internals already manage their own backgrounds; wrapping them in `ComicPanel` would layer the halftone over the video and tint the player. If you'd prefer panel framing for these media blocks, replace the `<div>` with `<ComicPanel tint="blue" className="p-0">` and add `bg-black` on the inner embed wrapper. Mention in PR.
