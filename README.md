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
pnpm start        # serve the production build the way the container does
pnpm e2e          # Playwright, against that same server
```

The E2E server defaults to port 3000. If another local process owns it, choose
another explicitly, for example `E2E_PORT=3100 pnpm e2e`.

`pnpm start` runs `.next/standalone/server.js` — the artifact the `Dockerfile`
builds and Fly runs — after staging `public` and `.next/static` beside it
exactly as the `Dockerfile` does. (`next start` does not work under
`output: "standalone"` and says so.) It builds first if there is nothing to
serve, so `pnpm e2e` works from a clean checkout.

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

The public writing experience lives at `/blog`: the newest post is featured,
topic counts link into filtered archives, and each article provides updated and
reading-time context, section permalinks, copyable syntax-highlighted code,
related reading, chronological navigation, RSS, and email follow-up. Rich
Notion content is rendered responsively, including images, tables, and task
lists. Search, pagination, a table of contents, and reading progress are
deliberately deferred until the archive or article length makes them useful.

Required GitHub secrets:

- `NOTION_TOKEN` — the internal integration token.
- `NOTION_DATABASE_ID` — the Blog database id.
- `CONTENT_SYNC_TOKEN` — a fine-grained PAT scoped to this repo with
  `contents: write`. **Required:** pushes made with the default `GITHUB_TOKEN`
  do not trigger other workflows, so the deploy would never run.

Optional:

- `NOTION_DATA_SOURCE_ID` — only needed if the Blog database exposes more than
  one **data source**. A database is a container; its rows live in a data
  source, and an ordinary database has exactly one, which the sync and the
  migration both resolve from `NOTION_DATABASE_ID`. If there is ever more than
  one, neither guesses: the run stops, names the sources it found, and asks for
  this variable. It is checked against the database before anything is read, so
  an id from another database fails immediately.

**Images are held in memory, so the run has a ceiling on them.** A post's images
are downloaded while their signed Notion URLs are still valid and kept until the
whole plan has been computed — `--check` has to be able to say whether a run
would change anything without changing anything, and a plan built halfway
through a run is not an answer. So nothing can be streamed to disk, and without
a bound the run's peak memory was whatever the blog happened to weigh: one image
is capped at 10 MB, and a hundred posts carrying ten each is 10 GB on a runner
with a few. That does not end in an error message — the process is killed
mid-run, having written nothing. One run may therefore hold **256 MiB across at
most 512 image files** (`src/lib/notion/image-budget.ts`), accounted by exact
length and once per file, so the same image referenced twice in a post costs
what it costs on disk. Posts are rendered one at a time, so the post that
crosses the line is the post reported: it fails exactly the way a post whose
image will not download fails — its file on disk is preserved, nothing is
deleted that run — and it gives back every byte it had taken, so the posts after
it still sync.

**Every image runs under a deadline, and giving up never waits on the host.**
One image has a total budget and a shorter idle one that every piece of progress
resets (`src/lib/notion/images.ts`), both enforced through the AbortController
the size cap already uses — a body that trickles forever cannot outlast the
first, and one that simply stops meets the second. Ending a transfer is then two
separate things, in this order: the request is **aborted**, which is the half
this side controls and the half that actually tears the connection down, and the
body is then *asked* to release. That ask is never awaited: a cancel is a promise
the other side settles, so the host that stopped answering reads is exactly the
host that sits on its cancel too — and the function whose whole job is to come
back on time hung on the cleanup its own deadline had just asked for. It is fired
instead, its rejection always taken so a quiet failure cannot become an unhandled
one, on every path that gives up: a redirect's body before the next hop, a type
this site does not publish, a refused status, the size cap and the deadline.

**The images already on disk are never held at all.** Planning them means
answering one question per file — does it already hold the bytes this run has in
hand? — and that needs a length and a digest, not a body. Reading each of them
whole into a `Map<string, Uint8Array>` was the other half of the same failure
the budget above fixes: a blog whose images weigh 300 MB spent 300 MB proving
that none of them had changed, on top of everything it had downloaded. So each
file is opened, read through one 64 KiB buffer shared by the whole walk, and
reduced to its size and its digest — the same digest, from the same place, that
gives an image its content-addressed filename.

**Nothing in either tree is followed, at any level.** `content/blog` and
`public/images/blog` are written by this sync and by nothing else, which writes
regular files inside plain directories — so a symlink (or a Windows reparse
point) anywhere in them stops the run rather than being read, written or
deleted. *Anywhere* is the point: checking the last name in a path and opening
it with `O_NOFOLLOW` says nothing about the four directories above it, and a
link at `public`, at `public/images` or at the blog root itself moves the whole
walk somewhere else before that check is ever made — every file "found on disk"
is then one outside the repo, every write lands there, and every orphan is
pruned there. So every component is `lstat`ed immediately before the operation
that uses it, the no-follow flags are used where the platform has them, the
resolved path is compared with where it is spelled, and what was opened is
compared by device and inode with what is at that name afterwards; a
disagreement is refused rather than guessed at (`src/lib/notion/safe-fs.ts`).
Directories are created one component at a time rather than with
`recursive: true`, deletion is `unlink` and `rmdir` — never recursive, never
resolving a link — and a plan whose path climbs out of the tree it names is
refused before a single syscall. Node has no `openat(2)`, so the window between
a check and the syscall it justifies cannot be closed from here; it is checked
from both sides instead, and every uncertain answer is an error. A file the run
cannot read stops it too: "unreadable" and "absent" must not be the same answer,
or `--check` would call a tree in sync while a real run rewrote it.

**Both halves of the tree are read and written by tested modules.** The MDX half
used to live in `scripts/sync-notion.ts`, where nothing tested it, and it read
every failure as an empty blog:

```ts
try { names = await fs.readdir(dir) } catch { return existing }
```

A tree the run may not open, a `content` that had become a link, a post whose
read failed — all of them came back as "there are no posts", which plans every
post as missing, every file as an orphan, and lets `--check` report a blog in
sync that it compared against nothing at all. It is now
`src/lib/notion/content-files.ts`, beside the image half and on the same
walker: only `ENOENT` and `ENOTDIR` mean "nothing written here yet", every other
errno stops the run, and a run that cannot read the tree fails the check rather
than passing it.

## Supply-chain hardening

- **Script blocking**: pnpm 10+ blocks dependency install/build scripts by default. The allowlist in `pnpm-workspace.yaml` → `allowBuilds` permits only `esbuild` (native binary setup) and `unrs-resolver` (Tailwind v4 Rust binding). All other lifecycle scripts are blocked.
- **Release-age cooldown**: `minimumReleaseAge: 10080` (minutes, i.e. 7 days) in `pnpm-workspace.yaml` prevents installing package versions published in the past week, reducing exposure to freshly-compromised or typosquatted releases (requires pnpm 10.16+). The value must be an unquoted number of minutes — a suffixed string like `"10080 minutes"` is misread and rejects even year-old releases.
- **Lockfile committed**: `pnpm-lock.yaml` is committed to the repo, pinning all resolved versions for reproducible installs.
- **Audit**: Run `pnpm audit` at any time to check for known vulnerability advisories.

## Content to personalize

- `src/data/experience.ts` — your roles and accomplishments.
- `src/data/projects.ts` — your projects (slug, summary, tags, stack, links). Tags drive panel tint on listings (AI/Full-stack → blue, Web app → red, Game/Unity → green, Open source → purple). Add screenshots under `public/images/projects/` and reference them in each project's `images` array — they appear in the detail-page carousel; listing cards are styled as comic panels and don't render screenshots.
- `src/data/howIWork.ts` — evidence-backed engineering principles for the homepage. Keep each claim tied to a public project, document, article, or current experience summary.
- `public/resume.pdf` — your real résumé (replace the placeholder).
- `src/lib/site.ts` — name, tagline, role, and social links (incl. the LinkedIn URL placeholder).
- `content/blog/*.mdx` — **generated from Notion; do not hand-edit** (the next
  sync reverts changes). Write posts in the Notion Blog database instead. See
  [`docs/authoring.md`](docs/authoring.md).

## One-time migration into Notion

`pnpm migrate:to-notion` pushes the hand-written `content/blog/*.mdx` posts into
the Notion database. It needs `NOTION_TOKEN` and `NOTION_DATABASE_ID` — the same
two the sync uses, resolved through the same code, so it writes into the data
source the sync publishes from (`NOTION_DATA_SOURCE_ID` only comes into it if
the database exposes more than one). It also needs a
`Status` property (Status or Select) offering both a **Draft** and a
**Published** option — it checks for both before writing anything, because
Notion refuses a status value that is not already an option and the API cannot
add one.

It is safe to re-run, and safe to kill. Every page is created as a **Draft**,
which the sync never publishes, and is promoted to **Published** in a single
request only once every one of its blocks has landed. Published therefore means
finished: nothing half-migrated is ever visible on the site, however the run
ended — including a process killed outright, where no rollback code could have
run at all.

A re-run reads the whole database first and then finishes what it finds:

- a **Published** page under a post's slug is that post, already done, and is
  skipped;
- a **Draft** page under the same slug *and* the same title is a page a previous
  run left unfinished. Its blocks are read back and measured against the post,
  and it is resumed only if what is already there is an exact prefix of what the
  post says — same blocks, same order, nested children and all. The missing
  blocks are then appended and the page promoted. That prefix, with the slug,
  the title and the draft status, is the safety gate: the database schema is the
  one you author in, so there is no column to mark a page as the migration's
  own;
- anything else claiming the slug stops the run with a message naming it, and
  **nothing at all is written** — not even for the posts that were fine. That
  covers a draft whose content has diverged, a draft under another title, a page
  in some other status, a slug claimed by two pages, and two local files mapping
  to one slug. Nothing it refuses is modified.

All of that reading happens before the first write, so a run either has a clean
plan for every post or changes nothing.

### What the run checks before it writes anything

Every local post is measured first — all of them, including ones already in
Notion that the run would otherwise skip — against exactly the invariants the
sync enforces on the way back out, because a post pushed into Notion carrying
one of these never comes out again: it sits in the database, invisible on the
site, while every sync from then on refuses the **whole blog** because of it.
The checks are literally the sync's, in one shared module, so the two cannot
drift apart:

- a **title** and an **excerpt** the author actually wrote as text, non-empty,
  with the excerpt at most 200 characters. Neither is ever coerced: a `title:`
  holding a sequence, a mapping, a number, a boolean or a null is refused by
  name rather than becoming `A,B`, `[object Object]`, `42` or `true` and being
  published as though somebody had typed it. A file with no `title:` line at
  all still falls back to its file name. A title with whitespace on either end
  is refused rather than trimmed: every reader of a Notion page property trims
  what it reads, so a padded title is one the page can never carry — it made a
  draft left behind by a killed run unresumable, and it dropped the padding
  from the published post without ever saying so. Nothing here trims on the
  author's behalf;
- a **date** that is a real `YYYY-MM-DD` day. A date carrying a time is narrowed
  to its day as the file is read — but only when the *whole* value is a valid
  ISO-8601 timestamp, time, fraction and offset included, so `2026-05-20T`,
  `2026-05-20 tomorrow` and `2026-05-20T99:99:99Z` are refused instead of having
  the part nobody could read quietly deleted. The written day survives whatever
  the offset is, so a file means the same day on every machine; anything else —
  `2026/05/20`, `May 20, 2026`, `2026-02-31`, or a date written as anything but
  text — is refused by name;
- an **`updated`**, where the file carries one, that is a real day too. Notion
  has no column for it (the sync derives it from the page's last-edited time),
  but an unreadable one would reach the sitemap as `<lastmod>` and the article
  JSON-LD as `dateModified`, and then be preserved forever;
- **tags** authored as an array of at most 100 unique, non-empty strings. Values
  are never coerced; commas are refused because Notion uses them to separate
  options, as are tags with no usable `/blog/tag/…` slug and distinct names that
  collapse onto the same slug;
- a **body**, since a page with nothing in it is a page the sync refuses to
  publish;
- a **slug** short enough to name a file: `content/blog/<slug>.mdx` and
  `public/images/blog/<slug>/` are path components, and every filesystem this
  repo is written on caps one at 255 **bytes**. A long Notion title slugifies
  straight past that, and the write only fails once earlier posts have already
  been written;
- and the **database schema** itself: a title property, `Slug`, `Excerpt`,
  `Tags` and `Published` each of the type the migration writes into, and a
  `Status` in one of its two shapes carrying both of the options the run needs.
  A schema that is set up for something else is reported by property, by type
  and by how many options the `Status` offers — never by the option names
  themselves, which are words somebody typed into a picker and which these
  messages would otherwise print into a log.

Every problem across every post and the schema is reported together, and a run
that finds one **writes nothing at all**.

### What the run reads off the disk

The migration's input is `content/blog/*.mdx`, and reading it is an *upload*, so
the tree is walked rather than trusted: every directory between the repo and a
post is examined immediately before it is stepped through, and a post is only
read if it is a regular file with a single name. A `content` or `content/blog`
that has become a symbolic link, a post that is a link to somewhere outside the
repo, or a post that is a second name — a **hard** link, which no open flag
refuses and which `lstat` reports as an ordinary file — stops the run rather
than being read and published to a Notion page. So does a tree that changed
between the listing and the read, and so does a post the run may not open: "I
was not allowed to look" is never answered with "there is nothing there". A
missing `content/blog` is refused too, because a migration is defined by that
directory — a checkout without one is not a blog with nothing in it. This is the
same walk the content sync uses (`src/lib/notion/safe-fs.ts`).

### What the run checks while it is writing

The plan above is built from a read that is already old by the time the first
block is appended, and a Notion page can be edited between any two requests —
by you on your phone, by a second copy of this script, by anything else holding
the token. Notion has no transaction, no conditional write and no if-match, so
the strongest protocol available is to look again, as late as possible, and to
refuse anything that has moved:

- **immediately before a page is created**, the database is queried again for
  the slug it is about to claim. The plan said the slug was free, but that read
  is as old as the run: a page claiming it can have appeared since, and creating
  anyway is how two Notion pages come to hold one slug — which the sync refuses
  to publish and which no later run can plan against until somebody deletes a
  page by hand. A resumed draft is checked the same way, and has to still be the
  only page claiming its slug;
- **before every append** and **immediately before the promotion**, the page is
  read back in full — its metadata, its status, its `last_edited_time` either
  side of the block walk, and its whole paginated block tree. It has to still be
  a **Draft**, still carry this post's title and slug, still have its Status in
  the shape the database schema said, and hold exactly the blocks this run has
  written so far and nothing else. Anything else stops the run without another
  write, naming the file and the page;
- a resumed draft's **date, excerpt and tags** are the post's frontmatter and
  the migration's to write, so where they have drifted they are put back — in
  one request, while the page is still a Draft the site cannot see — and the
  whole page is then read again before the promotion. Its **title** and **slug**
  are not: those are what say the page is this post at all, so a page carrying
  somebody else's is refused rather than overwritten;
- **immediately before the promotion**, the database is also asked once more
  who claims this post's slug. The page itself cannot answer that, and the
  claim was last checked a whole post ago: a duplicate that appeared in between
  would be published into a collision, and the sync refuses to publish *at all*
  while two live pages share one slug. Another claimant leaves the page a Draft
  and stops the run;
- **after the promotion**, everything is read once more, and the slug is asked
  about again — the promotion has its own one-request window, and a duplicate
  that lands inside it is caught here. A page that is not exactly this post —
  wrong status, wrong metadata, a block somebody added — or that is now one of
  two claimants is **demoted straight back to Draft**, which takes it off the
  site again, and the run fails saying so. If even the demotion fails, the
  message says the page is still Published and has to be put back by hand. If
  the *query* is what failed, nothing is demoted: an unanswered question is not
  evidence of a duplicate, so the run says what it could not check and leaves
  the proved page published;
- **when the promotion itself fails**, nothing is assumed. `pages.update` has no
  idempotency key, so a `502`, a `504` or a dropped connection leaves two
  possibilities that look identical from here: the request never landed, or it
  landed and the answer was lost. The page is therefore read back — the same
  full read, retried, because this is the read the answer depends on — and what
  it says is what the run says. **Published**: the write did land, so the page
  gets exactly the proof above, demotion included, and the run carries on.
  **Draft**: proved, and reported as the plain failure it is. **Anything else**:
  reported as what it actually reads, and left alone. **Unreadable**: reported as
  unknown, and *nothing is written* — a `Status` set over a page nothing here
  could read is the same guess in the other direction, and it would silently
  overwrite a state somebody else has since chosen. The message says which two
  possibilities the run is stuck between and what each answer means when the
  page is opened. The run never calls a page a Draft it has not read, and never
  writes one it cannot justify;
- **the demotion is only ever made off a read that has just proved the page is
  Published and on the site.** That is the one state it is the undo for. A page
  somebody demoted, moved into a status of their own, trashed or archived inside
  the promotion's window is not on the site — there is nothing to take off it —
  so it is reported as what it now reads and left exactly as it is.

Two runs inside one process are serialized against each other by a lock, so
they cannot interleave their reads and writes.

**Retries are split by what a request does.** The Notion SDK retries by itself
by default — a `429` *and* a `529` on every method, `POST` and `PATCH`
included — so that is turned off at construction and every repeated request is
one this repo chose to make. A read — a data source query, a page retrieve, a
block children list, a schema or database read — changes nothing, so a
transient `500`, `502`, `503`, `504` or `529` is retried on the same capped
`Retry-After` backoff as a `429`; giving up on the first one turns a bad minute
of Notion's day into "these posts could not be read", which is what `--check`
reports to CI. A **write** is not retried on any of those: a 5xx on
`pages.create` does not say whether the page was created, and repeating it is
how one post becomes two pages claiming one slug. Only a `429`, which promises
the request never landed, is waited out. A request that ran out of time splits
the same way, and for the same reason: repeated on a read, never on a write. The
run stops instead — and re-running it is safe by design.

**The rate limit belongs to the integration, so one scheduler holds it.**
Notion allows an integration roughly three requests a second. Bounding the
fan-out at three bounds *concurrency*, which is not a rate — three workers each
answered in 40ms is seventy-five requests a second — and a retry wrapper bounds
one call's repeats, so a `429` answered to one worker was invisible to the other
two, which carried on into the same wall. So every request a client makes goes
through one scheduler in front of the HTTP layer (`src/lib/notion/rate-limit.ts`):
slots are handed out one per interval and in the order they were asked for, so
the run's average stays under the limit however many workers there are and
however fast Notion answers — retries included, because a retry is a request. A
`429` or a `529` read off any response holds back everything queued behind it
until `Retry-After` says the integration may talk again, or, where Notion sends
no header, until a jittered exponential back-off does: doubling from one second,
capped at the same 60s ceiling every wait here is under, and reset the moment a
request is answered normally. The pause and a caller's own `Retry-After` back-off
are the same number started at the same moment, so they overlap rather than add.
The clock, the sleep and the jitter are all injectable, which is how the timing
is tested without spending it. The per-request deadline moves with the pacing:
the SDK starts its own timer the moment it calls `fetch`, and the wait for a
slot happens inside that call, so its timer would count the pause against the
request it was holding back — one `Retry-After: 60` aborting every request
queued behind it, as an error carrying no status that no policy here repeats.
The deadline is applied once the slot is granted instead, so a request still has
sixty seconds to be answered and a pause costs it none of them.

**A deadline covers the answer, not just the headers.** The SDK reads a response
with `await response.text()`, which happens after `fetch` has already resolved —
so a host that answered `200 OK` and then stopped sending was under no clock at
all, and that read is owed forever: the scheduled sync sat on a runner until the
job timed out, having written nothing, with the slot spent and the socket still
open. So one budget covers the whole request — the fetch, the headers, and every
byte of the body — and the response handed to the SDK is bound to it: its body
is read under the deadline, and the timer comes off when the body ends, is
cancelled, or fails. It is enforced with an `AbortController`, because rejecting
a promise stops nothing; a request this side has given up on is aborted rather
than left in flight. The error is still the SDK's own `RequestTimeoutError`, so
its code and message are unchanged. What may be *repeated* after one splits the
same way everything else does: a read is sent again — reading twice leaves
Notion exactly as it was, and the alternative is one stalled socket costing a
post — and a write never is, because a timeout says nothing about whether the
request landed.

**The limit, honestly.** Between the last read and the write it justified there
is one round-trip in which somebody else can still change the page, and Notion
offers no way to say "apply this only if the page is still the version I read".
That window cannot be closed from here. What the protocol does is make it one
request wide instead of a whole run wide, re-examine it at every later check,
and catch whatever fell into the last one with the read after the promotion —
which is why that page is demoted rather than left published. Two runs in two
*processes* meet exactly these checks and nothing stronger.

The checking costs requests: every append and the promotion are each preceded by
a full read of the page. This is a one-shot script, so that trade is made
without hesitation.

**A page that is off the site holds no slug.** Notion says where a page stands
in three fields, and they are not two names for one thing: `in_trash` (with
`archived` as its pre-2026-03-11 spelling) says the page is in the trash, and
`is_archived` says it is archived — not trashed, not deleted, and not on the
site either. All three are read together, everywhere: the sync never publishes
such a page and never revalidates one into a post, and the migration never
resumes, appends to, repairs, promotes, demotes or counts one as claiming a
slug. So trashing *or* archiving a page and re-running is how a single post is
redone from scratch.

**Pause the sync workflow first.** `sync-content.yml` runs every ten minutes and
removes the `content/blog/*.mdx` of any post Notion has not published — which is
the correct behaviour for unpublishing a post, and exactly the wrong one
mid-migration: it deletes the very file a killed run needs in order to finish
its draft. Disable the workflow (or run the migration and let it finish) before
starting. If a file does go missing, restore it from git and run the migration
again; every draft it finds that no local file claims is listed at the end of
the run, by slug.

Inline formatting travels with the text: code spans, bold, italic, underline,
strikethrough and links become the annotations a Notion page stores rather than
the characters that spell them. Block structure travels too — headings,
numbered and bulleted lists (nested included), to-dos, quotes, dividers, code
fences and tables all migrate as the blocks they are. A table is recognized the
way GFM defines one and the way the site renders one: by the **delimiter row**
under its header, with the outer pipes optional on every row and the two rows
agreeing about how many cells there are. `Command | What it does` over
`------- | ------------` is a table, whether or not anybody drew the edges; a
paragraph that merely contains pipes stays a paragraph, and `---` under a line
of prose is still the setext heading Notion has no level for. Alignment markers
are read and dropped, since a Notion table has no per-column alignment.

Markdown cannot tell some Notion blocks apart, so three come back as the shape
that renders identically rather than as a guess: a callout migrates back as a
quote (its icon is already part of the text), a bookmark as a paragraph holding
its link, and a toggle — or a toggleable heading — as its own text followed by
its children as siblings.

Notion's size limits are measured before anything is sent. Every create or
append carries at most 100 top-level blocks, 1000 block elements across their
nested subtrees, and 500KB of serialized UTF-8 JSON. The create request's page
properties count toward those bytes, so it may carry fewer blocks than a later
append; batches are chosen adaptively and stay in order. A run of text longer
than 2000 characters is split into as many runs as it needs, each keeping the
same annotations and link. If one atomic subtree cannot fit, the whole run is
refused before a page exists. If anything fails once a page does exist, it is
left exactly as it is — an unpublished draft the site never shows — because the
blocks that did land are what the next run resumes from. Run the migration again
to finish it.

Anything with no equivalent in a Notion block or run — an image, a reference
link, a link title, arbitrary HTML, a `#` heading, an indented code block, a
list nested three deep, a fence that never closes, a paragraph needing more
than 100 formatting runs, a link longer than 2000 characters — stops the run
before the first page is created, naming the file, the line number and (for
inline markdown) the offset it choked on. It does **not** repeat the line
itself: that message is printed to a terminal and, from CI, to a public log,
and the one line in a post that reaches a refusal is by definition the odd one
— a link pasted with a session token still in its query, a snippet holding a
key, a paragraph pasted out of a terminal. A category and a location say where
to look without saying what is there. Every post is checked, not just the first
bad one, and nothing is downgraded to a paragraph behind your back.

The same rule holds for **metadata**, in both directions. A post's title, date,
excerpt, tags and slug are values somebody typed into a page or a frontmatter
block, and the ones that reach a refusal are the odd ones — the date that will
not parse because a query string is still stuck to it, the tag with a comma in
it because it came out of a config file, the title of the draft that turns out
not to be this post. So a validation or migration error names the **field**, the
**file** or the **page id** it is on, an **index** into a list, a **length**, a
**count** and a **category** of what is wrong, and never the value itself: `page
<id>: excerpt is 540 chars (max 200)`, `page <id>: tag #2 contains a comma`, `2
different Notion pages claim one slug (<id>, <id>)`. Everything needed to open
the right page and fix the right line, and nothing that republishes what is
already being refused.

And the same rule holds for a **pagination cursor**, which is nobody's typing at
all: it is an opaque token Notion issues and this repo hands straight back
without reading, so the honest assumption about what is inside one is the worst
one. A walk that stops — because a list promised more results and handed back no
cursor to follow, or handed back one it had already followed — says which list,
which **page number** it stopped on and which of those two things happened, and
never the token. Where Notion refuses a cursor and quotes it back in its own
error message, the value is scrubbed out of everything that error carries — its
message, its stack, the raw body the SDK keeps on it — while its status and
everything else a caller reads are left exactly as they were.

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
