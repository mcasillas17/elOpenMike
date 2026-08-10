import { blocksToMarkdown } from "./blocks-to-md";
import { imageDir, imageFileName } from "./images";
import { planReconcile, type ReconcilePlan } from "./reconcile";
import { desiredFiles, postPath, postSlug, type RenderedPost } from "./plan";
import type { MdBlock, PostSource } from "./types";

// One post failing — an image whose signed URL expired mid-run, a host that
// refuses the fetch — used to reject out of the whole sync, so a single bad
// image meant nothing at all synced. Rendering is therefore per-post: a failure
// is recorded against that post and the rest of the run continues.

export type ImageDownloader = (
  url: string,
) => Promise<{ bytes: Uint8Array; contentType: string }>;

export type PostFailure = { slug: string; pageId: string; message: string };

export type RenderOutcome = {
  rendered: RenderedPost[];
  images: Map<string, Uint8Array>;
  warnings: string[];
  failures: PostFailure[];
};

function imageUrl(block: MdBlock): string | undefined {
  const payload = block.image as
    | {
        type?: string;
        file?: { url: string };
        external?: { url: string };
      }
    | undefined;
  return payload?.file?.url ?? payload?.external?.url;
}

// Walks a post's block tree and downloads every image while its signed URL is
// still valid (they expire after one hour). Throws on the first failure: a post
// is published with all of its images or not at all.
async function capturePostImages(
  post: PostSource,
  download: ImageDownloader,
): Promise<{ paths: Map<string, string>; files: Map<string, Uint8Array> }> {
  const paths = new Map<string, string>();
  const files = new Map<string, Uint8Array>();

  const walk = async (blocks: MdBlock[]): Promise<void> => {
    for (const block of blocks) {
      if (block.type === "image") {
        const url = imageUrl(block);
        if (url) {
          const { bytes, contentType } = await download(url);
          const name = imageFileName(bytes, contentType);
          files.set(`${imageDir(post.slug)}/${name}`, bytes);
          paths.set(block.id, `/images/blog/${post.slug}/${name}`);
        }
      }
      await walk(block.children);
    }
  };

  await walk(post.blocks);
  return { paths, files };
}

// Renders every post, isolating failures. A post's images are only merged into
// the shared set once that post has rendered completely, so a half-downloaded
// post never leaves stray files behind.
export async function renderPosts(
  sources: PostSource[],
  download: ImageDownloader,
): Promise<RenderOutcome> {
  const outcome: RenderOutcome = {
    rendered: [],
    images: new Map(),
    warnings: [],
    failures: [],
  };

  for (const post of sources) {
    try {
      const { paths, files } = await capturePostImages(post, download);
      const warnings: string[] = [];
      const body = blocksToMarkdown(post.blocks, {
        imagePath: (id) => paths.get(id) ?? "",
        onWarning: (message) => warnings.push(`${post.slug}: ${message}`),
      });

      for (const [file, bytes] of files) outcome.images.set(file, bytes);
      outcome.warnings.push(...warnings);
      outcome.rendered.push({
        slug: post.slug,
        frontmatter: post.frontmatter,
        body,
      });
    } catch (error: unknown) {
      outcome.failures.push({
        slug: post.slug,
        pageId: post.pageId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return outcome;
}

export type SyncPlan = {
  desired: Map<string, string>;
  plan: ReconcilePlan;
  // Failed posts already on disk, left exactly as they are.
  preserved: string[];
  // Failed posts with nothing on disk yet — nothing to publish, nothing to keep.
  skipped: string[];
  // Files no published post claims, kept anyway because a failure this run
  // makes "unclaimed" indistinguishable from "not seen".
  deferred: string[];
};

// Builds the file set to write. A post that failed to render keeps whatever is
// already on disk: it is copied into the desired set verbatim so reconcile sees
// it as unchanged. Leaving it out instead would queue it for deletion — and a
// Notion-wide image outage would then read as "every post was unpublished" and
// blow through the mass-delete guard.
//
// Matching a failure to its file by slug is only half the story, because
// nothing on disk records which Notion page wrote which file. When a page whose
// slug changed fails to render, the file under its *old* slug is not the failed
// post's file and not an unpublished post either — it is live content this run
// simply never saw, and it is indistinguishable from a genuine orphan. So any
// failure at all freezes deletion for the whole run: every unclaimed file is
// carried over verbatim. A real unpublish is picked up by the next clean run,
// which costs one cron tick; deleting live content costs a deploy.
export function planSync(
  outcome: RenderOutcome,
  existing: Map<string, string>,
): SyncPlan {
  const desired = desiredFiles(outcome.rendered, existing);
  const preserved: string[] = [];
  const skipped: string[] = [];
  const deferred: string[] = [];

  for (const failure of outcome.failures) {
    const file = postPath(failure.slug);
    const onDisk = existing.get(file);
    if (onDisk === undefined) {
      skipped.push(failure.slug);
      continue;
    }
    // A post that rendered under this slug wins; a failure must never overwrite
    // fresh content with the stale file.
    if (!desired.has(file)) {
      desired.set(file, onDisk);
      preserved.push(failure.slug);
    }
  }

  if (outcome.failures.length > 0) {
    for (const [file, contents] of existing) {
      if (desired.has(file)) continue;
      desired.set(file, contents);
      deferred.push(file);
    }
  }

  return {
    desired,
    plan: planReconcile(desired, existing),
    preserved: preserved.sort(),
    skipped: skipped.sort(),
    deferred: deferred.sort(),
  };
}

// Image directories the pruner must not touch. A preserved post's images are
// still referenced by the file kept on disk but were never downloaded this run;
// a skipped post may have a half-written directory from an earlier attempt; a
// deferred file may belong to a live post whose slug moved. None of them were
// observed this run, so none of them may be pruned.
export function protectedImageDirs(plan: SyncPlan): string[] {
  const slugs = [
    ...plan.preserved,
    ...plan.skipped,
    ...plan.deferred.map(postSlug),
  ];
  return [...new Set(slugs)].sort().map(imageDir);
}
