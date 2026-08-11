import { RequestTimeoutError } from "@notionhq/client";

// Notion's SDK sets an error's `headers` from the fetch Response, so it is a
// `Headers` instance rather than a plain object. Index access on Headers always
// yields undefined, which silently defeats any Retry-After handling — read it
// through get() when that exists, and fall back to a case-insensitive scan.
export function readHeader(
  headers: unknown,
  name: string,
): string | undefined {
  if (typeof headers !== "object" || headers === null) return undefined;

  const get = (headers as { get?: unknown }).get;
  if (typeof get === "function") {
    const value = (get as (key: string) => unknown).call(headers, name);
    return typeof value === "string" ? value : undefined;
  }

  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted && typeof value === "string") return value;
  }
  return undefined;
}

// Never wait longer than this for one retry, so a bogus or hostile Retry-After
// can't hold a scheduled sync open for hours.
export const MAX_RETRY_WAIT_MS = 60_000;

// The Retry-After Notion sent, in milliseconds, or undefined where it sent none
// this side can use. Uncapped: a caller decides what its own ceiling is, and
// the two callers here have the same one for different reasons — one is waiting
// out its own repeat, the other is holding back a whole run.
export function retryAfterHeaderMs(headers: unknown): number | undefined {
  const seconds = Number(readHeader(headers, "retry-after"));
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined;
}

export function retryAfterMs(headers: unknown, attempt: number): number {
  return Math.min(
    retryAfterHeaderMs(headers) ?? attempt * 1000,
    MAX_RETRY_WAIT_MS,
  );
}

export type RetryOptions = {
  attempts?: number;
  sleep?: (ms: number) => Promise<void>;
  // Which statuses this call is willing to see again. Defaults to the
  // conservative policy, so a call site that says nothing gets the safe answer.
  retryOn?: ReadonlySet<number>;
  // Whether a request that ran out of time may be sent again. Off by default,
  // for the same reason the status set is: a timeout is the one answer that
  // says nothing at all about whether the request landed.
  retryTimeouts?: boolean;
};

const realSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// Notion allows ~3 requests/second per integration, and answers a burst with a
// 429 carrying Retry-After. A 429 is the one status that says, unambiguously,
// that the request did not happen — so every call in this repo retries it, and
// an image-heavy sync degrades to slow rather than failed.
export const RATE_LIMIT_STATUS = 429;

// The 5xx statuses that mean "this went wrong here, now": a bad gateway, an
// overloaded backend, a timed-out upstream. Notably not 501, which is a server
// saying it will never do that, and not 4xx, which is the request being wrong.
//
// 529 is Notion's own: the service is overloaded and is asking to be left alone
// for a moment. The SDK used to absorb it silently, on every method — including
// the ones that change something, which is why the SDK's retries are off (see
// client.ts). It belongs in the same place as the rest of them: repeated on a
// read, never on a write.
export const SERVICE_OVERLOADED_STATUS = 529;

export const RETRYABLE_SERVER_STATUSES: readonly number[] = [
  500,
  502,
  503,
  504,
  SERVICE_OVERLOADED_STATUS,
];

// Repeating a read costs nothing but the wait: a query, a page retrieve and a
// children list all leave the database exactly as they found it, and the run
// needs every one of them to succeed before it can say anything at all about
// what is on disk. Giving up on the first 503 is what turns one bad minute of
// Notion's day into "these posts could not be read" — which the sync reports as
// a failure, `--check` turns into a red CI run, and the migration turns into a
// halt before its first write.
export const RETRY_TRANSIENT_READS: ReadonlySet<number> = new Set([
  RATE_LIMIT_STATUS,
  ...RETRYABLE_SERVER_STATUSES,
]);

// A write is a different question, and the honest answer to a 5xx on one is "I
// do not know". A 500 or a 504 on pages.create does not say whether the page
// was created; the request may well have landed and the answer got lost on the
// way back. Retrying that is how one post becomes two Notion pages claiming one
// slug — the state the sync refuses to publish at all, and the wreckage the
// migration's entire resume protocol exists to avoid making. So a mutation
// retries the one status that promises nothing happened, and nothing else; the
// run stops instead, and re-running it is safe by design.
export const RETRY_RATE_LIMIT_ONLY: ReadonlySet<number> = new Set([
  RATE_LIMIT_STATUS,
]);

function statusOf(error: unknown): number | undefined {
  return typeof error === "object" && error !== null
    ? (error as { status?: number }).status
    : undefined;
}

// A request that ran out of time carries no status, because there was no
// answer: the deadline in client.ts covers the fetch, the headers and the whole
// body, and it aborts what it gives up on. Whether the request landed is
// therefore unknown — which is a different question on a read than on a write.
function timedOut(error: unknown): boolean {
  return RequestTimeoutError.isRequestTimeoutError(error);
}

// The primitive. Defaults to the conservative policy so a call site that says
// nothing about what it is doing is treated as though it were writing.
export async function withRetry<T>(
  operation: () => Promise<T>,
  {
    attempts = 4,
    sleep = realSleep,
    retryOn = RETRY_RATE_LIMIT_ONLY,
    retryTimeouts = false,
  }: RetryOptions = {},
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await operation();
    } catch (error: unknown) {
      const status = statusOf(error);
      const again =
        (status !== undefined && retryOn.has(status)) ||
        (retryTimeouts && timedOut(error));
      if (!again || attempt >= attempts) throw error;
      await sleep(
        retryAfterMs((error as { headers?: unknown }).headers, attempt),
      );
    }
  }
}

// For anything that only looks: a data source query, a page retrieve, a block
// children list, a schema or database read. Bounded by the same attempt budget
// and the same capped Retry-After backoff as everything else.
//
// A read that ran out of time is repeated too. Reading twice leaves Notion
// exactly as it was, and the alternative is one stalled socket costing a post:
// the deadline ends the request, so without a repeat the whole call fails, and
// a failed read is a post the sync could not verify anything about.
export function withReadRetry<T>(
  operation: () => Promise<T>,
  options: Omit<RetryOptions, "retryOn" | "retryTimeouts"> = {},
): Promise<T> {
  return withRetry(operation, {
    ...options,
    retryOn: RETRY_TRANSIENT_READS,
    retryTimeouts: true,
  });
}

// For anything that changes the database. Named rather than defaulted so a
// write says at its call site which policy it is under.
//
// A write that ran out of time is never repeated, for the same reason a 5xx on
// one is not: the request may well have landed and the answer got lost on the
// way back, and repeating a `pages.create` is how one post becomes two Notion
// pages claiming one slug.
export function withMutationRetry<T>(
  operation: () => Promise<T>,
  options: Omit<RetryOptions, "retryOn" | "retryTimeouts"> = {},
): Promise<T> {
  return withRetry(operation, {
    ...options,
    retryOn: RETRY_RATE_LIMIT_ONLY,
    retryTimeouts: false,
  });
}
