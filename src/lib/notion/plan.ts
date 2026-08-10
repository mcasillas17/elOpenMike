import type { PostFrontmatter } from "./types";
import {
  serializePost,
  contentProjection,
  frontmatterLines,
  resolveUpdated,
} from "./serialize";
import type { ReconcilePlan } from "./reconcile";

export type RenderedPost = {
  slug: string;
  frontmatter: PostFrontmatter;
  body: string;
};

const UPDATED_PREFIX = 'updated: "';

const POST_FILE = /^content\/blog\/(.*)\.mdx$/;

export function postPath(slug: string): string {
  return `content/blog/${slug}.mdx`;
}

// The inverse of postPath. A path that is not a post file yields "", which
// never matches a real slug.
export function postSlug(file: string): string {
  return POST_FILE.exec(file)?.[1] ?? "";
}

// Reads the `updated` value back out of a serialized post's frontmatter. A
// line in the body that happens to share the shape is prose, not metadata.
export function existingUpdated(mdx: string | undefined): string | undefined {
  const line = frontmatterLines(mdx ?? "").find((candidate) =>
    candidate.startsWith(UPDATED_PREFIX),
  );
  return line?.slice(UPDATED_PREFIX.length, -1);
}

// Builds the file set the sync wants on disk.
//
// Notion's last_edited_time moves whenever a page is merely opened, so the new
// timestamp is adopted only when the content itself changed (spec §7). Without
// this the 10-minute cron would commit and redeploy on every no-op edit.
export function desiredFiles(
  posts: RenderedPost[],
  existing: Map<string, string>,
): Map<string, string> {
  const desired = new Map<string, string>();

  for (const post of posts) {
    const file = postPath(post.slug);
    const onDisk = existing.get(file);
    const candidate = serializePost(post.frontmatter, post.body);

    const unchanged =
      onDisk !== undefined &&
      contentProjection(candidate) === contentProjection(onDisk);
    const updated = unchanged
      ? resolveUpdated(post.frontmatter.updated, existingUpdated(onDisk))
      : post.frontmatter.updated;

    desired.set(file, serializePost({ ...post.frontmatter, updated }, post.body));
  }

  return desired;
}

// A run that removes most of the blog is far likelier to be a Notion schema or
// permission change than a real bulk unpublish: isPublished() matches the
// property name and its option literally, so renaming either yields zero
// published pages with no error. Deleting on that signal would wipe every post
// and push the deletion, which deploys it.
export const MASS_DELETE_RATIO = 0.5;

export function massDeleteError(
  plan: ReconcilePlan,
  existingCount: number,
): string | undefined {
  if (plan.delete.length === 0 || existingCount === 0) return undefined;
  if (plan.delete.length <= Math.floor(existingCount * MASS_DELETE_RATIO)) {
    return undefined;
  }
  return (
    `refusing to delete ${plan.delete.length} of ${existingCount} post(s) — ` +
    "this usually means the Notion Status property or its \"Published\" option " +
    "was renamed, or the integration lost access. Re-run with " +
    "--allow-mass-delete if the removal is intentional."
  );
}
