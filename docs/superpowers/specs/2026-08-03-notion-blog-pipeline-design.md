# elOpenMike — Notion-Backed Blog Pipeline Design

**Date:** 2026-08-03
**Owner:** Miguel Casillas (`mcasillas17`)
**Repo:** `github.com/mcasillas17/elOpenMike` (public)
**Status:** Approved design — ready for implementation planning

**Context:** The blog shipped in Plan 4 (`docs/superpowers/specs/2026-05-24-elopenmike-blog-design.md`) requires hand-authoring `.mdx` files and a `git push` to publish. This plan removes git from the authoring loop entirely: posts are written in Notion (phone or desktop) and published automatically. It also closes the blog gaps found in the 2026-08-03 site audit.

**Conventions:** pnpm. Next.js 16 App Router, TypeScript, Tailwind v4 (`images.unoptimized` set). Reuse the design system: `Section`, `Container`, `Button`/`LinkButton`, `Tag`, Midnight Web tokens (`bg-canvas`, `bg-surface`, `border-edge`, `text-spidey`, `text-web`, `text-muted`, `text-ink`), `font-display`/`font-body`. Commits: Conventional Commits + the `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` trailer.

---

## 1. Goals & non-goals

**Goals**

1. Publish a post from a phone or laptop without opening a terminal or touching git.
2. Keep the site fully static with zero new runtime infrastructure and zero recurring cost.
3. Keep a durable, versioned, plain-text copy of every post in the repo.
4. Make broken content structurally incapable of reaching production.
5. Close the blog gaps from the site audit: no feed, no tag pages, no heading anchors, no homepage surface, no prev/next.

**Non-goals**

- Instant (sub-minute) publishing. Accepted latency is ~5–15 minutes. See §12.
- A database, object storage, or a runtime webhook receiver. Explicitly rejected in §12.
- Comments, newsletter, search, or view analytics.
- Rendering Notion features with no blog equivalent (synced blocks, databases-in-page, buttons).

---

## 2. Architecture

```
Notion (source of truth)
   │  Status = Published
   ▼
GitHub Action  (cron */10 + workflow_dispatch)
   │  scripts/sync-notion.ts
   │    1. resolve data_source_id
   │    2. query published pages
   │    3. fetch blocks (recursive, paginated)
   │    4. convert blocks → markdown
   │    5. download images (signed URLs expire in 1h)
   │    6. validate — fail closed
   │    7. diff against working tree; write only what changed
   ▼
content/blog/<slug>.mdx  +  public/images/blog/<slug>/<hash>.<ext>
   │  commit + push (CONTENT_SYNC_TOKEN)
   ▼
.github/workflows/deploy.yml  (existing: test → build → e2e → flyctl deploy)
   ▼
elopenmike.com
```

The rendering half of the site is **unchanged**. `src/lib/blog.ts`, `src/app/blog/page.tsx`, and `src/app/blog/[slug]/page.tsx` keep reading MDX off the filesystem exactly as they do today. Notion is a build-time input, not a runtime dependency; if Notion is down, the site is unaffected.

---

## 3. Notion database schema

One Notion database. The integration is shared with it via **Connections → Add connection**.

| Property | Type | Required | Purpose |
|---|---|---|---|
| `Title` | Title | yes | Post title. Also the `<h1>`. |
| `Slug` | Rich text | no | URL slug. Derived from `Title` when blank (§5.4). |
| `Excerpt` | Rich text | yes | Card summary + `<meta name="description">`. |
| `Tags` | Multi-select | no | Post tags. Drives tag pages (§9.3). |
| `Status` | Status | yes | `Draft` / `Published`. The publish switch. |
| `Published` | Date | yes | Publish date. Controls ordering. |

`Updated` is read from the page's `last_edited_time`; no property is needed.

Only pages with `Status = Published` are ever fetched. Drafts never leave Notion — important because this repo is public.

### 3.1 Workspace isolation

The Notion workspace is expected to hold plenty that is not the blog — personal notes, project tracking, setlists. Three independent gates decide what reaches the site, and the first is enforced by Notion rather than by this codebase.

**Gate 1 — the integration connection.** A Notion integration begins with access to nothing. Access is granted per-page through **Connections → Add connection**. With only the Blog database connected, the token cannot read anything else in the workspace; the API returns 404 for unshared pages. Unrelated content is not filtered out by the sync — it is invisible to it. A bug in the sync cannot leak it.

**Gate 2 — the database ID.** The sync queries exactly one `NOTION_DATABASE_ID`. Connecting the integration to something else later does not pull it in.

**Gate 3 — `Status = Published`.** Within the blog database, only published rows are fetched.

```
Notion workspace
├── Blog              ← connected to the integration
├── Personal notes    ← never connected → invisible to the token
├── Project tracker   ← never connected → invisible to the token
└── Setlists          ← never connected → invisible to the token
```

**Properties vs. body.** The distinction matters for anything private kept alongside a post:

- **Extra properties are ignored.** Only the seven properties in §3 are read. A `Notes to self` or `Edit status` column on the blog database is never fetched and never published.
- **Body content is published in full.** Private asides do not belong in the post body.
- **Sub-pages are not followed.** `child_page` blocks fall under the "skipped, logged" rule in §5.1, so a page nested under a post is a safe place for outlines, research, or drafted sections. It stays in Notion.

**Extending to other content later.** `src/data/projects.ts` and `src/data/comedy.ts` are currently hardcoded and could become additional Notion-backed data sources reusing the same converter, each opt-in via its own connection and database ID. Out of scope here (§18) — the blog pipeline should prove itself first — but the architecture does not need to change to support it.

---

## 4. Notion API specifics

- **API version `2026-03-11`** (`Notion-Version` header), the current version. `archived` was renamed `in_trash` in this version.
- **SDK:** `@notionhq/client` v5.x. The repo's `minimumReleaseAge: 7 days` cooldown applies, so `pnpm add` will select a release at least a week old — expected to work without intervention.
- **Databases split from data sources** in API version `2025-09-03`. The flow is:
  1. `GET /v1/databases/:database_id` → returns a `data_sources[]` array.
  2. Take `data_sources[0].id` as the `data_source_id`.
  3. `POST /v1/data_sources/:data_source_id/query` with a `Status = Published` filter, paginating on `next_cursor`.
- **Blocks:** `GET /v1/blocks/:block_id/children?page_size=100`, paginating on `next_cursor`, recursing wherever `has_children` is true.
- **Rate limit:** ~3 req/s per integration. A full sync of ~20 posts is roughly 40–60 requests. The client wraps calls with a small concurrency limit (3) and retries `429` honoring `Retry-After`.

---

## 5. The converter — `src/lib/notion/`

The core of this project. Pure functions over Notion JSON; no network calls, no filesystem access. This is what makes it testable.

```
src/lib/notion/
  client.ts          # SDK wrapper: data_source resolution, pagination, retry
  fetch-post.ts      # page + recursive block tree → PostSource (does I/O)
  blocks-to-md.ts    # PostSource → markdown body (PURE)
  rich-text.ts       # Notion rich_text[] → markdown inline (PURE)
  slug.ts            # title → slug, tag → slug (PURE)
  validate.ts        # PostSource[] → Error[] (PURE)
  serialize.ts       # meta + body → .mdx file contents (PURE)
  types.ts
```

### 5.1 Block mapping

| Notion block | Markdown output |
|---|---|
| `paragraph` | text, blank line after |
| `heading_1` | `##` |
| `heading_2` | `###` |
| `heading_3` | `####` |
| `bulleted_list_item` | `- `, two-space indent per nesting level |
| `numbered_list_item` | `1. `, two-space indent per nesting level |
| `to_do` | `- [ ]` / `- [x]` (remark-gfm) |
| `code` | fenced block, `language` mapped to a Shiki-known id |
| `quote` | `> ` |
| `callout` | `> ` with the emoji prefixed |
| `divider` | `---` |
| `image` | `![alt](/images/blog/<slug>/<hash>.<ext>)` (§6) |
| `table` / `table_row` | GFM table (first row as header when `has_column_header`) |
| `bookmark` / `link_preview` | `[url](url)` |
| `toggle` | children flattened; the toggle summary becomes a paragraph |
| everything else | skipped, logged as a warning (not an error) |

The heading scale is shifted down one level because the post title already occupies the page's `<h1>`. Mapping Notion's H1 and H2 both to `##` (the obvious approach) would render two levels the author deliberately distinguished as visually identical. Shifting instead preserves all three: Notion H1/H2/H3 become `h2`/`h3`/`h4` on the page, which requires an `h4` style in `mdx-components.tsx` (§9.6).

`code` block languages are mapped through a lookup to Shiki-known identifiers (Notion's `plain text` → `text`, `c++` → `cpp`, etc.), with an unknown language falling back to `text`. This keeps the existing `rehype-pretty-code` + Shiki pipeline working with no changes to `[slug]/page.tsx`.

### 5.2 Rich text

Annotations compose innermost-out: `code` → `strikethrough` → `italic` → `bold` → `link`.

```
{ text: "useState", annotations: { code: true, bold: true }, href: "https://…" }
→ [**`useState`**](https://…)
```

### 5.3 MDX escaping (critical)

The output is compiled as **MDX**, not plain markdown, so `{` and `<` are syntactically significant — `{foo}` is a JS expression and `<Foo>` is JSX. A post containing `useState<{count: number}>` in prose would currently fail the build or, worse, render as garbage.

Plain-text runs are escaped: `{` → `&#123;`, `}` → `&#125;`, `<` → `&lt;`. Text inside `code` annotations and inside fenced code blocks is **not** escaped — MDX does not parse those.

This gets its own test suite. It is the single most likely source of a broken post.

### 5.4 Slugs

`Slug` property when non-empty, otherwise derived from `Title`: lowercase, Unicode-normalize and strip diacritics, non-alphanumerics → `-`, collapse repeats, trim. Must match `^[a-z0-9]+(-[a-z0-9]+)*$`. Collisions across posts are a validation error, not a silent overwrite.

---

## 6. Image capture

Notion's file URLs are signed S3 links **valid for one hour**; Notion's docs explicitly say not to cache or statically reference them. The site's CSP (`img-src 'self' data: blob:`) would block them regardless. So images must be captured during sync.

For each `image` block (and the page cover, if used):

1. `GET` the signed URL while it is still fresh.
2. `sha256` the bytes; take the first 12 hex characters.
3. Detect the extension from the `Content-Type`.
4. Write to `public/images/blog/<slug>/<hash>.<ext>`.
5. Rewrite the markdown reference to that path.

**Content-addressed filenames give idempotency for free**: an unchanged image hashes to the same name, so the file already exists and nothing is rewritten. Re-uploading the same picture in Notion produces no diff.

A failed download aborts that post only — its previously synced version stays live. Downloads are capped (10 MB per image) and run with concurrency 3.

Images under `public/images/blog/<slug>/` that no post references after a sync are pruned.

Notion's free tier caps uploads at 5 MB per file, which is comfortably under the limit.

---

## 7. Idempotency

The sync runs every 10 minutes. If it produced a non-empty diff when nothing changed, it would commit and redeploy the site 144 times a day. Idempotency is therefore a **correctness requirement**, not a nicety.

Guarantees:

1. **Stable ordering** — Notion returns block children in document order; posts are sorted by `(Published desc, slug asc)`.
2. **Stable serialization** — frontmatter keys are written in a fixed order (`title`, `date`, `excerpt`, `tags`, `updated`), always double-quoted, with `\n` line endings and exactly one trailing newline.
3. **No timestamps in output** — nothing records "synced at".
4. **Content-addressed images** — §6.
5. **`updated` does not by itself cause a write.** `last_edited_time` changes when you so much as open a Notion page and touch a character. The sync compares only the *content-relevant* projection (title, date, excerpt, tags, slug, body). If that is byte-identical to the file on disk, the file is left completely untouched — retaining its existing `updated` value. `updated` is only refreshed when something real changed.

**Test:** run the full converter twice over the same fixture set and assert byte-identical output. Then run it against the committed `.mdx` fixtures and assert an empty diff.

---

## 8. Validation — fail closed

`validate.ts` runs over all posts **before anything is written**. It collects every error rather than throwing on the first, prints them all, and exits non-zero. No files written, no commit, no deploy. The previously published site stays up untouched.

| Rule | Failure |
|---|---|
| `title` non-empty | error |
| `date` parses as a valid `YYYY-MM-DD` | error |
| `excerpt` non-empty and ≤ 200 chars | error |
| `slug` matches the slug pattern | error |
| `slug` unique across posts | error |
| `body` non-empty after conversion | error |
| unsupported block encountered | warning, logged |
| image download failed | error for that post |

This is the fix for the audit's "Invalid Date" class of bug: the failure is caught at the source with a named post and a clear message, instead of rendering `Invalid Date` to a reader.

---

## 9. Site changes (audit fixes)

### 9.1 RSS feed

`src/app/feed.xml/route.ts` — a static route handler emitting **RSS 2.0** with `<atom:link rel="self">`, one `<item>` per post (title, link, guid, pubDate, description from `excerpt`). Advertised in `src/app/layout.tsx` via `alternates.types['application/rss+xml']`, and linked from the footer. Added to `sitemap.ts` and referenced in `robots.ts`.

### 9.2 Homepage "Latest writing" section

`src/components/sections/Writing.tsx` — the three most recent posts in the existing `Section` idiom, reusing `PostCard`, with a "Read all posts →" link to `/blog`. Inserted into `src/app/page.tsx` between `Projects` and `About`, and added to `site.nav` as a `/#writing` anchor.

### 9.3 Tag pages

`src/app/blog/tag/[slug]/page.tsx` — `generateStaticParams` over the distinct tag set, `dynamicParams = false`. Renders the filtered post list with an `<h1>` of the tag. `src/lib/blog.ts` gains `getAllTags()` and `getPostsByTag(slug)`. `Tag` is wrapped in a `Link` on `PostCard` and the post header; `Tag` itself stays presentational.

### 9.4 Heading anchors + prev/next

Add `rehype-slug` and `rehype-autolink-headings` (behavior `append`, a visually-hidden `#` link with an accessible name) to the `rehype` chain in `[slug]/page.tsx`. Anchors get `scroll-margin-top` in `globals.css`.

`getAdjacentPosts(slug)` in `src/lib/blog.ts` returns `{ prev, next }` from the sorted list; a `PostNav` component renders them below the article.

### 9.5 `PostMeta` gains `updated`

`PostMeta` in `src/lib/blog.ts` gains an optional `updated?: string`, parsed from the new frontmatter key. `ArticleJsonLd` uses it for `dateModified`, falling back to `date` when absent (as it will be for the two pre-migration posts until they next change). No other consumer changes.

### 9.6 Heading scale in `mdx-components.tsx`

Per §5.1 the converter emits `h2`/`h3`/`h4` for Notion's three heading levels. `mdx-components.tsx` currently styles `h1` (→ h2 element), `h2`, and `h3`; it gains an **`h4`** style — same `font-display`, one step down in size from `h3`, with proportional top margin. The existing `h1` mapping stays as a safety net for the two hand-written posts and any stray `#` in migrated content.

### 9.7 Date-sorting fix

`getAllPosts` currently sorts with a string comparison (`a.date < b.date`). Switch to comparing parsed timestamps, with an invalid date sorting last rather than throwing. Validation (§8) makes this unreachable for synced posts, but the loader should not depend on that.

---

## 10. Automation

### 10.1 `scripts/sync-notion.ts`

```
pnpm sync:notion            # write changes
pnpm sync:notion --check    # exit 1 if a sync would produce a diff (CI guard)
```

Reads `NOTION_TOKEN` and `NOTION_DATABASE_ID` from the environment. Writes to a temp directory, validates, then reconciles against `content/blog/` — writing changed files, deleting orphans, pruning unreferenced images. Prints a summary (`3 unchanged, 1 updated, 1 added, 0 removed`).

### 10.2 `.github/workflows/sync-content.yml`

```yaml
on:
  schedule: [{ cron: "*/10 * * * *" }]
  workflow_dispatch:
concurrency: sync-content
```

Steps: checkout → pnpm install → `pnpm sync:notion` → if `git status --porcelain` is non-empty, commit as `content: sync from Notion` and push.

**Critical detail:** a push made with the default `GITHUB_TOKEN` **does not trigger other workflows**. Pushing with it would sync content and never deploy it. The checkout and push therefore use a **fine-grained PAT** stored as the `CONTENT_SYNC_TOKEN` secret, scoped to this repo with `contents: write`. This is the single most likely thing to silently break, so it is called out in the README.

Secrets required: `NOTION_TOKEN`, `NOTION_DATABASE_ID`, `CONTENT_SYNC_TOKEN`.

Publishing latency: up to 10 min of cron plus ~5 min of CI. "Sync now" via `workflow_dispatch` cuts it to ~5 min.

---

## 11. Migration

`scripts/mdx-to-notion.ts` — a **one-time, manually run** script that reads the existing `content/blog/*.mdx` files and creates matching Notion pages (frontmatter → properties, markdown → blocks) so the two existing posts don't need retyping. Kept in the repo, documented as one-shot, never wired into CI.

After migration Notion owns `content/blog/` exclusively. Hand-editing a file there will be reverted by the next sync — documented in the README.

---

## 12. Rejected alternatives

Recorded here as the ADR for this decision.

**A database (Postgres/Turso) + R2 + a webhook receiver.** Would make publishing instant instead of ~5–15 minutes. Rejected: it adds a database, an object store, and a public webhook endpoint to a site that currently has no runtime dependencies at all, and it makes the blog fail when the database does. It also requires a cron fallback anyway (a silently-dead webhook is undetectable), so both mechanisms end up maintained. The cost — operational, not financial — is not worth five minutes on a blog updated weekly.

**Rendering Notion at request time via ISR.** Rejected: makes Notion a hard runtime dependency, and Fly runs this app with `min_machines_running = 0`, so the filesystem ISR cache is discarded on every cold start. Per Next's revalidation docs, on-demand revalidation is instance-local, so any scale-out would serve inconsistent content without a shared cache handler.

**A git-backed browser CMS (Keystatic/Decap).** Rejected: these admin panels are desktop-first and unpleasant for long-form writing on a phone, which is the primary requirement.

**Proxying Notion image URLs at runtime.** Rejected: every image load would depend on Notion's availability, requires widening the CSP, and adds a serverless hop to something that should be a static asset.

---

## 13. Testing

**Unit (Vitest), against committed fixture JSON in `src/lib/notion/__tests__/fixtures/`:**

- `rich-text` — each annotation, composition order, links, MDX escaping (§5.3).
- `blocks-to-md` — every block type in the §5.1 table; nested lists to three levels; tables with and without headers; unknown blocks skipped with a warning.
- `slug` — diacritics, punctuation, collisions, empty input.
- `validate` — one test per rule in §8, plus multi-error accumulation.
- `serialize` — fixed key order, quoting, trailing newline.
- **`idempotency`** — converting the same fixture twice yields byte-identical output; serializing a post whose content projection is unchanged preserves the existing `updated`.
- `images` — content hashing, extension detection, dedupe of a repeated image.

**Existing suites** (`src/lib/__tests__/blog.test.ts`, component tests) must keep passing; new cases cover `getAllTags`, `getPostsByTag`, `getAdjacentPosts`, and the date-sort fix.

**New component tests:** `Writing` section, `PostNav`, tag-page rendering, feed route output shape.

**E2E (Playwright):** extend `e2e/smoke.spec.ts` — `/feed.xml` returns `application/rss+xml` with at least one `<item>`; a tag chip navigates to a tag page; heading anchors resolve.

**Not tested:** the Notion SDK itself. `client.ts` is a thin I/O wrapper; the pure converter is where the logic and the tests live.

---

## 14. Failure modes

| Failure | Behavior |
|---|---|
| Notion API down / token expired | Script exits non-zero, no commit. Site unaffected. Next run recovers. |
| Validation error | All errors printed, exit non-zero, nothing written. Site unaffected. |
| Image download fails | That post is skipped; its previous version stays live. |
| Post unpublished in Notion | File deleted, images pruned, `/blog/<slug>` 404s. **Repo is public, so it remains in git history.** Documented. |
| Two syncs overlap | Prevented by the workflow `concurrency` group. |
| `CONTENT_SYNC_TOKEN` expired | Push fails loudly, the Action run goes red. |
| Bad MDX reaches the repo | `pnpm run build` fails in the existing CI job, blocking deploy. |

---

## 15. Dependencies

New: `@notionhq/client` (v5.x), `rehype-slug`, `rehype-autolink-headings`. All pure JS with no install scripts, so the `allowBuilds` allowlist in `pnpm-workspace.yaml` needs no change. The 7-day `minimumReleaseAge` cooldown applies.

---

## 16. Documentation — `docs/authoring.md`

A user-facing authoring guide, distinct from this design doc:

- **Mobile formatting cheat sheet** — intent → Notion shortcut → what lands on the site, covering headings, lists, bold/italic, inline code, code blocks, quotes, dividers, images, and links.
- **Worked example** — a short Notion page shown beside the `.mdx` it generates, so the properties→frontmatter and blocks→body mapping is concrete.
- **What to avoid** — synced blocks, embedded databases, buttons, and column layouts are skipped with a warning rather than failing the build, so their content would vanish silently.
- **Known rough edge** — code blocks are painful to author on a phone (touch keyboards and the language dropdown). Draft prose on mobile, add code from a laptop; pasting copied code works fine on mobile.
- **Publish checklist** — `Excerpt` filled, `Published` date set, `Tags` chosen, `Status` → `Published`; live in ~5–15 min, or immediately via the "Sync now" `workflow_dispatch` button.
- **Privacy rules** — the three gates from §3.1, and the properties-vs-body distinction.

The README's "Content to personalize" section is updated to point here and to state that `content/blog/*.mdx` is now generated — hand edits are reverted by the next sync.

---

## 17. Implementation split

This spec ships as **two plans**, in order. They are independent; the pipeline does not depend on the site improvements.

**Plan A — Notion pipeline.** §3–§8, §10, §11, §16, and the §13 tests covering the converter. Delivers phone publishing end to end. Ships with the heading scale emitting `h2`/`h3`/`h4`, so §9.6 (the `h4` style) rides along here rather than in Plan B — otherwise Notion H3 content would render unstyled in the gap between the two plans.

**Plan B — blog improvements.** §9.1–§9.5 and §9.7: RSS feed, homepage writing section, tag pages, heading anchors, prev/next, `PostMeta.updated`, and the date-sorting fix.

---

## 18. Out of scope

Scheduled/future-dated publishing, per-post cover images and custom OG art, Notion comments as post comments, a newsletter, incremental sync via `last_edited_time` cursors (the full sync is cheap at this scale), and multi-author support.

Also out of scope: migrating `src/data/projects.ts` or `src/data/comedy.ts` to Notion-backed data sources (§3.1). The converter is written to make that possible later, but this plan ships the blog pipeline only.
