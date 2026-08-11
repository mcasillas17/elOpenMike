import type { NotionBlock } from "./types";

// Notion answers a children list with a mix of *full* block objects and
// *partial* ones. A partial block is `{ object: "block", id }` and nothing
// else: no type, no payload, nothing a converter could render. The SDK spells
// both out — `ListBlockChildrenResponse["results"]` is
// `PartialBlockObjectResponse | BlockObjectResponse` — and the walk used to
// cast the whole array to the shape it wanted, which is a promise about the
// response that the response never made.
//
// Nothing downstream could catch it afterwards. blocks-to-md reads
// `block.type`, finds undefined, falls through to its default arm, warns
// "skipped unsupported block" and renders the empty string. So a post whose
// middle paragraph came back partial published as a post *missing* its middle
// paragraph — under the same slug, over the file on disk that still had it.
//
// There is nothing to recover: the block's content was not sent. So a partial
// block fails, loudly and specifically, at the point it is read — and the
// specificity is what lets the sync treat it as one post's problem (the file
// on disk is kept, `--check` fails) rather than the run's.

export class PartialBlockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PartialBlockError";
  }
}

// Instance checks alone do not survive a module loaded twice, which is exactly
// the shape a bundler or a duplicated dependency produces — and the failure
// mode is silent: the error stops being "one post's problem" and takes the
// whole run down. The name is carried on the error itself, so both spellings
// answer the same question.
export function isPartialBlockError(error: unknown): boolean {
  return (
    error instanceof PartialBlockError ||
    (typeof error === "object" &&
      error !== null &&
      (error as { name?: unknown }).name === "PartialBlockError")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// The id of a result, when it has one worth naming. Ids are generated rather
// than typed, so they are safe to print into a terminal or a public Actions
// log; a block's content never is.
function idOf(value: unknown): string {
  const id = isRecord(value) ? value.id : undefined;
  return typeof id === "string" && id !== "" ? id : "with no id";
}

// One result from a children list, proved to be a block this repo can convert:
// it says it is a block, it carries an id and a type, and it carries the
// payload that type names. Anything short of that is refused rather than cast.
export function assertFullBlock(result: unknown, parentId: string): NotionBlock {
  const where = `block ${idOf(result)} under ${parentId}`;

  if (!isRecord(result) || result.object !== "block") {
    throw new PartialBlockError(
      `${where} is not a block object — Notion answered with something this ` +
        "run cannot read as content, so nothing was published for the post " +
        "holding it",
    );
  }

  if (typeof result.id !== "string" || result.id === "") {
    throw new PartialBlockError(
      `${where} arrived without an id — the response is incomplete, so ` +
        "nothing was published for the post holding it",
    );
  }

  const type = result.type;
  if (typeof type !== "string" || type === "") {
    throw new PartialBlockError(
      `${where} is a partial block: Notion returned its id and nothing else, ` +
        "so its content was never sent — nothing was published for the post " +
        "holding it, and whatever is on disk for that post is left alone",
    );
  }

  if (!isRecord(result[type])) {
    throw new PartialBlockError(
      `${where} is a partial ${type} block: it names a type but carries no ` +
        `${type} payload, so its content was never sent — nothing was ` +
        "published for the post holding it",
    );
  }

  return result as unknown as NotionBlock;
}
