# elOpenMike

Personal website for Miguel Casillas — Software Engineer, builder, and stand-up comedian.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · next/font (Sora + Inter) · Vitest + React Testing Library.

## Develop

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # run unit/component tests
npm run build    # production build
```

## Content to personalize

- `src/data/experience.ts` — your roles and accomplishments.
- `public/resume.pdf` — your real résumé (replace the placeholder).
- `src/lib/site.ts` — name, tagline, role, and social links (incl. the LinkedIn URL placeholder).

## Deploy (Vercel)

1. Push to `main` on `github.com/mcasillas17/elOpenMike`.
2. Import the repo at vercel.com → New Project (framework auto-detected as Next.js).
3. Deploy. Add a custom domain later under Project → Settings → Domains.

## Design

See `docs/superpowers/specs/2026-05-23-elopenmike-personal-site-design.md` and the implementation plans in `docs/superpowers/plans/`.
