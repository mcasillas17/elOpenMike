# Public resume

`public/resume.pdf` is the downloadable resume served at `/resume.pdf`.

## Source and rebuild

The maintainable source is `scripts/build-resume.mjs`. It uses the repo's
pinned Playwright/Chromium dependency to produce a tagged, one-page US Letter
PDF from semantic HTML. Its claims come only from the prior resume and public
site data. The visible contact endpoints are clickable for recruiters and
available as text for ATS readers.

To rebuild it from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm resume:build
pnpm resume:verify
```

For optional visual QA on a machine with Poppler installed:

```sh
pdfinfo public/resume.pdf
pdftoppm -png -r 180 -singlefile public/resume.pdf /tmp/elopenmike-resume
```

`pnpm resume:verify` checks PDF page count, tagging, semantic-text extraction
and order, and every required contact/project link with PDF.js and raw PDF
structure markers; it does not require Poppler. Keep the public name aligned
with `src/lib/site.ts`. Do not add metrics, responsibilities, dates, titles,
or URLs without confirming them with Miguel.
