import type { BlockObjectRequest } from "@notionhq/client";
import type { RichTextInput } from "./md-to-rich-text";

// Notion's API is not only a shape, it is a size. One request takes at most 100
// top-level children, 1000 block elements across their complete subtrees, and a
// 500KB serialized body; a rich-text array takes at most 100 elements, and one
// text run at most 2000 characters. The API rejects the whole request when any
// limit is exceeded, so one long post used to fail as a unit.
//
// The splittable limits are honored without losing anything:
//
//   * a run longer than 2000 characters is split into as many runs as it needs,
//     each carrying the same annotations and the same link, because Notion
//     stores a paragraph as a sequence of runs and renders them back to back;
//   * blocks are sent in order across as many create/append requests as their
//     top-level count, aggregate subtree count, and exact UTF-8 body size need.
//
// A rich-text array and one top-level block subtree are atomic: splitting either
// would change the block. An atomic value that does not fit is therefore refused
// by name, before anything is created.
//
// The character limits are Notion's published ones; the SDK types spell the
// shapes but carry no lengths, so they are stated here with the reason each one
// exists rather than derived.
export const MAX_CHILDREN_PER_REQUEST = 100;
export const MAX_BLOCK_ELEMENTS_PER_REQUEST = 1000;
export const MAX_REQUEST_BODY_BYTES = 500 * 1024;
export const MAX_RICH_TEXT_ITEMS = 100;
export const MAX_TEXT_CONTENT = 2000;
export const MAX_URL_LENGTH = 2000;

type TextItem = Extract<RichTextInput[number], { text: unknown }>;

function isTextItem(item: RichTextInput[number]): item is TextItem {
  return "text" in item;
}

// Two runs that carry the same annotations and the same link are one run as far
// as Notion is concerned: it stores the text and renders them flush. Merging
// them first is lossless and is what keeps a paragraph the converter happened
// to split — `<strong>a</strong>**b**` is one bold word written two ways — from
// counting against the hundred-element limit twice.
function runKey(item: TextItem): string {
  const annotations = item.annotations ?? {};
  const marks = Object.keys(annotations)
    .sort()
    .map((key) => `${key}=${String((annotations as Record<string, unknown>)[key])}`);
  return JSON.stringify([marks, item.text.link?.url ?? null]);
}

export function mergeIdenticalRuns(rich: RichTextInput): RichTextInput {
  const merged: RichTextInput = [];

  for (const item of rich) {
    const last = merged[merged.length - 1];
    if (
      isTextItem(item) &&
      last !== undefined &&
      isTextItem(last) &&
      runKey(last) === runKey(item)
    ) {
      merged[merged.length - 1] = {
        ...last,
        text: { ...last.text, content: last.text.content + item.text.content },
      };
      continue;
    }
    merged.push(item);
  }

  return merged;
}

// Splits at 2000 code units, but never between the two halves of a surrogate
// pair: the halves are not characters, and storing them apart would put two
// replacement characters into the page where one astral character was.
function splitContent(content: string): string[] {
  const pieces: string[] = [];
  let index = 0;

  while (index < content.length) {
    let take = Math.min(MAX_TEXT_CONTENT, content.length - index);
    const last = content.charCodeAt(index + take - 1);
    if (take > 1 && last >= 0xd800 && last <= 0xdbff) take -= 1;
    pieces.push(content.slice(index, index + take));
    index += take;
  }

  return pieces;
}

export function chunkLongRuns(rich: RichTextInput): RichTextInput {
  const chunked: RichTextInput = [];

  for (const item of rich) {
    if (!isTextItem(item) || item.text.content.length <= MAX_TEXT_CONTENT) {
      chunked.push(item);
      continue;
    }
    for (const content of splitContent(item.text.content)) {
      chunked.push({ ...item, text: { ...item.text, content } });
    }
  }

  return chunked;
}

export function normalizeRichText(rich: RichTextInput): RichTextInput {
  return chunkLongRuns(mergeIdenticalRuns(rich));
}

export function richTextProblems(rich: RichTextInput, where: string): string[] {
  const problems: string[] = [];

  if (rich.length > MAX_RICH_TEXT_ITEMS) {
    problems.push(
      `${where} needs ${rich.length} rich text runs, more than the ` +
        `${MAX_RICH_TEXT_ITEMS} Notion holds in one array — a run is one stretch ` +
        "of formatting, so shorten the line or split it into two blocks",
    );
  }

  for (const item of rich) {
    if (!isTextItem(item)) continue;
    if (item.text.content.length > MAX_TEXT_CONTENT) {
      problems.push(
        `${where} carries a ${item.text.content.length} character run, more ` +
          `than the ${MAX_TEXT_CONTENT} Notion stores in one`,
      );
    }
    const url = item.text.link?.url;
    if (url !== undefined && url.length > MAX_URL_LENGTH) {
      problems.push(
        `${where} carries a link of ${url.length} characters, more than the ` +
          `${MAX_URL_LENGTH} a Notion url holds`,
      );
    }
  }

  return problems;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function payloadOf(block: BlockObjectRequest): {
  type: string;
  payload: Record<string, unknown> | undefined;
} {
  const record = block as unknown as Record<string, unknown>;
  const type = String(record.type);
  const payload = record[type];
  return { type, payload: isRecord(payload) ? payload : undefined };
}

export function normalizeBlocks(
  blocks: BlockObjectRequest[],
): BlockObjectRequest[] {
  return blocks.map((block) => {
    const { type, payload } = payloadOf(block);
    if (!payload) return block;

    const next: Record<string, unknown> = { ...payload };
    if (Array.isArray(payload.rich_text)) {
      next.rich_text = normalizeRichText(payload.rich_text as RichTextInput);
    }
    if (Array.isArray(payload.caption)) {
      next.caption = normalizeRichText(payload.caption as RichTextInput);
    }
    if (Array.isArray(payload.cells)) {
      next.cells = (payload.cells as RichTextInput[]).map(normalizeRichText);
    }
    if (Array.isArray(payload.children)) {
      next.children = normalizeBlocks(payload.children as BlockObjectRequest[]);
    }

    return {
      ...(block as unknown as Record<string, unknown>),
      [type]: next,
    } as unknown as BlockObjectRequest;
  });
}

// Every size problem in a tree of blocks. Top-level blocks are not counted:
// those past the hundredth are appended after the page exists. A block's own
// children are, because they travel inside their parent and there is no request
// that could carry them separately.
export function blockProblems(
  blocks: BlockObjectRequest[],
  where: string,
  nested = false,
): string[] {
  const problems: string[] = [];

  if (nested && blocks.length > MAX_CHILDREN_PER_REQUEST) {
    problems.push(
      `${where} nests ${blocks.length} blocks under one block, more than the ` +
        `${MAX_CHILDREN_PER_REQUEST} children Notion creates in one request`,
    );
  }

  blocks.forEach((block, index) => {
    const { type, payload } = payloadOf(block);
    if (!payload) return;
    const at = `${where}: ${type} #${index + 1}`;

    if (Array.isArray(payload.rich_text)) {
      problems.push(
        ...richTextProblems(payload.rich_text as RichTextInput, at),
      );
    }
    if (Array.isArray(payload.caption)) {
      problems.push(
        ...richTextProblems(payload.caption as RichTextInput, `${at} caption`),
      );
    }
    if (Array.isArray(payload.cells)) {
      (payload.cells as RichTextInput[]).forEach((cell, column) => {
        problems.push(...richTextProblems(cell, `${at} cell #${column + 1}`));
      });
    }
    if (Array.isArray(payload.children)) {
      problems.push(
        ...blockProblems(payload.children as BlockObjectRequest[], at, true),
      );
    }
  });

  return problems;
}

export type ChildBatches = {
  // What the create-page request carries: at most one request's worth.
  children: BlockObjectRequest[];
  // Everything after that, in order, one append request each.
  appends: BlockObjectRequest[][];
};

export type AppendChildrenBody = { children: BlockObjectRequest[] };

// The SDK removes block_id into the request path and serializes this object as
// the append request body. Keeping that shape here lets the preflight measure
// the same bytes the executor sends.
export function appendChildrenBody(
  children: BlockObjectRequest[],
): AppendChildrenBody {
  return { children };
}

export function createPageBody<T extends object>(
  page: T,
  children: BlockObjectRequest[],
): T & { children: BlockObjectRequest[] } {
  return { ...page, children };
}

export function requestBodyBytes(body: unknown): number {
  const serialized = JSON.stringify(body);
  if (serialized === undefined) {
    throw new Error("Notion request body cannot be serialized");
  }
  return new TextEncoder().encode(serialized).byteLength;
}

function nestedChildren(block: BlockObjectRequest): BlockObjectRequest[] {
  const { payload } = payloadOf(block);
  return Array.isArray(payload?.children)
    ? (payload.children as BlockObjectRequest[])
    : [];
}

export function blockElementCount(blocks: BlockObjectRequest[]): number {
  return blocks.reduce(
    (total, block) => total + 1 + blockElementCount(nestedChildren(block)),
    0,
  );
}

function requestFits(
  children: BlockObjectRequest[],
  body: unknown,
): boolean {
  return (
    children.length <= MAX_CHILDREN_PER_REQUEST &&
    blockElementCount(children) <= MAX_BLOCK_ELEMENTS_PER_REQUEST &&
    requestBodyBytes(body) <= MAX_REQUEST_BODY_BYTES
  );
}

function assertAppendable(block: BlockObjectRequest): void {
  const elements = blockElementCount([block]);
  if (elements > MAX_BLOCK_ELEMENTS_PER_REQUEST) {
    throw new Error(
      `one atomic block subtree contains ${elements} block elements, more than ` +
        `Notion's ${MAX_BLOCK_ELEMENTS_PER_REQUEST} per request`,
    );
  }

  const bytes = requestBodyBytes(appendChildrenBody([block]));
  if (bytes > MAX_REQUEST_BODY_BYTES) {
    throw new Error(
      `one atomic block subtree needs ${bytes} bytes in an append request, more ` +
        `than Notion's 500KB (${MAX_REQUEST_BODY_BYTES} bytes) per request`,
    );
  }
}

// Blocks stay in order and a top-level subtree stays atomic. Each candidate is
// measured as the append body the SDK will serialize, so top-level count,
// aggregate nested elements, UTF-8 bytes, and JSON overhead all constrain where
// the next boundary falls.
export function batchBlocks(
  blocks: BlockObjectRequest[],
): BlockObjectRequest[][] {
  const batches: BlockObjectRequest[][] = [];
  let batch: BlockObjectRequest[] = [];

  for (const block of blocks) {
    assertAppendable(block);
    const candidate = [...batch, block];
    if (requestFits(candidate, appendChildrenBody(candidate))) {
      batch = candidate;
      continue;
    }

    if (batch.length > 0) batches.push(batch);
    batch = [block];
  }

  if (batch.length > 0) batches.push(batch);
  return batches;
}

// A create request carries page properties that an append does not, so its
// first batch must be measured against the complete create body independently.
// A subtree that cannot fit beside those properties is left for an append; an
// empty create is valid. The base request itself, however, must fit.
export function batchChildren(
  blocks: BlockObjectRequest[],
  page: object,
): ChildBatches {
  const empty = createPageBody(page, []);
  const baseBytes = requestBodyBytes(empty);
  if (baseBytes > MAX_REQUEST_BODY_BYTES) {
    throw new Error(
      `the create-page request needs ${baseBytes} bytes before any blocks, more ` +
        `than Notion's 500KB (${MAX_REQUEST_BODY_BYTES} bytes) per request`,
    );
  }

  for (const block of blocks) assertAppendable(block);

  let children: BlockObjectRequest[] = [];
  let index = 0;
  while (index < blocks.length) {
    const candidate = [...children, blocks[index]];
    if (!requestFits(candidate, createPageBody(page, candidate))) break;
    children = candidate;
    index += 1;
  }

  return { children, appends: batchBlocks(blocks.slice(index)) };
}
