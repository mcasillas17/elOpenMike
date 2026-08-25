# WebSnag Project Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add WebSnag as the website's newest featured project with repository-backed copy, a full engineering case study, and a portrait screenshot carousel.

**Architecture:** Extend the existing static `Project` data model with one optional portrait-media flag and pass that flag through the existing project detail page to the shared carousel. Keep all project content in `src/data/projects.ts`, all screenshots in `public/images/projects/`, and reuse the existing project listing, metadata, static-route, and case-study components.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, `next/image`, Vitest, Testing Library, Playwright

---

## File map

- `src/components/ui/Carousel.tsx`: add an opt-in contained image fit while preserving the current cover default.
- `src/components/ui/__tests__/Carousel.test.tsx`: prove default and contained image-fit behavior.
- `src/data/projects.ts`: add the portrait-media field and the complete WebSnag project record.
- `src/data/__tests__/projects.test.ts`: prove WebSnag ordering, metadata, media, and case-study completeness.
- `src/app/projects/[slug]/page.tsx`: render portrait projects in a constrained phone-shaped carousel.
- `src/app/projects/[slug]/__tests__/page.test.tsx`: prove WebSnag uses the case-study and portrait-media paths.
- `public/images/projects/websnag-*.png`: local copies of four WebSnag repository screenshots.

Execute the tasks in this dependency order: Task 1, Task 3, Task 4, Task 2, Task 5. Task 2's page-level red test needs the WebSnag record and screenshots from Tasks 3 and 4.

### Task 1: Add contained-image support to the carousel

**Files:**
- Modify: `src/components/ui/__tests__/Carousel.test.tsx`
- Modify: `src/components/ui/Carousel.tsx`

- [ ] **Step 1: Write the failing image-fit test**

Add this test inside the existing `describe("Carousel", ...)` block:

```tsx
it("keeps cover as the default and supports contained screenshots", () => {
  const { rerender } = render(
    <Carousel images={["/a.jpg"]} altPrefix="App screen" />,
  );
  expect(screen.getByRole("img", { name: /app screen/i })).toHaveClass(
    "object-cover",
  );

  rerender(
    <Carousel
      images={["/a.jpg"]}
      altPrefix="App screen"
      imageFit="contain"
    />,
  );
  expect(screen.getByRole("img", { name: /app screen/i })).toHaveClass(
    "object-contain",
  );
});
```

- [ ] **Step 2: Run the test and confirm the new API is missing**

Run:

```bash
pnpm exec vitest run src/components/ui/__tests__/Carousel.test.tsx
```

Expected: FAIL because `Carousel` does not accept `imageFit` and still always renders `object-cover`.

- [ ] **Step 3: Implement the minimal carousel API**

Update the component signature and image class:

```tsx
export function Carousel({
  images,
  altPrefix = "Photo",
  className = "",
  aspectClassName = "aspect-[4/3]",
  imageFit = "cover",
}: {
  images: string[];
  altPrefix?: string;
  className?: string;
  aspectClassName?: string;
  imageFit?: "cover" | "contain";
}) {
```

Replace the image's fixed class with:

```tsx
className={
  imageFit === "contain"
    ? "bg-[#0e1320] object-contain"
    : "object-cover"
}
```

- [ ] **Step 4: Run the carousel tests**

Run:

```bash
pnpm exec vitest run src/components/ui/__tests__/Carousel.test.tsx
```

Expected: PASS with 5 tests.

- [ ] **Step 5: Commit the carousel behavior**

```bash
git add src/components/ui/Carousel.tsx src/components/ui/__tests__/Carousel.test.tsx
git commit -m "feat: support contained project screenshots" -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

### Task 2: Add portrait project media wiring

**Execution dependency:** Complete Tasks 3 and 4 first.

**Files:**
- Modify: `src/app/projects/[slug]/__tests__/page.test.tsx`
- Modify: `src/app/projects/[slug]/page.tsx:142-150`

- [ ] **Step 1: Write the failing portrait-layout page test**

Add a WebSnag-specific test after the case-study test:

```tsx
it("renders WebSnag screenshots in a contained portrait carousel", async () => {
  const ui = await ProjectDetailPage({
    params: Promise.resolve({ slug: "websnag" }),
  });
  render(ui);

  const carousel = screen.getByRole("group", {
    name: "WebSnag screenshot photos",
  });
  expect(carousel.parentElement).toHaveClass("max-w-sm");
  expect(carousel.firstElementChild).toHaveClass("aspect-[9/16]");
  expect(
    screen.getAllByRole("img", { name: /websnag screenshot/i })[0],
  ).toHaveClass("object-contain");
});
```

- [ ] **Step 2: Run the page test and confirm WebSnag is absent**

Run:

```bash
pnpm exec vitest run 'src/app/projects/[slug]/__tests__/page.test.tsx'
```

Expected: FAIL because WebSnag still uses the default unconstrained 16:9 cover carousel.

- [ ] **Step 3: Wire portrait media into the detail page**

After the `tint` assignment, add:

```tsx
const usesPortraitMedia = project.mediaLayout === "portrait";
```

Replace the image-carousel block with:

```tsx
{!project.youtubeId && project.images.length > 0 && (
  <div
    className={`mt-8 overflow-hidden border-[3px] border-panel-border ${
      usesPortraitMedia ? "mx-auto max-w-sm" : ""
    }`}
    style={{ boxShadow: "var(--shadow-panel-lg)" }}
  >
    <Carousel
      images={project.images}
      altPrefix={`${project.title} screenshot`}
      aspectClassName={
        usesPortraitMedia ? "aspect-[9/16]" : "aspect-video"
      }
      imageFit={usesPortraitMedia ? "contain" : "cover"}
    />
  </div>
)}
```

- [ ] **Step 4: Run the project-detail tests**

Run:

```bash
pnpm exec vitest run 'src/app/projects/[slug]/__tests__/page.test.tsx'
```

Expected: PASS with 9 tests.

- [ ] **Step 5: Commit the portrait-media wiring**

```bash
git add 'src/app/projects/[slug]/page.tsx' 'src/app/projects/[slug]/__tests__/page.test.tsx'
git commit -m "feat: support portrait project media" -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```

### Task 3: Add WebSnag screenshot assets

**Files:**
- Create: `public/images/projects/websnag-dashboard.png`
- Create: `public/images/projects/websnag-schedules.png`
- Create: `public/images/projects/websnag-activity.png`
- Create: `public/images/projects/websnag-nfc-enrollment.png`

- [ ] **Step 1: Download the repository-owned screenshots from the pinned snapshot**

Run:

```bash
curl --fail --location   https://raw.githubusercontent.com/mcasillas17/WebSnag/db40858329c6a236550009d5aa0ba52a6d1056e1/docs/screenshots/01_dashboard_wordmark_idle.png   --output public/images/projects/websnag-dashboard.png
curl --fail --location   https://raw.githubusercontent.com/mcasillas17/WebSnag/db40858329c6a236550009d5aa0ba52a6d1056e1/docs/screenshots/02_schedules_overview.png   --output public/images/projects/websnag-schedules.png
curl --fail --location   https://raw.githubusercontent.com/mcasillas17/WebSnag/db40858329c6a236550009d5aa0ba52a6d1056e1/docs/screenshots/03_activity_overview.png   --output public/images/projects/websnag-activity.png
curl --fail --location   https://raw.githubusercontent.com/mcasillas17/WebSnag/db40858329c6a236550009d5aa0ba52a6d1056e1/docs/screenshots/05_enroll_tag_screen.png   --output public/images/projects/websnag-nfc-enrollment.png
```

Expected: all four commands exit successfully.

- [ ] **Step 2: Verify the assets are valid portrait PNGs**

Run:

```bash
file   public/images/projects/websnag-dashboard.png   public/images/projects/websnag-schedules.png   public/images/projects/websnag-activity.png   public/images/projects/websnag-nfc-enrollment.png
sips -g pixelWidth -g pixelHeight   public/images/projects/websnag-dashboard.png   public/images/projects/websnag-schedules.png   public/images/projects/websnag-activity.png   public/images/projects/websnag-nfc-enrollment.png
```

Expected: every file reports PNG data and a height greater than its width.

- [ ] **Step 3: Commit the screenshots**

```bash
git add   public/images/projects/websnag-dashboard.png   public/images/projects/websnag-schedules.png   public/images/projects/websnag-activity.png   public/images/projects/websnag-nfc-enrollment.png
git commit -m "assets: add WebSnag project screenshots" -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```


### Task 4: Add the WebSnag project and case study

**Files:**
- Modify: `src/data/__tests__/projects.test.ts`
- Modify: `src/data/projects.ts:29-42`
- Modify: `src/data/projects.ts:50-185`
- Modify: `src/app/projects/[slug]/__tests__/page.test.tsx`

- [ ] **Step 1: Replace the stale newest-project assertion with a failing WebSnag contract**

Replace the Mexican Mom newest-project test with:

```ts
it("includes WebSnag as the newest portrait case study", () => {
  const project = getProject("websnag");

  expect(project).toBeDefined();
  expect(projects[0]).toBe(project);
  expect(project).toMatchObject({
    title: "WebSnag",
    summary:
      "A local-first Android focus app that combines NFC locks, recurring schedules, allowlist profiles, and deliberate unlock friction to make distractions harder to reach.",
    year: "2026",
    tags: ["Android", "Productivity", "Open source"],
    stack: [
      "Kotlin",
      "Jetpack Compose",
      "NFC",
      "AccessibilityService",
      "DataStore",
    ],
    highlights: [
      "Physical NFC tags and a tactile hold-to-lock action activate focused profiles without cloud accounts or dedicated hardware.",
      "Recurring schedules automate blocklist or allowlist profiles for workdays, bedtime, and other routines.",
      "An event-driven Accessibility Service intercepts blocked foreground apps and presents a calm Compose overlay.",
      "Local activity history tracks focused time and blocked attempts, while emergency unlocks preserve a deliberate recovery path.",
    ],
    repoUrl: "https://github.com/mcasillas17/WebSnag",
    mediaLayout: "portrait",
    images: [
      "/images/projects/websnag-dashboard.png",
      "/images/projects/websnag-schedules.png",
      "/images/projects/websnag-activity.png",
      "/images/projects/websnag-nfc-enrollment.png",
    ],
    caseStudy: {
      whatIBuilt: [
        "A Jetpack Compose app for focus sessions, recurring schedules, blocklist and allowlist profiles, activity history, NFC enrollment, setup, and blocking feedback.",
        "A local persistence and domain layer for profiles, schedules, NFC tags, focus-session history, unlock conditions, and reactive enforcement state.",
        "An event-driven enforcement path that checks foreground packages, returns blocked launches to the home screen, and opens a focused blocker overlay.",
      ],
      constraints: [
        "The app targets standard consumer Android 8+ rather than Device Owner or MDM APIs, so it creates deliberate friction instead of claiming an irreversible lock.",
        "Foreground interception requires the user to enable WebSnag's Accessibility Service during setup.",
        "NFC remains optional for activation because the dashboard hold action and recurring schedules can start profiles; enrolled tags provide the stronger physical unlock boundary.",
      ],
      architecture: {
        flowLabel:
          "Compose screens persist profiles and enrolled tags locally. A scanned tag resolves to a profile transition, the enforcement engine caches the active rule set, and the Accessibility Service sends blocked launches to the overlay.",
        nodes: [
          {
            title: "Compose UI & repositories",
            detail:
              "Dashboard, profile, tag, setup, and overlay surfaces read and update locally persisted domain state through Flow-backed repositories.",
          },
          {
            title: "NFC & schedule coordinators",
            detail:
              "Tag taps resolve activation and release actions, while recurring schedules evaluate time windows and coordinate automatic profile transitions.",
          },
          {
            title: "Enforcement engine",
            detail:
              "The engine observes the active profile and maintains a constant-time package cache, filter mode, timer state, exemptions, and interception count.",
          },
          {
            title: "Accessibility service & overlay",
            detail:
              "Window-state events are checked without polling; blocked launches return home and open the Compose overlay with current focus context.",
          },
        ],
      },
      verification: [
        {
          title: "Enforcement state tests",
          detail:
            "Unit tests cover activation, deactivation, blocklist checks, allowlist checks, system exemptions, blocked-attempt recording, session timing, and emergency cooldown completion.",
        },
        {
          title: "NFC and schedule tests",
          detail:
            "Tests cover tag-based activation and release plus schedule formatting, same-day and overnight windows, Wi-Fi conditions, disabled routines, and overlap detection.",
        },
        {
          title: "Buildable Android surface",
          detail:
            "The repository defines JDK 17, Android API 26 minimum support, Gradle test and debug APK commands, and separate local and instrumented test dependencies.",
        },
      ],
      status:
        "Public repository snapshot reviewed at commit db40858 implements NFC and scheduled profile activation, blocklist and allowlist enforcement, remote hold-to-lock activation, session history, theme controls, setup, blocker feedback, and emergency unlock friction.",
      evidence: [
        {
          href: "https://github.com/mcasillas17/WebSnag/blob/db40858329c6a236550009d5aa0ba52a6d1056e1/README.md",
        },
        {
          href: "https://github.com/mcasillas17/WebSnag/tree/db40858329c6a236550009d5aa0ba52a6d1056e1/app/src/test/java/org/websnag",
        },
      ],
    },
  });
  expect(project?.liveUrl).toBeUndefined();
  expect(project?.caseStudy).toBeDefined();
  expect(project?.caseStudy?.evidence).toHaveLength(4);
});

it("keeps Mexican Mom as a source-only project", () => {
  const project = getProject("mexican-mom");

  expect(project).toBeDefined();
  expect(project?.repoUrl).toBe(
    "https://github.com/mcasillas17/mexican-mom",
  );
  expect(project?.images).toEqual([]);
  expect(project?.liveUrl).toBeUndefined();
  expect(project?.caseStudy).toBeUndefined();
});
```

Update the complete case-study loop to:

```ts
for (const slug of ["websnag", "turingagent", "thwiply"]) {
```

Update the page-level case-study table to:

```tsx
it.each(["websnag", "turingagent", "thwiply"])(
```

- [ ] **Step 2: Run the data and page tests and confirm the missing entry**

Run:

```bash
pnpm exec vitest run src/data/__tests__/projects.test.ts 'src/app/projects/[slug]/__tests__/page.test.tsx'
```

Expected: FAIL because WebSnag has not been added.

- [ ] **Step 3: Add the typed media field and exact WebSnag project record**

Add this field to `Project`:

```ts
mediaLayout?: "portrait"; // defaults to the existing landscape carousel
```

Insert the exact WebSnag object at the start of `projects`, matching the current production record in `src/data/projects.ts`:

```ts
{
  slug: "websnag",
  title: "WebSnag",
  summary:
    "A local-first Android focus app that combines NFC locks, recurring schedules, allowlist profiles, and deliberate unlock friction to make distractions harder to reach.",
  year: "2026",
  tags: ["Android", "Productivity", "Open source"],
  stack: [
    "Kotlin",
    "Jetpack Compose",
    "NFC",
    "AccessibilityService",
    "DataStore",
  ],
  highlights: [
    "Physical NFC tags and a tactile hold-to-lock action activate focused profiles without cloud accounts or dedicated hardware.",
    "Recurring schedules automate blocklist or allowlist profiles for workdays, bedtime, and other routines.",
    "An event-driven Accessibility Service intercepts blocked foreground apps and presents a calm Compose overlay.",
    "Local activity history tracks focused time and blocked attempts, while emergency unlocks preserve a deliberate recovery path.",
  ],
  repoUrl: "https://github.com/mcasillas17/WebSnag",
  images: [
    "/images/projects/websnag-dashboard.png",
    "/images/projects/websnag-schedules.png",
    "/images/projects/websnag-activity.png",
    "/images/projects/websnag-nfc-enrollment.png",
  ],
  mediaLayout: "portrait",
  caseStudy: {
    problem:
      "Make clear-headed decisions about distracting apps enforceable later on an ordinary Android phone, without requiring a cloud account, telemetry, dedicated hardware, or device-owner privileges.",
    whatIBuilt: [
      "A Jetpack Compose app for focus sessions, recurring schedules, blocklist and allowlist profiles, activity history, NFC enrollment, setup, and blocking feedback.",
      "A local persistence and domain layer for profiles, schedules, NFC tags, focus-session history, unlock conditions, and reactive enforcement state.",
      "An event-driven enforcement path that checks foreground packages, returns blocked launches to the home screen, and opens a focused blocker overlay.",
    ],
    constraints: [
      "The app targets standard consumer Android 8+ rather than Device Owner or MDM APIs, so it creates deliberate friction instead of claiming an irreversible lock.",
      "Foreground interception requires the user to enable WebSnag's Accessibility Service during setup.",
      "NFC remains optional for activation because the dashboard hold action and recurring schedules can start profiles; enrolled tags provide the stronger physical unlock boundary.",
    ],
    architecture: {
      flowLabel:
        "Compose screens persist profiles and enrolled tags locally. A scanned tag resolves to a profile transition, the enforcement engine caches the active rule set, and the Accessibility Service sends blocked launches to the overlay.",
      nodes: [
        {
          title: "Compose UI & repositories",
          detail:
            "Dashboard, profile, tag, setup, and overlay surfaces read and update locally persisted domain state through Flow-backed repositories.",
        },
        {
          title: "NFC & schedule coordinators",
          detail:
            "Tag taps resolve activation and release actions, while recurring schedules evaluate time windows and coordinate automatic profile transitions.",
        },
        {
          title: "Enforcement engine",
          detail:
            "The engine observes the active profile and maintains a constant-time package cache, filter mode, timer state, exemptions, and interception count.",
        },
        {
          title: "Accessibility service & overlay",
          detail:
            "Window-state events are checked without polling; blocked launches return home and open the Compose overlay with current focus context.",
        },
      ],
    },
    decisions: [
      {
        title: "Keep focus data local",
        detail:
          "Profiles, tags, activity, and enforcement state stay on-device, with no backend, account, telemetry, or network dependency in the enforcement loop.",
      },
      {
        title: "React to windows instead of polling",
        detail:
          "The Accessibility Service listens for foreground window changes and delegates package decisions to an in-memory cache, reducing latency and battery work.",
      },
      {
        title: "Design a safe but inconvenient escape hatch",
        detail:
          "The app pairs tag-based unlocking with a timed emergency path and intention phrase so users cannot be permanently stranded but must pause before bypassing a session.",
      },
    ],
    verification: [
      {
        title: "Enforcement state tests",
        detail:
          "Unit tests cover activation, deactivation, blocklist checks, allowlist checks, system exemptions, blocked-attempt recording, session timing, and emergency cooldown completion.",
      },
      {
        title: "NFC and schedule tests",
        detail:
          "Tests cover tag-based activation and release plus schedule formatting, same-day and overnight windows, Wi-Fi conditions, disabled routines, and overlap detection.",
      },
      {
        title: "Buildable Android surface",
        detail:
          "The repository defines JDK 17, Android API 26 minimum support, Gradle test and debug APK commands, and separate local and instrumented test dependencies.",
      },
    ],
    status:
      "Public repository snapshot reviewed at commit db40858 implements NFC and scheduled profile activation, blocklist and allowlist enforcement, remote hold-to-lock activation, session history, theme controls, setup, blocker feedback, and emergency unlock friction.",
    lessons: [
      "A physical trigger can turn an abstract intention into an environmental boundary while still letting the app work without proprietary hardware.",
      "Consumer self-control software needs both fast enforcement and an explicit recovery path; friction is safer and more credible than pretending bypass is impossible.",
    ],
    evidence: [
      {
        href: "https://github.com/mcasillas17/WebSnag/blob/db40858329c6a236550009d5aa0ba52a6d1056e1/README.md",
      },
      {
        href: "https://github.com/mcasillas17/WebSnag/tree/db40858329c6a236550009d5aa0ba52a6d1056e1/app/src/test/java/org/websnag",
      },
    ],
  },
},
```

Expand `evidence` to the exact four-item array from Appendix A, then copy the matching labels and `detail` strings from the same production object so the final array stays byte-for-byte aligned with `src/data/projects.ts`.

- [ ] **Step 4: Run the focused project tests**

Run:

```bash
pnpm exec vitest run src/data/__tests__/projects.test.ts src/components/ui/__tests__/Carousel.test.tsx src/components/sections/__tests__/Projects.test.tsx src/app/projects/__tests__/page.test.tsx 'src/app/projects/[slug]/__tests__/page.test.tsx'
```

Expected: PASS with WebSnag first on listing surfaces, a generated detail route, portrait screenshots, and the complete case-study sections.

- [ ] **Step 5: Commit the project content**

```bash
git add src/data/projects.ts src/data/__tests__/projects.test.ts 'src/app/projects/[slug]/__tests__/page.test.tsx'
git commit -m "feat: add WebSnag project case study" -m "Co-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com>"
```


### Task 5: Verify the complete project addition

**Files:**
- Verify only

- [ ] **Step 1: Run all project-facing tests**

Run:

```bash
pnpm exec vitest run src/data/__tests__/projects.test.ts src/components/projects/__tests__/ProjectCard.test.tsx src/components/projects/__tests__/CaseStudy.test.tsx src/components/ui/__tests__/Carousel.test.tsx src/components/sections/__tests__/Projects.test.tsx src/app/projects/__tests__/page.test.tsx 'src/app/projects/[slug]/__tests__/page.test.tsx' src/app/__tests__/sitemap.test.ts src/app/__tests__/sitemap-revised.test.ts
```

Expected: all selected tests pass.

- [ ] **Step 2: Run lint**

Run:

```bash
pnpm lint
```

Expected: exit code 0 with no ESLint errors.

- [ ] **Step 3: Run the production build**

Run:

```bash
pnpm build
```

Expected: the build succeeds and includes `/projects/websnag` among the generated project routes.

- [ ] **Step 4: Run the Projects browser flow**

Run:

```bash
pnpm exec playwright test e2e/projects.spec.ts
```

Expected: the home Projects card, Projects index, and project-detail navigation tests pass.

- [ ] **Step 5: Confirm the final diff is scoped**

Run:

```bash
git status --short
git --no-pager diff main...HEAD --stat
git --no-pager log --oneline main..HEAD
```

Expected: only the design/plan docs, WebSnag screenshots, project data/tests, carousel/tests, and project-detail page/tests appear.


## Appendix A: Immutable WebSnag evidence hrefs

Use these exact `href` values when completing Task 4's `evidence` array:

```ts
[
  "https://github.com/mcasillas17/WebSnag/blob/db40858329c6a236550009d5aa0ba52a6d1056e1/README.md",
  "https://github.com/mcasillas17/WebSnag/blob/db40858329c6a236550009d5aa0ba52a6d1056e1/app/src/main/java/org/websnag/core/enforcement/EnforcementEngine.kt",
  "https://github.com/mcasillas17/WebSnag/blob/db40858329c6a236550009d5aa0ba52a6d1056e1/app/src/main/java/org/websnag/core/schedule/ScheduleManager.kt",
  "https://github.com/mcasillas17/WebSnag/tree/db40858329c6a236550009d5aa0ba52a6d1056e1/app/src/test/java/org/websnag",
]
```
