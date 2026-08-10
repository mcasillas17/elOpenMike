# elOpenMike

Personal website for Miguel Casillas — Software Engineer, builder, and stand-up comedian.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · next/font (Sora + Inter) · Vitest + React Testing Library.

## Develop

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm test         # run unit/component tests
pnpm run build    # production build
```

## Environment variables

Copy `.env.example` to `.env.local` and fill in what you need. All variables
are optional; the site builds and runs without any of them.

- `NEXT_PUBLIC_CF_BEACON_TOKEN` — Cloudflare Web Analytics beacon (public
  client-side token). Forwarded to the Docker build via `fly.toml` →
  `[build.args]` so Next bakes it into the client bundle. Unset = analytics off.

## Blog content sync

Posts are written in Notion and synced into `content/blog/` by
`.github/workflows/sync-content.yml` (every 10 minutes, plus a manual
"Run workflow" button). See [`docs/authoring.md`](docs/authoring.md) for the
authoring workflow.

Required GitHub secrets:

- `NOTION_TOKEN` — the internal integration token.
- `NOTION_DATABASE_ID` — the Blog database id.
- `CONTENT_SYNC_TOKEN` — a fine-grained PAT scoped to this repo with
  `contents: write`. **Required:** pushes made with the default `GITHUB_TOKEN`
  do not trigger other workflows, so the deploy would never run.

## Supply-chain hardening

- **Script blocking**: pnpm 10+ blocks dependency install/build scripts by default. The allowlist in `pnpm-workspace.yaml` → `allowBuilds` permits only `esbuild` (native binary setup) and `unrs-resolver` (Tailwind v4 Rust binding). All other lifecycle scripts are blocked.
- **Release-age cooldown**: `minimumReleaseAge: 10080` (minutes, i.e. 7 days) in `pnpm-workspace.yaml` prevents installing package versions published in the past week, reducing exposure to freshly-compromised or typosquatted releases (requires pnpm 10.16+). The value must be an unquoted number of minutes — a suffixed string like `"10080 minutes"` is misread and rejects even year-old releases.
- **Lockfile committed**: `pnpm-lock.yaml` is committed to the repo, pinning all resolved versions for reproducible installs.
- **Audit**: Run `pnpm audit` at any time to check for known vulnerability advisories.

## Content to personalize

- `src/data/experience.ts` — your roles and accomplishments.
- `src/data/projects.ts` — your projects (slug, summary, tags, stack, links). Tags drive panel tint on listings (AI/Full-stack → blue, Web app → red, Game/Unity → green, Open source → purple). Add screenshots under `public/images/projects/` and reference them in each project's `images` array — they appear in the detail-page carousel; listing cards are styled as comic panels and don't render screenshots.
- `public/resume.pdf` — your real résumé (replace the placeholder).
- `src/lib/site.ts` — name, tagline, role, and social links (incl. the LinkedIn URL placeholder).
- `content/blog/*.mdx` — **generated from Notion; do not hand-edit** (the next
  sync reverts changes). Write posts in the Notion Blog database instead. See
  [`docs/authoring.md`](docs/authoring.md).

## One-time migration into Notion

`pnpm migrate:to-notion` pushes the hand-written `content/blog/*.mdx` posts into
the Notion database. It needs `NOTION_TOKEN` and `NOTION_DATA_SOURCE_ID`.

It is safe to re-run: it reads the slugs already in the database and creates
only the posts that are missing, so a run interrupted partway is finished by
running it again. It refuses to create anything if a slug is already claimed by
two database pages, or if two local files map to the same slug. A page in the
Notion trash does not hold its slug, so trashing a page and re-running is how a
single post is redone.

Inline formatting travels with the text: code spans, bold, italic,
strikethrough and links become the annotations a Notion page stores rather than
the characters that spell them. Inline markdown that has no equivalent in a
Notion run — an image, a reference link, a link title, raw HTML — stops the run
before the first page is created, naming the line and the offset it choked on.

## Deploy (Fly.io)

Runs as a Next.js standalone server in a container (`Dockerfile` + `fly.toml`;
`next.config.ts` uses `output: "standalone"`).

```bash
fly auth login
# First time: claim a unique app name + region (adopts the existing fly.toml/Dockerfile)
fly launch
# Subsequent deploys:
fly deploy
```

Custom domain (e.g. via Cloudflare DNS):

```bash
fly certs add yourdomain.com
# then add the A/AAAA (or CNAME) records Fly prints, in Cloudflare DNS
```

Image handling: `next.config.ts` sets `images.unoptimized: true` so the
container needs no `sharp` (consistent with the supply-chain allowlist). Hand-
optimize source images, or add a loader/sharp later if you want optimization.

## Design

See `docs/superpowers/specs/2026-05-23-elopenmike-personal-site-design.md` and the implementation plans in `docs/superpowers/plans/`.
