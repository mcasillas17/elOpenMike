# WebSnag Portfolio Project Design

**Date:** 2026-08-24
**Owner:** Miguel Casillas (`mcasillas17`)
**Status:** Approved for implementation from the explicit request and autonomous-session direction

## Purpose

Add `mcasillas17/WebSnag` to the website's Projects surfaces as the newest featured project. Present the app with repository-supported copy, real screenshots, and an evidence-rich engineering case study while preserving the site's existing comic-panel visual system and static project-detail routing.

## Source findings

WebSnag is an MIT-licensed, local-first Android application for intentional distraction blocking. Users create blocklist or allowlist profiles, bind profiles to physical NFC tags, and activate or deactivate focus sessions by tapping those tags. A remote press-and-hold action can also start a session without a tag.

The current Android 8+ app is built with Kotlin, Jetpack Compose, Material 3, Coroutines and Flow, DataStore, NFC ReaderMode, and an Accessibility Service. The enforcement path reacts to foreground-window changes rather than polling: an in-memory engine checks the active profile in constant time, sends blocked apps back to the launcher, and opens a Compose blocker overlay. Emergency unlocking uses a cooldown and intention phrase so users retain a recovery path without making impulsive bypasses frictionless.

The repository includes screenshots and focused unit tests for enforcement activation, blocklist and allowlist behavior, emergency cooldowns, session tracking, NFC activation and deactivation, rejected tags, and unknown tags. Time, location, and Wi-Fi triggers plus stricter uninstall friction remain roadmap items and will not be presented as shipped.

## Approaches considered

1. **Evidence-rich case study with repository screenshots (recommended).** Reuse the current `Project` and `CaseStudy` model, add a focused portrait-media option, and present both the user experience and engineering decisions. The repository has enough implementation and test evidence to support this treatment.
2. **Standard project entry with screenshots.** This would be faster and visually useful, but it would omit the local-first architecture, enforcement tradeoffs, and verification that distinguish the project.
3. **Source-only project entry.** This matches the smallest existing entries, but it would underrepresent a polished mobile app with a documented interface and concrete engineering proof.

## Content and placement

Insert WebSnag first in `src/data/projects.ts`. The array is newest-first, so WebSnag becomes the featured home-page card and first `/projects` entry.

Use:

- Slug: `websnag`
- Title: `WebSnag`
- Year: `2026`
- Tags: `Android`, `Productivity`, `Open source`
- Stack: `Kotlin`, `Jetpack Compose`, `NFC`, `AccessibilityService`, `DataStore`
- Source: `https://github.com/mcasillas17/WebSnag`
- Live URL: none
- Case study: enabled

The summary will describe WebSnag as a local-first Android focus app that turns NFC tags, app-blocking profiles, and deliberate unlock friction into context-aware digital self-control.

The case study will cover:

1. The need to make clear-headed intentions stronger than later impulses without requiring device-owner or MDM control.
2. Compose surfaces for focus sessions, profile editing, NFC enrollment, setup, and blocking feedback.
3. The NFC resolver, profile repository, enforcement engine, Accessibility Service, and blocker overlay data flow.
4. Local-first storage, event-driven interception, constant-time package checks, system-package exemptions, and a deliberate emergency recovery path.
5. Unit-test evidence and an explicit distinction between shipped NFC behavior and roadmap-only contextual triggers.

## Media

Copy four screenshots from the WebSnag repository into `public/images/projects/`:

1. Hold-to-lock dashboard.
2. Allowlist profile overview.
3. NFC enrollment scanner.
4. Allowlist blocker overlay.

Add an optional portrait media layout to the project model and detail page. WebSnag's carousel will use a constrained phone-shaped viewport and `object-contain`; existing landscape project media will keep the current 16:9 `object-cover` behavior.

## Architecture and behavior

No new route or project-specific component is required. Existing helpers will include `websnag` in static parameters, metadata will use the project summary, and the Projects surfaces will derive card position and issue number from array order.

The project detail page will pass the project's optional media presentation to the shared carousel. The default remains unchanged so existing projects preserve their rendering. WebSnag will use the existing `CaseStudy` component for problem, build, constraints, architecture, decisions, proof, status, evidence, and lessons.

There is no runtime data fetching or new failure mode. All content and media remain local build assets. Missing external source pages do not affect rendering; evidence links are ordinary outbound links.

## Testing

Add focused data assertions that WebSnag is first, has the expected source, portrait screenshots, and complete case-study evidence. Extend the project-detail case-study coverage to WebSnag and add a carousel assertion for the opt-in contained image fit.

Run the focused project data, carousel, Projects section, Projects index, and project-detail tests. Then run lint and a production build to verify types, static route generation, media handling, and metadata.

## Scope

This change does not add an APK download, Play Store link, live demo, custom project route, new filtering, or a broader Projects redesign. It does not claim that roadmap triggers are implemented.
