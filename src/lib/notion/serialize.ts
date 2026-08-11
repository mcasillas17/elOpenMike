import type { PostFrontmatter } from "./types";
import { isValidDate } from "./validate";

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

// Markdown ends a line on CRLF and on a lone carriage return as readily as on
// a newline, so all three are written out as the one the repo stores.
const OTHER_LINE_ENDINGS = /\r\n|\r/g;

export function serializePost(fm: PostFrontmatter, body: string): string {
  const lines = KEY_ORDER.map((key) =>
    key === "tags"
      ? `tags: [${fm.tags.map(quote).join(", ")}]`
      : `${key}: ${quote(fm[key])}`,
  );
  const normalizedBody = body.replace(OTHER_LINE_ENDINGS, "\n").replace(/\n+$/, "");
  return `---\n${lines.join("\n")}\n---\n\n${normalizedBody}\n`;
}

const UPDATED_LINE = "updated: ";

// The span of the opening frontmatter block's contents, between the two `---`
// delimiter lines. Returns undefined when the file does not open with a
// frontmatter block or never closes one, so an unrecognized file is left alone
// rather than partially rewritten.
function frontmatterRange(
  mdx: string,
): { start: number; end: number } | undefined {
  const lines = mdx.split("\n");
  const delimiter = (line: string) => line.replace(/\r$/, "") === "---";
  if (lines.length === 0 || !delimiter(lines[0])) return undefined;

  let offset = lines[0].length + 1;
  const start = offset;
  for (let i = 1; i < lines.length; i++) {
    if (delimiter(lines[i])) return { start, end: offset };
    offset += lines[i].length + 1;
  }
  return undefined;
}

// The lines of the opening frontmatter block, or an empty list when there is
// no such block. Reading a frontmatter key anywhere else means reading the
// post's own prose.
export function frontmatterLines(mdx: string): string[] {
  const range = frontmatterRange(mdx);
  if (!range) return [];
  return mdx.slice(range.start, range.end).split("\n");
}

// The content-relevant view of a file: everything except `updated`. Two files
// with the same projection represent the same post, even if Notion's
// last_edited_time moved because the page was merely opened.
//
// `updated` is a frontmatter key, so only the frontmatter block is stripped:
// dropping every line in the file that began `updated: ` also dropped them from
// the body, and two posts whose bodies differed only in such a line projected
// identically — the sync then read a real edit as "nothing changed" and kept
// the stale timestamp. The body is copied through byte for byte.
export function contentProjection(mdx: string): string {
  const range = frontmatterRange(mdx);
  if (!range) return mdx;

  const kept = mdx
    .slice(range.start, range.end)
    .split("\n")
    .filter((line) => !line.startsWith(UPDATED_LINE))
    .join("\n");

  return mdx.slice(0, range.start) + kept + mdx.slice(range.end);
}

// Preserve the on-disk `updated` when nothing about the content changed;
// otherwise adopt the new timestamp.
//
// The on-disk value is only preserved if it is a date. It comes out of a file
// anyone can edit, and it is published as the sitemap's <lastmod> and the
// article's dateModified — so a value that is not a day would be handed to a
// crawler and, since the content still matches, carried over again every run
// after that. The value from Notion is always a real day, and is the answer
// when the file's is not.
export function resolveUpdated(
  next: string,
  existing: string | undefined,
): string {
  return existing !== undefined && isValidDate(existing) ? existing : next;
}
