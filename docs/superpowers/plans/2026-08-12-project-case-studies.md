# Evidence-rich Project Case Studies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give TuringAgent and Thwiply durable, evidence-backed project-detail case studies while keeping the existing four-project Casefile index unchanged.

**Architecture:** Extend the typed `Project` model with an optional `caseStudy` object, so only the two flagship projects opt into the detailed presentation. A server-rendered `CaseStudy` component turns that structured content into semantic sections, an accessible code-native data-flow diagram, and linked source proof without adding client hydration.

**Tech Stack:** Next.js 16.2.6 App Router, React Server Components, TypeScript, Tailwind CSS, Vitest, Testing Library.

**Spec:** Task request: roadmap item 3, "turn TuringAgent and Thwiply into evidence-rich engineering case studies."

## Global Constraints

- Base all case-study claims on public repository README, source, or linked documentation; state uncertain ownership as "What I built."
- Preserve static generation (`generateStaticParams`), route metadata, keyboard navigation, responsive layout, and the simple four-project index; add no filters or client dependency.
- Use a single `h1` on the detail page; case-study labels are `h2` and architecture/proof captions are nested headings.
- TuringAgent evidence: `mcasillas17/TuringAgent` README, `docs/architecture/tech-stack.md`, and `docs/mcp-security-and-integration.md`.
- Thwiply evidence: `mcasillas17/Thwiply` README, `MainActivity.kt`, `ModelManager.kt`, `LlmEngineManager.kt`, and `ModelManagerTest.kt`.

---

### Task 1: Model contract and evidence content

**Files:**
- Modify: `src/data/projects.ts`
- Modify: `src/data/__tests__/projects.test.ts`

**Interfaces:**
- Produces `CaseStudy` and `CaseStudyEvidence` types and optional `Project.caseStudy` content.
- Consumes literal public-repository URLs and only repository-supported copy.

- [x] **Step 1: Write the failing model test**

```ts
it("gives TuringAgent and Thwiply complete case-study evidence", () => {
  for (const slug of ["turingagent", "thwiply"]) {
    const caseStudy = getProject(slug)?.caseStudy;
    expect(caseStudy?.architecture.nodes.length).toBeGreaterThan(1);
    expect(caseStudy?.evidence.length).toBeGreaterThan(0);
  }
});
```

- [x] **Step 2: Run the data test to verify it fails**

Run: `pnpm test -- src/data/__tests__/projects.test.ts`
Expected: FAIL because `caseStudy` is not defined.

- [x] **Step 3: Add the smallest typed case-study model and two data entries**

Define reusable fields for problem, `whatIBuilt`, constraints, architecture nodes/flows, decisions, proof/evidence, status, and lessons. Populate just TuringAgent and Thwiply with source-linked, present-tense content.

- [x] **Step 4: Run the data test to verify it passes**

Run: `pnpm test -- src/data/__tests__/projects.test.ts`
Expected: PASS.

### Task 2: Server-rendered case-study presentation

**Files:**
- Create: `src/components/projects/CaseStudy.tsx`
- Create: `src/components/projects/__tests__/CaseStudy.test.tsx`
- Modify: `src/app/projects/[slug]/page.tsx`
- Modify: `src/app/projects/[slug]/__tests__/page.test.tsx`

**Interfaces:**
- Consumes `CaseStudy` from `src/data/projects.ts`.
- Produces semantic case-study sections, an SVG-free ordered architecture/data-flow visual, and external proof links.

- [x] **Step 1: Write failing render tests**

```tsx
it("renders an accessible architecture visual and source evidence", () => {
  render(<CaseStudy caseStudy={fixture} />);
  expect(screen.getByRole("figure", { name: /architecture and data flow/i })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /source evidence/i })).toHaveAttribute("href", fixture.evidence[0].href);
});
```

- [x] **Step 2: Run the component and project-detail tests to verify they fail**

Run: `pnpm test -- src/components/projects/__tests__/CaseStudy.test.tsx src/app/projects/[slug]/__tests__/page.test.tsx`
Expected: FAIL because the component/semantic sections do not exist.

- [x] **Step 3: Implement the server component and render it only when a project has `caseStudy`**

Use a `<figure>` with a `<figcaption>` and an ordered list of linked architecture nodes. Keep source links ordinary focusable anchors and retain the detail page’s existing cover, metadata, and navigation.

- [x] **Step 4: Run the focused tests to verify they pass**

Run: `pnpm test -- src/components/projects/__tests__/CaseStudy.test.tsx src/app/projects/[slug]/__tests__/page.test.tsx`
Expected: PASS.

### Task 3: Authoring documentation and verification

**Files:**
- Modify: `docs/authoring.md`
- Modify: `docs/superpowers/plans/2026-08-12-project-case-studies.md`

**Interfaces:**
- Documents the required typed fields and evidence standard for future flagship case studies.

- [x] **Step 1: Document the case-study content contract**

Add a Projects section that specifies each field, the source-link requirement, and the status/ownership wording constraints.

- [x] **Step 2: Run project-focused and whole-repo checks**

Run: `pnpm test -- src/data/__tests__/projects.test.ts src/components/projects/__tests__/CaseStudy.test.tsx src/app/projects/[slug]/__tests__/page.test.tsx`, then `pnpm lint`, `pnpm build`, and `pnpm e2e`.

- [x] **Step 3: Inspect the static project-detail pages at desktop and mobile widths**

Use Playwright against `/projects/turingagent` and `/projects/thwiply`; confirm each has one `h1`, visible proof/evidence, keyboard-reachable links, and no horizontal overflow.

- [x] **Step 4: Commit the scoped implementation**

Run: `git add src/data/projects.ts src/data/__tests__/projects.test.ts src/components/projects/CaseStudy.tsx src/components/projects/__tests__/CaseStudy.test.tsx src/app/projects/[slug]/page.tsx src/app/projects/[slug]/__tests__/page.test.tsx docs/authoring.md docs/superpowers/plans/2026-08-12-project-case-studies.md && git commit -m "feat(projects): add evidence-rich case studies"`
