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

## Supply-chain hardening

- **Script blocking**: pnpm 10+ blocks dependency install/build scripts by default. The allowlist in `pnpm-workspace.yaml` → `allowBuilds` permits only `esbuild` (native binary setup) and `unrs-resolver` (Tailwind v4 Rust binding). All other lifecycle scripts are blocked.
- **Release-age cooldown**: `minimumReleaseAge: "10080 minutes"` (7 days) in `pnpm-workspace.yaml` prevents installing package versions published in the past week, reducing exposure to freshly-compromised or typosquatted releases (requires pnpm 10.16+).
- **Lockfile committed**: `pnpm-lock.yaml` is committed to the repo, pinning all resolved versions for reproducible installs.
- **Audit**: Run `pnpm audit` at any time to check for known vulnerability advisories.

## Content to personalize

- `src/data/experience.ts` — your roles and accomplishments.
- `src/data/projects.ts` — your projects (slug, summary, tags, stack, links); add screenshots under `public/images/projects/` and reference them in each project's `images` array.
- `public/resume.pdf` — your real résumé (replace the placeholder).
- `src/lib/site.ts` — name, tagline, role, and social links (incl. the LinkedIn URL placeholder).
- `content/blog/*.mdx` — blog posts (frontmatter: title, date, excerpt, tags; body in MDX with fenced code blocks).

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
