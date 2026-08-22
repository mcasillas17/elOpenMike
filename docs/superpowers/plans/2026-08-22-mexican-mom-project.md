# Mexican Mom Portfolio Project Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Mexican Mom as the newest source-only project across the website's existing Projects surfaces.

**Architecture:** Extend the existing typed `projects` array rather than changing presentation components. The current home grid, Casefile index, static detail route, metadata, Open Graph route, issue numbering, and source button all derive from that array, so one well-tested data entry reaches every required surface.

**Tech Stack:** TypeScript, Next.js 16 App Router, React, Vitest, Testing Library, Playwright, pnpm

**Spec:** `docs/superpowers/specs/2026-08-22-mexican-mom-project-design.md`

---

## File structure

- Modify `src/data/projects.ts`: add the repository-supported Mexican Mom project record at the start of the newest-first array.
- Modify `src/data/__tests__/projects.test.ts`: protect placement, source URL, and the intentional absence of live media.
- No component, route, style, image, or dependency files change; existing project consumers remain the single presentation path.

### Task 1: Add the Mexican Mom project record

**Files:**
- Modify: `src/data/__tests__/projects.test.ts:19-31`
- Modify: `src/data/projects.ts:49-50`

- [x] **Step 1: Write the failing project-data test**

Add this test after the unique-slugs test in `src/data/__tests__/projects.test.ts`:

```ts
it("includes Mexican Mom as the newest source-only project", () => {
  const project = getProject("mexican-mom");

  expect(project).toBeDefined();
  expect(projects[0]).toBe(project);
  expect(project).toMatchObject({
    title: "Mexican Mom",
    year: "2026",
    tags: ["AI", "Developer tools", "Open source"],
    stack: ["Agent Skills", "Markdown", "Node.js", "YAML", "GitHub Actions"],
    repoUrl: "https://github.com/mcasillas17/mexican-mom",
    images: [],
  });
  expect(project?.liveUrl).toBeUndefined();
  expect(project?.caseStudy).toBeUndefined();
});
```

- [x] **Step 2: Run the data test to verify it fails**

Run:

```bash
pnpm exec vitest run src/data/__tests__/projects.test.ts
```

Expected: FAIL because `getProject("mexican-mom")` returns `undefined`.

- [x] **Step 3: Add the minimal typed project entry**

Insert this object at the start of `projects` in `src/data/projects.ts`:

```ts
{
  slug: "mexican-mom",
  title: "Mexican Mom",
  summary:
    "A cross-platform Agent Skills plugin that gives coding agents a rigorously tested engineering-discipline layer with a distinct Mexican-mom voice.",
  year: "2026",
  tags: ["AI", "Developer tools", "Open source"],
  stack: ["Agent Skills", "Markdown", "Node.js", "YAML", "GitHub Actions"],
  highlights: [
    "Twenty-three focused engineering-discipline skills plus a manual router keep each intervention narrow and explicit.",
    "One shared Agent Skills tree installs across Claude Code, GitHub Copilot CLI, and OpenAI Codex.",
    "Node.js validation and GitHub Actions enforce frontmatter, cross-skill routing, listing-size, packaging, and version contracts.",
    "Rules target false success claims, premature “not found” reports, swallowed failures, unsafe destructive actions, and prompt-injection attempts.",
  ],
  repoUrl: "https://github.com/mcasillas17/mexican-mom",
  images: [],
},
```

- [x] **Step 4: Run the focused project-surface tests**

Run:

```bash
pnpm exec vitest run src/data/__tests__/projects.test.ts src/components/sections/__tests__/Projects.test.tsx src/app/projects/__tests__/page.test.tsx 'src/app/projects/[slug]/__tests__/page.test.tsx'
```

Expected: all selected Vitest files pass, proving the entry is valid, appears in listing data, and generates a working detail route.

- [x] **Step 5: Commit the implementation**

```bash
git add src/data/projects.ts src/data/__tests__/projects.test.ts
git commit -m "feat(projects): add Mexican Mom"
```

### Task 2: Verify the complete website integration

**Files:**
- Verify: `src/data/projects.ts`
- Verify: `src/data/__tests__/projects.test.ts`
- Verify: `e2e/projects.spec.ts`

- [x] **Step 1: Run lint**

Run:

```bash
pnpm lint
```

Expected: exits successfully with no lint errors.

- [x] **Step 2: Build all static project routes**

Run:

```bash
pnpm build
```

Expected: exits successfully and includes the project detail route without type, metadata, or prerender failures.

- [x] **Step 3: Exercise project navigation end to end**

Run:

```bash
pnpm e2e e2e/projects.spec.ts
```

Expected: all project-navigation tests pass, including navigation from the first home card, which is now Mexican Mom.

- [x] **Step 4: Inspect the final diff**

Run:

```bash
git diff --check origin/main...HEAD
git status --short
git --no-pager diff --stat origin/main...HEAD
```

Expected: no whitespace errors; only the design spec, implementation plan, project data, and focused data test are changed relative to `main`; the worktree is clean.

- [ ] **Step 5: Push and open the pull request**

Push the current branch and create a pull request titled `Add Mexican Mom to projects`. The body should summarize the newest-first project entry, repository-backed copy, source-only detail treatment, and successful project-focused tests, lint, build, and end-to-end navigation checks.
