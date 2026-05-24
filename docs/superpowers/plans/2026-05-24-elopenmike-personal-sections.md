# elOpenMike — Plan 3: Personal Sections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the personal sections — About + Turing (home) and Comedy (home teaser + `/comedy` page with YouTube clips and a photo gallery) — using typed data and the existing design system.

**Architecture:** Typed `about.ts` / `comedy.ts` data drive a server-rendered `About` section and Comedy UI. Clips use a lightweight client-side `YouTubeEmbed` facade (thumbnail → click loads a `youtube-nocookie` iframe). `Comedy` (home) teases one clip; `/comedy` shows all clips + a `PhotoGallery`. Sections wire into the home page (after Projects) and the nav.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, next/image, Vitest + RTL. Package manager: **pnpm**.

**Spec:** `docs/superpowers/specs/2026-05-24-elopenmike-personal-sections-design.md`

**Conventions:**
- Run all commands from the worktree root (absolute paths; shell does not persist `cd`). Single test: `pnpm exec vitest run <path>`; all: `pnpm test`; build: `pnpm run build`.
- Reuse the design system: `Section` (`@/components/ui/Section`, props `id, eyebrow?, title, children, className?`), `Container`, `Button`/`LinkButton` (`@/components/ui/Button`), `Tag` (`@/components/ui/Tag`, `Tag({children})`). Tokens: `bg-canvas`, `bg-surface`, `border-edge`, `text-spidey`, `text-web`, `text-muted`, `text-ink`, `bg-spidey`, `font-display`. NEVER use `font-[family-name:...]`.
- `next.config.ts` already has `images.unoptimized: true`. YouTube thumbnails use a plain `<img>` (no remote-image config needed).
- Commits: Conventional Commits ending with:
  ```
  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  ```

---

## File Structure

```
src/
  data/
    about.ts                          # CREATE: About type + content
    comedy.ts                         # CREATE: Clip/Photo types + clips/photos
    __tests__/about.test.ts           # CREATE
    __tests__/comedy.test.ts          # CREATE
  components/
    sections/
      About.tsx                       # CREATE: About + Turing (Layout A)
      Comedy.tsx                      # CREATE: home teaser (1 featured clip)
      __tests__/About.test.tsx        # CREATE
      __tests__/Comedy.test.tsx       # CREATE
    comedy/
      YouTubeEmbed.tsx                # CREATE: client facade (thumbnail -> iframe)
      PhotoGallery.tsx                # CREATE: responsive photo grid
      __tests__/YouTubeEmbed.test.tsx # CREATE
      __tests__/PhotoGallery.test.tsx # CREATE
  app/
    page.tsx                          # MODIFY: add <About/> + <Comedy/> after <Projects/>
    __tests__/page.test.tsx           # MODIFY: assert About headline + "Stand-up"
    comedy/
      page.tsx                        # CREATE: /comedy (clips grid + gallery)
      __tests__/page.test.tsx         # CREATE
  lib/
    site.ts                           # MODIFY: add About + Comedy nav items
public/
  images/about/.gitkeep              # CREATE
  images/comedy/.gitkeep             # CREATE
```

---

## Task 1: About data + section

**Files:** Create `src/data/about.ts`, `src/components/sections/About.tsx`; Test `src/data/__tests__/about.test.ts`, `src/components/sections/__tests__/About.test.tsx`.

- [ ] **Step 1: Failing data test** — `src/data/__tests__/about.test.ts`
```ts
import { describe, it, expect } from "vitest";
import { about } from "@/data/about";

describe("about data", () => {
  it("is well-formed", () => {
    expect(about.headline).toBeTruthy();
    expect(Array.isArray(about.bio)).toBe(true);
    expect(about.bio.length).toBeGreaterThan(0);
    expect(about.turing.caption).toBeTruthy();
    expect(Array.isArray(about.facts)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it** → `pnpm exec vitest run src/data/__tests__/about.test.ts` → FAIL (cannot resolve `@/data/about`).

- [ ] **Step 3: Implement** — `src/data/about.ts`
```ts
export type About = {
  headline: string;
  bio: string[]; // paragraphs
  turing: { caption: string; image?: string }; // image: path under /images/about/
  facts: string[]; // chip labels
};

// Placeholder content — edit freely. Add a Turing photo at
// public/images/about/turing.jpg and set turing.image to "/images/about/turing.jpg".
export const about: About = {
  headline: "Builder, lifter, occasional comedian",
  bio: [
    "I'm a software engineer who likes shipping things that work — and a few that web-sling. [Replace with 2–3 sentences of your engineering story: what you build and what you care about.]",
    "Off the clock I'm at the gym, deep in a movie or TV rabbit hole, or out at an open mic.",
  ],
  turing: {
    caption:
      "Turing — blue merle Mini American Shepherd, and my best debugging partner.",
    image: "",
  },
  facts: ["🏋️ Lifting", "🎬 Movies & TV", "🕷️ Spider-Man (huge)"],
};
```

- [ ] **Step 4: Run the data test** → PASS.

- [ ] **Step 5: Failing About component test** — `src/components/sections/__tests__/About.test.tsx`
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { About } from "@/components/sections/About";
import { about } from "@/data/about";

describe("About", () => {
  it("renders the headline, Turing caption, and fact chips", () => {
    render(<About />);
    expect(
      screen.getByRole("heading", { name: about.headline }),
    ).toBeInTheDocument();
    expect(screen.getByText(about.turing.caption)).toBeInTheDocument();
    for (const f of about.facts) {
      expect(screen.getByText(f)).toBeInTheDocument();
    }
  });
});
```

- [ ] **Step 6: Run it** → FAIL (cannot resolve `@/components/sections/About`).

- [ ] **Step 7: Implement** — `src/components/sections/About.tsx`
```tsx
import Image from "next/image";
import { Section } from "@/components/ui/Section";
import { Tag } from "@/components/ui/Tag";
import { about } from "@/data/about";

export function About() {
  return (
    <Section id="about" eyebrow="About" title={about.headline}>
      <div className="grid gap-8 sm:grid-cols-[1.4fr_1fr]">
        <div>
          {about.bio.map((p) => (
            <p key={p} className="mb-4 text-muted last:mb-0">
              {p}
            </p>
          ))}
          {about.facts.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2">
              {about.facts.map((f) => (
                <Tag key={f}>{f}</Tag>
              ))}
            </div>
          )}
        </div>

        <figure className="overflow-hidden rounded-2xl border border-edge bg-surface">
          <div className="relative aspect-[4/3]">
            {about.turing.image ? (
              <Image
                src={about.turing.image}
                alt="Turing"
                fill
                sizes="(max-width: 640px) 100vw, 40vw"
                className="object-cover"
              />
            ) : (
              <div
                aria-hidden="true"
                className="h-full w-full"
                style={{
                  backgroundColor: "#11151f",
                  backgroundImage:
                    "radial-gradient(circle at 40% 35%, rgba(27,111,227,.35), transparent 60%), radial-gradient(circle at 70% 75%, rgba(230,36,41,.28), transparent 55%)",
                }}
              />
            )}
          </div>
          <figcaption className="px-4 py-3 text-sm text-muted">
            {about.turing.caption}
          </figcaption>
        </figure>
      </div>
    </Section>
  );
}
```

- [ ] **Step 8: Run all tests + build** → `pnpm test && pnpm run build` → green, EXIT 0.

- [ ] **Step 9: Commit**
```bash
git add -A
git commit -m "feat: add About + Turing section

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Comedy data + YouTubeEmbed facade

**Files:** Create `src/data/comedy.ts`, `src/components/comedy/YouTubeEmbed.tsx`; Test `src/data/__tests__/comedy.test.ts`, `src/components/comedy/__tests__/YouTubeEmbed.test.tsx`.

- [ ] **Step 1: Failing data test** — `src/data/__tests__/comedy.test.ts`
```ts
import { describe, it, expect } from "vitest";
import { clips, photos } from "@/data/comedy";

describe("comedy data", () => {
  it("clips are well-formed", () => {
    expect(Array.isArray(clips)).toBe(true);
    for (const c of clips) {
      expect(c.youtubeId).toBeTruthy();
      expect(c.title).toBeTruthy();
    }
  });
  it("photos are well-formed", () => {
    expect(Array.isArray(photos)).toBe(true);
    for (const p of photos) {
      expect(p.src).toBeTruthy();
      expect(p.alt).toBeTruthy();
    }
  });
});
```

- [ ] **Step 2: Run it** → FAIL (cannot resolve `@/data/comedy`).

- [ ] **Step 3: Implement** — `src/data/comedy.ts`
```ts
export type Clip = { youtubeId: string; title: string };
export type Photo = { src: string; alt: string }; // src under /images/comedy/

// Placeholder clips — replace youtubeId/title with your real sets. youtubeId is
// the value after `v=` in a YouTube URL (e.g. ".../watch?v=dQw4w9WgXcQ").
export const clips: Clip[] = [
  { youtubeId: "dQw4w9WgXcQ", title: "Open mic set (replace me)" },
  { youtubeId: "dQw4w9WgXcQ", title: "Crowd work — the dog bit (replace me)" },
  { youtubeId: "dQw4w9WgXcQ", title: "Tech jokes that landed (replace me)" },
];

// Add photos at public/images/comedy/ and list them here, e.g.
// { src: "/images/comedy/set-1.jpg", alt: "On stage at the open mic" }.
export const photos: Photo[] = [];
```

- [ ] **Step 4: Run the data test** → PASS.

- [ ] **Step 5: Failing YouTubeEmbed test** — `src/components/comedy/__tests__/YouTubeEmbed.test.tsx`
```tsx
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { YouTubeEmbed } from "@/components/comedy/YouTubeEmbed";

describe("YouTubeEmbed", () => {
  it("shows a play button facade and loads a nocookie iframe on click", () => {
    const { container } = render(
      <YouTubeEmbed youtubeId="abc123" title="My set" />,
    );
    const btn = screen.getByRole("button", { name: "Play: My set" });
    expect(btn).toBeInTheDocument();
    expect(container.querySelector("iframe")).toBeNull();

    fireEvent.click(btn);

    const iframe = container.querySelector("iframe");
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute("src")).toContain("abc123");
    expect(iframe?.getAttribute("src")).toContain("youtube-nocookie.com");
  });
});
```

- [ ] **Step 6: Run it** → FAIL (cannot resolve `@/components/comedy/YouTubeEmbed`).

- [ ] **Step 7: Implement** — `src/components/comedy/YouTubeEmbed.tsx`
```tsx
"use client";

import { useState } from "react";

// Lightweight YouTube facade: shows the thumbnail + a red play button, and only
// loads the (privacy-friendly) iframe after the user clicks. No upfront scripts.
export function YouTubeEmbed({
  youtubeId,
  title,
}: {
  youtubeId: string;
  title: string;
}) {
  const [playing, setPlaying] = useState(false);

  if (playing) {
    return (
      <div className="relative aspect-video overflow-hidden rounded-xl border border-edge">
        <iframe
          className="absolute inset-0 h-full w-full"
          src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      aria-label={`Play: ${title}`}
      className="group relative block aspect-video w-full overflow-hidden rounded-xl border border-edge bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`}
        alt=""
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover"
      />
      <span className="absolute inset-0 flex items-center justify-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-spidey text-white shadow-lg transition-transform group-hover:scale-110">
          ▶
        </span>
      </span>
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 text-left text-sm text-ink">
        {title}
      </span>
    </button>
  );
}
```

- [ ] **Step 8: Run the YouTubeEmbed test** → PASS.

- [ ] **Step 9: Run all tests + build** → `pnpm test && pnpm run build` → green, EXIT 0.

- [ ] **Step 10: Commit**
```bash
git add -A
git commit -m "feat: add comedy data and YouTubeEmbed facade

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: PhotoGallery

**Files:** Create `src/components/comedy/PhotoGallery.tsx`; Test `src/components/comedy/__tests__/PhotoGallery.test.tsx`.

- [ ] **Step 1: Failing test** — `src/components/comedy/__tests__/PhotoGallery.test.tsx`
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PhotoGallery } from "@/components/comedy/PhotoGallery";

describe("PhotoGallery", () => {
  it("renders an image per photo", () => {
    render(
      <PhotoGallery
        photos={[
          { src: "/images/comedy/a.jpg", alt: "Set A" },
          { src: "/images/comedy/b.jpg", alt: "Set B" },
        ]}
      />,
    );
    expect(screen.getByRole("img", { name: "Set A" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Set B" })).toBeInTheDocument();
  });

  it("renders nothing when there are no photos", () => {
    const { container } = render(<PhotoGallery photos={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
```
NOTE: this renders `next/image`. With `images.unoptimized` it renders a plain `<img>` with the `alt`. If `next/image` throws in jsdom for any reason, add at the top of the test file:
```tsx
import { vi } from "vitest";
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...(props as Record<string, unknown>)} />;
  },
}));
```
Try WITHOUT the mock first; only add it if the test errors on `next/image`.

- [ ] **Step 2: Run it** → FAIL (cannot resolve `@/components/comedy/PhotoGallery`).

- [ ] **Step 3: Implement** — `src/components/comedy/PhotoGallery.tsx`
```tsx
import Image from "next/image";
import type { Photo } from "@/data/comedy";

export function PhotoGallery({ photos }: { photos: Photo[] }) {
  if (photos.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {photos.map((p) => (
        <div
          key={p.src}
          className="relative aspect-square overflow-hidden rounded-lg border border-edge bg-surface"
        >
          <Image
            src={p.src}
            alt={p.alt}
            fill
            sizes="(max-width: 640px) 50vw, 25vw"
            className="object-cover"
          />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run the test** → PASS (2).

- [ ] **Step 5: Commit**
```bash
git add -A
git commit -m "feat: add PhotoGallery for comedy photos

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Comedy home teaser section

**Files:** Create `src/components/sections/Comedy.tsx`; Test `src/components/sections/__tests__/Comedy.test.tsx`.

- [ ] **Step 1: Failing test** — `src/components/sections/__tests__/Comedy.test.tsx`
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Comedy } from "@/components/sections/Comedy";
import { clips } from "@/data/comedy";

describe("Comedy (home teaser)", () => {
  it("renders the Stand-up heading and a Watch more link to /comedy", () => {
    render(<Comedy />);
    expect(
      screen.getByRole("heading", { name: "Stand-up" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /watch more/i }),
    ).toHaveAttribute("href", "/comedy");
  });

  it("features the first clip", () => {
    render(<Comedy />);
    expect(
      screen.getByRole("button", { name: `Play: ${clips[0].title}` }),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it** → FAIL (cannot resolve `@/components/sections/Comedy`).

- [ ] **Step 3: Implement** — `src/components/sections/Comedy.tsx`
```tsx
import { Section } from "@/components/ui/Section";
import { LinkButton } from "@/components/ui/Button";
import { YouTubeEmbed } from "@/components/comedy/YouTubeEmbed";
import { clips } from "@/data/comedy";

export function Comedy() {
  const featured = clips[0];
  return (
    <Section id="comedy" eyebrow="Comedy" title="Stand-up">
      <p className="max-w-xl text-muted">
        Builder by day, open-mic by night. A recent set:
      </p>
      {featured && (
        <div className="mt-6 max-w-2xl">
          <YouTubeEmbed youtubeId={featured.youtubeId} title={featured.title} />
        </div>
      )}
      <div className="mt-8">
        <LinkButton href="/comedy" variant="secondary">
          Watch more →
        </LinkButton>
      </div>
    </Section>
  );
}
```

- [ ] **Step 4: Run the test** → PASS (2).

- [ ] **Step 5: Commit**
```bash
git add -A
git commit -m "feat: add Comedy home teaser section

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: /comedy page

**Files:** Create `src/app/comedy/page.tsx`; Test `src/app/comedy/__tests__/page.test.tsx`.

- [ ] **Step 1: Failing test** — `src/app/comedy/__tests__/page.test.tsx`
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ComedyPage from "@/app/comedy/page";
import { clips } from "@/data/comedy";

describe("/comedy page", () => {
  it("renders the heading and a play button per clip", () => {
    render(<ComedyPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Stand-up" }),
    ).toBeInTheDocument();
    for (const c of clips) {
      expect(
        screen.getByRole("button", { name: `Play: ${c.title}` }),
      ).toBeInTheDocument();
    }
  });
});
```

- [ ] **Step 2: Run it** → FAIL (cannot resolve `@/app/comedy/page`).

- [ ] **Step 3: Implement** — `src/app/comedy/page.tsx`
```tsx
import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { YouTubeEmbed } from "@/components/comedy/YouTubeEmbed";
import { PhotoGallery } from "@/components/comedy/PhotoGallery";
import { clips, photos } from "@/data/comedy";

export const metadata: Metadata = {
  title: "Comedy",
  description: "Stand-up clips and photos.",
};

export default function ComedyPage() {
  return (
    <Container className="py-20">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-web">
        Comedy
      </p>
      <h1 className="mt-2 font-display text-4xl font-extrabold sm:text-5xl">
        Stand-up
      </h1>
      <p className="mt-3 max-w-xl text-muted">
        A few sets and clips. Bear with the lighting — open mics aren&rsquo;t
        known for production value.
      </p>

      {clips.length > 0 && (
        <>
          <h2 className="mt-10 text-xs font-medium uppercase tracking-[0.2em] text-web">
            Clips
          </h2>
          <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {clips.map((c) => (
              <YouTubeEmbed
                key={`${c.youtubeId}-${c.title}`}
                youtubeId={c.youtubeId}
                title={c.title}
              />
            ))}
          </div>
        </>
      )}

      {photos.length > 0 && (
        <>
          <h2 className="mt-12 text-xs font-medium uppercase tracking-[0.2em] text-web">
            Photos
          </h2>
          <div className="mt-4">
            <PhotoGallery photos={photos} />
          </div>
        </>
      )}
    </Container>
  );
}
```

- [ ] **Step 4: Run the test** → PASS. (Placeholder clip titles are distinct, so `getByRole` for each `Play: {title}` is unambiguous.)

- [ ] **Step 5: Run all tests + build** → `pnpm test && pnpm run build` → green, EXIT 0; route table lists `/comedy`.

- [ ] **Step 6: Commit**
```bash
git add -A
git commit -m "feat: add /comedy page (clips grid + photo gallery)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Wire into home + nav + image dirs + verify

**Files:** Modify `src/app/page.tsx`, `src/app/__tests__/page.test.tsx`, `src/lib/site.ts`; Create `public/images/about/.gitkeep`, `public/images/comedy/.gitkeep`.

- [ ] **Step 1: Add sections to the home page** — overwrite `src/app/page.tsx`
```tsx
import { Hero } from "@/components/sections/Hero";
import { Experience } from "@/components/sections/Experience";
import { Projects } from "@/components/sections/Projects";
import { About } from "@/components/sections/About";
import { Comedy } from "@/components/sections/Comedy";

export default function Home() {
  return (
    <>
      <Hero />
      <Experience />
      <Projects />
      <About />
      <Comedy />
    </>
  );
}
```

- [ ] **Step 2: Update the home page test** — overwrite `src/app/__tests__/page.test.tsx`
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Home from "@/app/page";
import { about } from "@/data/about";

describe("Home page", () => {
  it("renders all home sections", () => {
    render(<Home />);
    expect(screen.getByText(/Casillas/)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Experience" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Projects" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: about.headline }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Stand-up" }),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Add nav items** — in `src/lib/site.ts`, change the `nav` array to:
```ts
  nav: [
    { label: "Experience", href: "/#experience" },
    { label: "Projects", href: "/#projects" },
    { label: "About", href: "/#about" },
    { label: "Comedy", href: "/#comedy" },
  ] as NavItem[],
```

- [ ] **Step 4: Create the image directories**
```bash
mkdir -p public/images/about public/images/comedy
touch public/images/about/.gitkeep public/images/comedy/.gitkeep
```

- [ ] **Step 5: Run all tests + build** → `pnpm test && pnpm run build` → all green, EXIT 0; route table includes `/` and `/comedy`. (Header nav now also tracks `about` and `comedy` sections.)

- [ ] **Step 6: Commit**
```bash
git add -A
git commit -m "feat: wire About + Comedy into home page and nav

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Done criteria for Plan 3

- `pnpm run build` succeeds; `pnpm test` green.
- Home page now shows About + Turing (after Projects) and a Comedy teaser (one click-to-load clip + "Watch more →"); header nav includes About + Comedy.
- `/comedy` renders a clips grid (each a click-to-load YouTube facade) and the photo gallery (empty until photos are added).
- No third-party scripts load until a clip is clicked; no broken images (gradient/empty fallbacks).

## Manual verification (after implementation)

```bash
pnpm dev
```
At `http://localhost:3000`:
- [ ] About shows bio + fact chips + Turing card (gradient until you add a photo).
- [ ] Comedy teaser shows one clip; clicking the play button loads the YouTube player.
- [ ] Nav "About"/"Comedy" scroll to the sections and highlight; from `/comedy`, nav links return to the home sections.
- [ ] `/comedy` shows the clips grid; clicking plays inline.

## Personalize later (owner)
- `src/data/about.ts` (bio, Turing caption, facts) + `public/images/about/turing.jpg`.
- `src/data/comedy.ts` (real `youtubeId`s + titles; photos) + `public/images/comedy/*`.
