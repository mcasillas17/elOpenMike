import type { PostFrontmatter } from "./types";

// Frontmatter key order is fixed so identical content always serializes to
// identical bytes — a prerequisite for the sync being idempotent (spec §7).
const KEY_ORDER = ["title", "date", "excerpt", "tags", "updated"] as const;

function quote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function serializePost(fm: PostFrontmatter, body: string): string {
  const lines = KEY_ORDER.map((key) =>
    key === "tags"
      ? `tags: [${fm.tags.map(quote).join(", ")}]`
      : `${key}: ${quote(fm[key])}`,
  );
  const normalizedBody = body.replace(/\r\n/g, "\n").replace(/\n+$/, "");
  return `---\n${lines.join("\n")}\n---\n\n${normalizedBody}\n`;
}

// The content-relevant view of a file: everything except `updated`. Two files
// with the same projection represent the same post, even if Notion's
// last_edited_time moved because the page was merely opened.
export function contentProjection(mdx: string): string {
  return mdx
    .split("\n")
    .filter((line) => !line.startsWith("updated: "))
    .join("\n");
}

// Preserve the on-disk `updated` when nothing about the content changed;
// otherwise adopt the new timestamp.
export function resolveUpdated(
  next: string,
  existing: string | undefined,
): string {
  return existing ?? next;
}
