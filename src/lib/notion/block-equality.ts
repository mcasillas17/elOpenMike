import type { BlockObjectRequest } from "@notionhq/client";
import type { MdBlock } from "./types";

// Resuming a page means appending to blocks somebody else could have written.
// The only thing that makes that safe is proving the blocks already on the page
// are exactly the blocks this migration would have written first — an exact
// prefix of the post, nested children and all. Anything else is somebody's
// draft, and the run says so rather than appending to it.
//
// A request and a response are not the same object: Notion answers with every
// annotation spelled out, a colour on every block, `plain_text` beside the
// text, and defaults the request never carried. So both sides are projected
// onto the same canonical shape — the fields the migration actually writes —
// and compared there.
//
// The projection is deliberately narrow. A block type the migration never
// writes, a colour that is not the default, a toggleable heading, a caption
// nobody asked for: none of them can be produced by this migration, so each one
// is read as divergence rather than ignored. Being wrong in that direction
// costs a message; being wrong in the other costs somebody's writing.

type CanonicalRun = {
  text: string;
  href: string | null;
  marks: string;
};

type CanonicalBlock = {
  type: string;
  fields: string;
  children: CanonicalBlock[];
};

export type PrefixMatch =
  | { kind: "prefix"; matched: number }
  | { kind: "diverged"; index: number; reason: string };

const ANNOTATIONS = [
  "bold",
  "code",
  "italic",
  "strikethrough",
  "underline",
] as const;

function marksOf(annotations: Record<string, unknown> | undefined): string {
  return ANNOTATIONS.filter((name) => annotations?.[name] === true).join("|");
}

// Two runs carrying the same formatting and the same link are one run: Notion
// stores the text and renders them flush, and the migration itself splits a run
// longer than 2000 characters into several. Merging before comparing is what
// lets a long paragraph be recognized at all.
function mergeRuns(runs: CanonicalRun[]): CanonicalRun[] {
  const merged: CanonicalRun[] = [];

  for (const run of runs) {
    if (run.text === "") continue;
    const last = merged[merged.length - 1];
    if (last && last.marks === run.marks && last.href === run.href) {
      merged[merged.length - 1] = { ...last, text: last.text + run.text };
      continue;
    }
    merged.push(run);
  }

  return merged;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// A request's runs. Anything but a plain text run — a mention, an equation — is
// outside what the converter produces, so it cannot be matched.
function requestRuns(value: unknown): CanonicalRun[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const runs: CanonicalRun[] = [];

  for (const item of value) {
    if (!isRecord(item) || !isRecord(item.text)) return undefined;
    const link = item.text.link;
    runs.push({
      text: String(item.text.content ?? ""),
      href: isRecord(link) ? String(link.url ?? "") : null,
      marks: marksOf(item.annotations as Record<string, unknown> | undefined),
    });
  }

  return mergeRuns(runs);
}

// A response's runs. A colour is formatting the migration never writes, so a
// coloured run is another author's, not an unfinished one of ours.
function responseRuns(value: unknown): CanonicalRun[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const runs: CanonicalRun[] = [];

  for (const item of value) {
    if (!isRecord(item) || item.type !== "text") return undefined;
    const annotations = isRecord(item.annotations) ? item.annotations : undefined;
    const color = annotations?.color;
    if (color !== undefined && color !== "default") return undefined;

    const text = isRecord(item.text) ? item.text : undefined;
    runs.push({
      text: String(item.plain_text ?? text?.content ?? ""),
      href: typeof item.href === "string" ? item.href : null,
      marks: marksOf(annotations),
    });
  }

  return mergeRuns(runs);
}

// Every block type the migration writes, and the fields that make one of them
// what it is. A type missing from here is a type the migration cannot have
// produced.
const RICH_TEXT_ONLY = [
  "paragraph",
  "quote",
  "heading_1",
  "heading_2",
  "heading_3",
  "bulleted_list_item",
  "numbered_list_item",
] as const;

const SUPPORTED = new Set<string>([
  ...RICH_TEXT_ONLY,
  "to_do",
  "code",
  "divider",
  "table",
  "table_row",
]);

type Runs = (value: unknown) => CanonicalRun[] | undefined;

// The comparable fields of one block, in a fixed order so the JSON is stable.
function fieldsOf(
  type: string,
  payload: Record<string, unknown>,
  runs: Runs,
): string | undefined {
  if (type === "divider") return JSON.stringify([]);

  if (type === "table") {
    return JSON.stringify([
      Number(payload.table_width),
      payload.has_column_header === true,
      payload.has_row_header === true,
    ]);
  }

  if (type === "table_row") {
    if (!Array.isArray(payload.cells)) return undefined;
    const cells: CanonicalRun[][] = [];
    for (const cell of payload.cells) {
      const canonical = runs(cell);
      if (!canonical) return undefined;
      cells.push(canonical);
    }
    return JSON.stringify([cells]);
  }

  const rich = runs(payload.rich_text);
  if (!rich) return undefined;
  const parts: unknown[] = [rich];

  if (type === "to_do") parts.push(payload.checked === true);
  if (type === "code") {
    // A caption is not something the migration writes; one on the page is a
    // change to the block rather than an unfinished write of it.
    const caption = payload.caption;
    if (Array.isArray(caption) && caption.length > 0) return undefined;
    parts.push(String(payload.language ?? ""));
  }

  return JSON.stringify(parts);
}

function canonicalize(
  type: string,
  payload: Record<string, unknown> | undefined,
  children: unknown[],
  runs: Runs,
  descend: (child: unknown) => CanonicalBlock | undefined,
): CanonicalBlock | undefined {
  if (!SUPPORTED.has(type) || !payload) return undefined;

  const fields = fieldsOf(type, payload, runs);
  if (fields === undefined) return undefined;

  const canonicalChildren: CanonicalBlock[] = [];
  for (const child of children) {
    const canonical = descend(child);
    if (!canonical) return undefined;
    canonicalChildren.push(canonical);
  }

  return { type, fields, children: canonicalChildren };
}

export function canonicalizeRequest(
  block: BlockObjectRequest,
): CanonicalBlock | undefined {
  if (!isRecord(block)) return undefined;
  // A block names its own type twice: once in `type`, once as the key its body
  // hangs off. The SDK's union carries no index signature, so the body is read
  // structurally.
  const record = block as unknown as Record<string, unknown>;
  const type = String(record.type ?? "");
  const payload = isRecord(record[type]) ? record[type] : undefined;
  const children = Array.isArray(payload?.children) ? payload.children : [];

  return canonicalize(type, payload, children, requestRuns, (child) =>
    canonicalizeRequest(child as BlockObjectRequest),
  );
}

export function canonicalizeResponse(
  block: MdBlock,
): CanonicalBlock | undefined {
  if (!isRecord(block)) return undefined;
  const type = String(block.type ?? "");
  const payload = isRecord(block[type]) ? block[type] : undefined;

  // Colour and toggling are formatting the migration never writes; a block
  // carrying either was styled by hand.
  if (payload) {
    const color = payload.color;
    if (color !== undefined && color !== "default") return undefined;
    if (payload.is_toggleable === true) return undefined;
  }

  return canonicalize(
    type,
    payload,
    block.children ?? [],
    responseRuns,
    (child) => canonicalizeResponse(child as MdBlock),
  );
}

function nameOf(
  canonical: CanonicalBlock | undefined,
  block: { type?: unknown },
): string {
  return canonical ? canonical.type : `an unrecognized ${String(block.type)}`;
}

// How much of `desired` the page already holds, or where it stopped being this
// post. `matched` counts whole top-level blocks, and every one of them — with
// everything nested under it — is identical to the post's.
export function matchBlockPrefix(
  desired: readonly BlockObjectRequest[],
  remote: readonly MdBlock[],
): PrefixMatch {
  if (remote.length > desired.length) {
    return {
      kind: "diverged",
      index: desired.length,
      reason:
        `the page holds ${remote.length} blocks where the post has ` +
        `${desired.length}, so it is not an unfinished copy of it`,
    };
  }

  for (const [index, block] of remote.entries()) {
    const here = canonicalizeResponse(block);
    const there = canonicalizeRequest(desired[index]);

    if (!here || !there || JSON.stringify(here) !== JSON.stringify(there)) {
      return {
        kind: "diverged",
        index,
        reason:
          `block ${index + 1} on the page is ${nameOf(here, block)} where ` +
          `the post has ${nameOf(there, desired[index] as { type?: unknown })}`,
      };
    }
  }

  return { kind: "prefix", matched: remote.length };
}
