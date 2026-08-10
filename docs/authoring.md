# Writing and publishing posts

Posts are written in Notion and published automatically. You never touch git.

## Publishing

1. Add a row to the **Blog** database in Notion.
2. Write the post in the page body.
3. Fill in **Excerpt**, **Published** (date), and **Tags**.
4. Set **Status** → **Published**.

It goes live within ~15 minutes. To publish immediately, open the repo's
**Actions → Sync content from Notion → Run workflow** button; that cuts it to
about 5 minutes (the CI and deploy floor).

## Formatting on your phone

You never type markdown. Use Notion's own formatting — these shortcuts convert
as you type.

| You want | Type | Or |
| --- | --- | --- |
| Section heading | `## ` + space | `/h2` |
| Sub-heading | `### ` + space | `/h3` |
| Bullet list | `- ` + space | `/bullet` |
| Numbered list | `1. ` + space | `/number` |
| **Bold** | `**text**` | select → toolbar |
| *Italic* | `*text*` | select → toolbar |
| `inline code` | `` `text` `` | select → toolbar → code |
| Code block | ` ``` ` | `/code` |
| Quote | `> ` + space | `/quote` |
| Divider | `---` | `/divider` |
| Image | — | `/image`, or paste from the camera roll |
| Link | paste a URL over selected text | select → toolbar → link |

Notion's Heading 1/2/3 render on the site as h2/h3/h4 — the post title is
already the page's h1.

## What it produces

A Notion page with an H1 "A minimal tool", a paragraph, and a TypeScript code
block becomes:

````mdx
---
title: "Grounding agents"
date: "2026-08-03"
excerpt: "Why retrieval beats prompt-stuffing."
tags: ["AI"]
updated: "2026-08-03"
---

## A minimal tool

Here's the shape of a grounded tool call — note the `topK` limit.

```ts
const hits = await index.search(q, { topK: 5 });
```
````

Properties become frontmatter; blocks become the body. Notion's code-block
language becomes the fence language, so syntax highlighting is automatic.

## What to avoid

These have no blog equivalent and are **skipped with a warning** — their
content disappears silently:

- Synced blocks
- Databases embedded in a page
- Buttons
- Column layouts

Sub-pages nested under a post are also skipped, which makes them a safe place
for outlines and research notes.

## Images

Upload images into the page (`/image`, or paste from the camera roll) rather
than linking them from an arbitrary site. The sync only downloads images served
by Notion itself — its signed S3 URLs, `file.notion.so`, `www.notion.so/image/`
— plus `images.unsplash.com`, which Notion's own image picker uses. Anything
else is refused by host, because a blindly fetched URL turns the sync runner
into a request-forwarding proxy for whatever the URL points at.

Images larger than 10 MB are refused too; the post keeps whatever it had on
disk and the run reports the failure.

## Known rough edge

Code blocks are painful to author on a phone — touch keyboards fight braces and
backticks, and setting the language means tapping into a dropdown. Draft prose
on mobile and add code from a laptop. Pasting copied code works fine on mobile.

## Privacy

Three independent gates decide what reaches the site:

1. **The integration connection.** The token can only read pages explicitly
   shared with it. Everything else in the workspace is invisible to it — not
   filtered out, genuinely unreadable.
2. **The database ID.** Only the Blog database is queried.
3. **Status.** Only `Published` rows are fetched.

Extra **properties** on the Blog database (personal notes, edit status) are
never read. **Body content is published in full**, so don't leave private
asides in the post itself.

Note that this repo is public: unpublishing removes a post from the site but
not from git history.

## Local commands

```bash
pnpm sync:notion          # pull published posts now
pnpm sync:notion --check  # exit 1 if a sync would change anything
```

`--check` covers images as well as posts: a post whose picture changed, or one
that no longer references an image it used to, counts as out of date even when
the `.mdx` file itself is byte-identical.

Requires `NOTION_TOKEN` and `NOTION_DATABASE_ID` in your environment.

## If one post fails to sync

A post whose images can't be downloaded — an expired link, a file over the
size cap, a host the sync refuses — doesn't stop the run any more. The rest of
the blog syncs normally and the failure is reported per post:

- if the post is **already on disk**, its file and its images are left exactly
  as they are, so the live post keeps working;
- if the post has **never synced**, it is skipped and nothing is published.

Fix the image in Notion and the next run picks the post up. The run itself
still exits 0 so the posts that did sync are committed.

While any post is failing the sync also **stops removing files**. Nothing on
disk records which Notion page wrote which file, so a post whose slug changed
and then failed is indistinguishable from a post you unpublished — and one of
those two readings deletes live content. Unpublishing therefore takes effect on
the next run in which every post syncs cleanly.

## If a post changes mid-sync

A sync reads the list of published pages first and each page's body afterwards,
so a post can be unpublished or rewritten in the seconds between the two. Every
page's Status and version are therefore read a second time once its body has
loaded, and the post is only published if it is still **Published**, still out
of the trash, and still reports the same last-edited timestamp. Otherwise it is
reported like any other per-post failure — the file already on disk is left
alone and nothing new is published for it.

Notion has no way to say "read this page as of the version I already saw", so
the check narrows the window rather than closing it: an edit that lands after
that second read is picked up by the next run, about ten minutes later. What it
does guarantee is that a body is never published on the strength of a status
read before the body was fetched.

## If two posts share a slug

Two published pages with the same **Slug** (or, with no Slug, the same title)
would publish to one url, and the file on disk cannot say which page it came
from. The run stops with `slug "..." is claimed by 2 different Notion pages`
and writes nothing. Give one of them its own Slug.

## If the sync refuses to delete posts

A run that would remove more than half the posts stops with
`refusing to delete N of M post(s)` and writes nothing. That is almost always
a Notion-side change rather than something you meant:

- the **Status** property was renamed, or its **Published** option was;
- the integration lost access to the database.

Fix the database and re-run. If you really did unpublish that many posts at
once, confirm it with `pnpm sync:notion --allow-mass-delete`.
