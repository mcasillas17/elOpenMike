# Blog Reader UX Design

**Date:** 2026-08-12
**Status:** Approved through the 2026-08-12 reader audit and the owner's instruction to implement all recommendations

## Goal

Turn the existing technically sound blog into a more comfortable, discoverable, and accessible reading experience without adding archive-scale features before the archive needs them.

## Scope

This change delivers the concrete recommendations from the audit:

- a narrower, larger-type article measure with a visible excerpt and revision date;
- minimum 44px touch areas for reader-facing controls;
- discoverable section permalinks on touch devices without polluting heading names;
- code blocks with a language label, copy action, and horizontal-overflow affordance;
- one unambiguous Writing destination in the site navigation;
- correct homepage heading hierarchy;
- explicit Newer/Older post navigation, tag-related reading suggestions, and an author/RSS/email footer;
- an all-topics row and a visually featured latest post on the blog index;
- responsive styling for images, tables, task lists, blockquotes, and other Notion-authored rich content;
- the intentional pre-hydration JavaScript class documented to React, plus Next.js 16's smooth-scroll opt-in attribute.

The existing RSS feed, tag routes, static generation, sitemap, metadata, and Notion pipeline remain the source of truth.

## Deliberate non-goals

- Search and pagination remain deferred until the archive is large enough to need them.
- Reading progress and tables of contents remain deferred and should only appear for genuinely long posts.
- No newsletter backend, analytics funnel, comments system, or new persistence is added.
- The prose surface stays restrained; project-page comic styling does not move into the article body.

## Information architecture

The top-level navigation exposes one **Writing** item linked to `/blog`. The homepage keeps its Latest posts section as a preview, but it is not a second top-level destination.

The blog index opens with an all-topics navigation. The newest post receives a featured treatment; the remainder use the compact archive card. Topic pages reuse the same topic navigation and archive cards.

## Reader flow

An article header presents publication date, optional revision date, reading time, title, excerpt, and topic links. The body uses a 68-character measure and 18px text at desktop sizes. At the end, tag-related posts appear when available, followed by explicit chronological Newer/Older navigation and a compact author/subscribe card.

## Component boundaries

- `PostCard` owns compact archive presentation and accepts the required heading level.
- `FeaturedPost` owns the blog index's latest-post treatment.
- `BlogTopicNav` owns all/tag navigation and counts.
- `CodeBlock` owns client-side copy state; the MDX mapping remains server-rendered.
- `PostFooter` owns related reading and the author/RSS/email call to action.
- `src/lib/blog.ts` owns deterministic related-post selection.

## Accessibility and responsive behavior

Interactive chips and compact controls use a 44px minimum hit area while retaining compact visual pills. Section permalinks are separate siblings of headings so assistive technology reads only the heading text; they become visible on hover, focus, and coarse-pointer devices. Tables scroll within their own wrapper, code blocks announce copy-state changes, and the homepage uses `h3` for post titles beneath its `h2` section title.

## Validation

Unit/component tests cover heading levels, topic navigation, related-post ranking, metadata, code copying, rich-content wrappers, and end-of-post content. Playwright covers the complete reader journey, mobile touch target sizes, touch-visible permalinks, code copying, and topic navigation. Final verification runs unit tests, lint, TypeScript, production build, and E2E.
