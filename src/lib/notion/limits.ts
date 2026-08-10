import type { BlockObjectRequest } from "@notionhq/client";
import type { RichTextInput } from "./md-to-rich-text";

// Notion's API is not only a shape, it is a size. A create-page request takes
// at most 100 children, a rich-text array at most 100 elements, and one text
// run at most 2000 characters — and the API rejects the whole request when any
// of them is exceeded, so one long post used to fail as a unit.
//
// Two of the three can be honored without losing anything, and are:
//
//   * a run longer than 2000 characters is split into as many runs as it needs,
//     each carrying the same annotations and the same link, because Notion
//     stores a paragraph as a sequence of runs and renders them back to back;
//   * blocks past the hundredth are sent as append requests after the page
//     exists, in batches of a hundred and in order.
//
// The third cannot: a rich-text array is one block's formatting, and splitting
// it would split the block. So a paragraph that needs more than a hundred runs
// is refused by name, before anything is created.
//
// The character limits are Notion's published ones; the SDK types spell the
// shapes but carry no lengths, so they are stated here with the reason each one
// exists rather than derived.
export const MAX_CHILDREN_PER_REQUEST = 100;
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

// Blocks in the order they were written, cut into whole requests. Used on its
// own when the page already exists — a resumed migration appends everything it
// is missing, including the first hundred.
export function batchBlocks(
  blocks: BlockObjectRequest[],
): BlockObjectRequest[][] {
  const batches: BlockObjectRequest[][] = [];

  for (
    let index = 0;
    index < blocks.length;
    index += MAX_CHILDREN_PER_REQUEST
  ) {
    batches.push(blocks.slice(index, index + MAX_CHILDREN_PER_REQUEST));
  }

  return batches;
}

export function batchChildren(blocks: BlockObjectRequest[]): ChildBatches {
  const [children = [], ...appends] = batchBlocks(blocks);
  return { children, appends };
}
