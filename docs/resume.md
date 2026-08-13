# Public resume

`public/resume.pdf` is the downloadable resume served at `/resume.pdf`.

## Source and rebuild

The maintainable source is `scripts/build-resume.py`. It deliberately keeps
the resume to one US Letter page and uses only facts already represented in
the prior resume and the public site data. The contact endpoints in the
rendered PDF are clickable as well as visible for ATS readers.

To rebuild it from the repository root:

```sh
python3 -m pip install reportlab
python3 scripts/build-resume.py
```

Then render and inspect the result before committing:

```sh
mkdir -p tmp/pdfs
pdftoppm -png -r 180 -singlefile public/resume.pdf tmp/pdfs/resume
pdfinfo public/resume.pdf
```

Keep the public name aligned with `src/lib/site.ts`. The builder retains the
previous full professional name in its source metadata so an editor can use it
when a formal context requires it. Do not add metrics, responsibilities,
dates, titles, or URLs without confirming them with Miguel.
