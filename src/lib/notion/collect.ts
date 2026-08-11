import type { PageObject } from "./client";
import { isPartialBlockError } from "./block-shape";
import { isPublished, pageSlug, toPostSource } from "./fetch-post";
import { mapWithConcurrency, MAX_CONCURRENT_REQUESTS } from "./pool";
import type { MdBlock, PostFailure, PostSource } from "./types";

// The query that selects published pages and the walk that fetches their blocks
// are separate round-trips, and a page can be edited or unpublished in between:
// a post can be flipped to Draft, or rewritten, while its own block tree is
// still loading. Publishing the blocks anyway puts content on the site that no
// longer matches the page it came from — in the Draft case, content the author
// has already taken down.
//
// So the metadata is read a second time once the blocks are in hand, and the
// post is only accepted if the page still reads Published, is not in the trash,
// and reports the same last_edited_time as the snapshot the query returned.
// Notion moves last_edited_time on any edit, so equality is the version check.
//
// Snapshot limitation: Notion exposes no conditional read (no ETag, no
// if-match), so this narrows the window to the revalidation round-trip rather
// than closing it — an edit landing after the second read is still possible and
// is corrected by the next run. What it does guarantee is that nothing is
// published on the strength of metadata observed *before* the blocks were read.

export type Revalidation = { ok: true } | { ok: false; message: string };

export function revalidatePage(
  before: PageObject,
  after: PageObject,
): Revalidation {
  if (after.archived === true || after.in_trash === true) {
    return {
      ok: false,
      message:
        "page was moved to the Notion trash while its blocks were loading — " +
        "nothing published for it this run",
    };
  }

  if (!isPublished(after)) {
    return {
      ok: false,
      message:
        "page is no longer Published — its status changed while its blocks " +
        "were loading, so nothing was published for it this run",
    };
  }

  if (after.last_edited_time !== before.last_edited_time) {
    return {
      ok: false,
      message:
        "page was edited while its blocks were loading " +
        `(last_edited_time ${before.last_edited_time} → ${after.last_edited_time}) — ` +
        "skipped rather than publishing a half-old snapshot",
    };
  }

  return { ok: true };
}

export type CollectDeps = {
  fetchBlocks: (pageId: string) => Promise<MdBlock[]>;
  retrievePage: (pageId: string) => Promise<PageObject>;
  limit?: number;
};

export type CollectOutcome = {
  sources: PostSource[];
  failures: PostFailure[];
};

type Collected =
  | { ok: true; source: PostSource }
  | { ok: false; failure: PostFailure };

// Fetches and revalidates every published page under the same bounded fan-out
// the rest of the sync uses (Notion allows ~3 requests/second per integration).
//
// A page that fails revalidation — or whose current state cannot be read at all
// — is reported as a per-post failure rather than rejected out of the pool: an
// author unpublishing one post mid-run must not take the other posts' sync down
// with it, and the failure carries the same preserve-or-skip meaning as an
// image that would not download.
//
// A block tree that came back with a partial block in it is the same kind of
// problem and gets the same treatment: that one post cannot be published, its
// file on disk is kept, and `--check` fails on it. Any *other* block fetch
// failure still rejects the whole run, exactly as it did before: that is an
// integration or API problem, not one post's problem.
export async function collectSources(
  pages: PageObject[],
  { fetchBlocks, retrievePage, limit = MAX_CONCURRENT_REQUESTS }: CollectDeps,
): Promise<CollectOutcome> {
  const results = await mapWithConcurrency(
    pages,
    async (page): Promise<Collected> => {
      let blocks: MdBlock[];
      try {
        blocks = await fetchBlocks(page.id);
      } catch (error: unknown) {
        if (!isPartialBlockError(error)) throw error;
        return {
          ok: false,
          failure: failureFor(
            page,
            error instanceof Error ? error.message : String(error),
          ),
        };
      }

      // The snapshot's properties are what the pre-fetch slug-collision guard
      // checked, so the accepted post is built from them; `after` only decides
      // whether the snapshot is still good.
      let after: PageObject;
      try {
        after = await retrievePage(page.id);
      } catch (error: unknown) {
        return {
          ok: false,
          failure: failureFor(
            page,
            "could not confirm the page is still Published: " +
              (error instanceof Error ? error.message : String(error)),
          ),
        };
      }

      const verdict = revalidatePage(page, after);
      return verdict.ok
        ? { ok: true, source: toPostSource(page, blocks) }
        : { ok: false, failure: failureFor(page, verdict.message) };
    },
    limit,
  );

  const outcome: CollectOutcome = { sources: [], failures: [] };
  for (const result of results) {
    if (result.ok) outcome.sources.push(result.source);
    else outcome.failures.push(result.failure);
  }
  return outcome;
}

function failureFor(page: PageObject, message: string): PostFailure {
  return { slug: pageSlug(page), pageId: page.id, message };
}
