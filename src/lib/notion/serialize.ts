import type { PostFrontmatter } from "./types";

// Frontmatter key order is fixed so identical content always serializes to
// identical bytes — a prerequisite for the sync being idempotent (spec §7).
const KEY_ORDER = ["title", "date", "excerpt", "tags", "updated"] as const;

// YAML's double-quoted scalars accept JSON's escape syntax exactly, so
// JSON.stringify already produces a valid — and deterministic — YAML scalar:
// it escapes quotes, backslashes, newlines, and every C0 control character as
// \uXXXX. That matters because Notion property values are free text: a title
// pasted with a line break used to fold into a space, and one containing a
// line reading `---` ended the frontmatter block early, since gray-matter
// splits on that delimiter before YAML ever runs.
//
// JSON leaves a few characters literal that YAML treats as non-printable (DEL,
// the C1 range) or as line breaks (U+2028/U+2029, plus the BOM), so those are
// escaped on top.
const EXTRA_ESCAPES = /[\u007f-\u009f\u2028\u2029\ufeff]/g;

function quote(value: string): string {
  return JSON.stringify(value).replace(
    EXTRA_ESCAPES,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
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
