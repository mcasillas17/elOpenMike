# Mexican Mom Portfolio Project Design

**Date:** 2026-08-22
**Owner:** Miguel Casillas (`mcasillas17`)
**Status:** Approved for implementation from the explicit request and existing project-entry conventions

## Purpose

Add `mcasillas17/mexican-mom` to the website's Projects surfaces with concise, repository-supported copy. Preserve the existing comic-panel layout, static project-detail routing, and newest-first ordering.

## Source findings

The repository is an MIT-licensed, cross-platform Agent Skills plugin for Claude Code, GitHub Copilot CLI, and OpenAI Codex. It contains 23 focused engineering-discipline skills plus a manual router. A shared `skills/` tree is packaged through platform-specific manifests, while Node.js tests and GitHub Actions validate frontmatter, routing references, listing-size limits, encoding, packaging, and version agreement.

The repository has no live application or hosted demo. Its public GitHub repository is the appropriate external destination.

## Approaches considered

1. **Add a standard typed project entry (recommended).** Reuse `Project`, the existing list/detail pages, and the source-link button. This matches the treatment of other concise projects and keeps the change factual and small.
2. **Add an evidence-rich case study.** This would expose more release-engineering detail, but it is disproportionate for a quick project and would require significantly more content and UI proof.
3. **Link the listing card directly to GitHub.** This would avoid a detail page, but it would violate the site's consistent internal project-navigation model and bypass generated metadata and Open Graph routes.

## Content and placement

Insert the project first in `src/data/projects.ts` because the Projects index explicitly presents entries newest-first. This makes Mexican Mom the featured card on the home page and `/projects`; all issue numbers continue to derive from array length and index.

Use:

- Slug: `mexican-mom`
- Title: `Mexican Mom`
- Year: `2026`
- Tags: `AI`, `Developer tools`, `Open source`
- Stack: `Agent Skills`, `Markdown`, `Node.js`, `YAML`, `GitHub Actions`
- Source: `https://github.com/mcasillas17/mexican-mom`
- Images: none
- Live URL: none
- Case study: none

The summary will describe it as a cross-platform Agent Skills plugin that gives coding agents a rigorously tested engineering-discipline layer with a distinct Mexican-mom voice.

The detail highlights will cover:

1. The 23 focused discipline skills plus one manual router.
2. Shared installation support for Claude Code, Copilot CLI, and Codex.
3. CI validation for skill contracts, routing, listing budget, packaging, and version consistency.
4. The practical failure modes addressed: unverified success claims, premature absence claims, swallowed failures, unsafe destructive actions, and prompt-injection attempts.

## Behavior and error handling

No component or routing changes are needed. Existing helpers automatically add the slug to static parameters, metadata uses the project summary, the detail page omits absent live/demo controls and media, and the legacy highlights presentation handles projects without a case study.

## Testing

Add a focused data test that proves Mexican Mom is the newest entry and preserves its source-only contract. Run the project data, Projects index, home Projects section, and project-detail tests, then lint and build to verify generated routes and types.

## Scope

No screenshots, live demo, custom card variant, filter, component redesign, or full case study will be added.
