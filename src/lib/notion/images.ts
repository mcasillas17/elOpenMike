import {
  digestBytes,
  IMAGE_NAME_DIGEST_LENGTH,
} from "./image-digest";
import {
  assertSafeImageUrl,
  ImageUrlValidationError,
  type AddressResolver,
} from "./image-url";
import {
  extensionForFormat,
  formatFromContentType,
  ImageFormatError,
  IMAGE_FORMAT_MIME,
  verifyImageFormat,
  type ImageFormat,
} from "./image-format";

// Notion's free tier caps uploads at 5 MB; this leaves headroom while still
// refusing anything that would bloat the repo.
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

// file.notion.so redirects to the signed S3 object, so at least one hop is
// normal. More than a handful means a loop or an open redirector.
export const MAX_IMAGE_REDIRECTS = 5;

// `fetch` has no timeout of its own, and neither had this. A host that accepts
// the connection and then says nothing held the promise open forever — and
// because a post's images are all awaited before it renders, one stalled socket
// hung the entire run: the scheduled workflow sat on a runner until the job
// timed out, having written nothing, and the next tick started behind the last.
//
// So every image runs under two deadlines. The total is the whole budget for
// one image, start to finish, which a body trickling forever cannot outlast.
// The idle one is shorter and is reset by every piece of progress — the address
// resolving, a redirect answering, a chunk of the body arriving — so it ends a
// transfer that has simply stopped without punishing a slow one that has not.
//
// Signed Notion URLs live an hour, so a minute is plenty for the one image the
// budget covers; the idle budget is what a stalled socket meets first.
export const IMAGE_TOTAL_TIMEOUT_MS = 60_000;
export const IMAGE_IDLE_TIMEOUT_MS = 15_000;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

type ImageDownloadFailureReason =
  | "request-failed"
  | "redirect-missing-location"
  | "redirect-limit"
  | "invalid-redirect"
  | "too-large"
  | "empty-body"
  | "http-status"
  | "timed-out"
  | "transfer-failed";

class ImageDownloadError extends Error {
  constructor(
    readonly reason: ImageDownloadFailureReason,
    detail: string,
  ) {
    super(`image download failed: ${detail}`);
    this.name = "ImageDownloadError";
  }
}

export function safeImageErrorMessage(error: unknown): string {
  return error instanceof ImageUrlValidationError ||
    error instanceof ImageDownloadError ||
    error instanceof ImageFormatError
    ? error.message
    : "image download failed: unexpected failure";
}

// Content-addressed: identical bytes always produce the same filename, so an
// unchanged image yields no diff and the 10-minute cron stays quiet (spec §6).
//
// The digest is the one image-plan.ts compares a file on disk with, taken from
// one place (image-digest.ts) rather than restated here: the name a file is
// given and the answer to "does that file already hold these bytes?" are two
// questions about the same hash, and asking them differently is how a sync
// rewrites a file it just wrote.
//
// The extension comes from the format downloadImage *proved* the bytes to be,
// never from a declared content type: the extension is what the host serves the
// file's Content-Type from, so it is what decides whether a browser draws the
// file or executes it. A format outside the allowlist has no name here at all —
// see image-format.ts.
export function imageFileName(bytes: Uint8Array, format: ImageFormat): string {
  const extension = extensionForFormat(format);
  const hash = digestBytes(bytes).slice(0, IMAGE_NAME_DIGEST_LENGTH);
  return `${hash}.${extension}`;
}

export const BLOG_IMAGE_ROOT = "public/images/blog";

export function imageDir(slug: string): string {
  return `${BLOG_IMAGE_ROOT}/${slug}`;
}

// The timers a download runs on. Injected so a test owns the clock: what these
// deadlines are worth is decided by what happens at the moment one fires, and
// waiting a real minute to find out is not a test anybody runs.
export type ImageTimers = {
  setTimeout: (fire: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
};

const realTimers: ImageTimers = {
  setTimeout: (fire, ms) => setTimeout(fire, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export type DownloadImageOptions = {
  fetchImpl?: typeof fetch;
  resolve?: AddressResolver;
  totalTimeoutMs?: number;
  idleTimeoutMs?: number;
  timers?: ImageTimers;
};

// One image's two deadlines and the AbortController that enforces them.
//
// Every await in a download goes through `guard`, because aborting a signal is
// not the same as being answered: a `fetch` implementation is free to ignore
// the signal, and a ReadableStream that has stopped producing will simply never
// settle the read it owes. Racing the work against the expiry is what makes the
// budget a promise the caller actually gets back on time; the abort is what
// makes sure nothing is left running behind it.
class ImageDeadline {
  readonly controller = new AbortController();
  private readonly expiry: Promise<never>;
  private expire: (error: Error) => void = () => {};
  private totalHandle: unknown;
  private idleHandle: unknown;
  private failure: Error | undefined;
  private done = false;

  constructor(
    private readonly timers: ImageTimers,
    totalMs: number,
    private readonly idleMs: number,
  ) {
    this.expiry = new Promise<never>((_, reject) => {
      this.expire = reject;
    });
    // The expiry is raced against, not awaited: a download that finishes first
    // leaves it settling into nobody's hands, and an unhandled rejection is a
    // process-level event. One no-op handler makes it handled forever.
    this.expiry.catch(() => {});

    this.totalHandle = timers.setTimeout(
      () => this.fire(`no answer within ${totalMs}ms`),
      totalMs,
    );
    this.touch();
  }

  // Progress: the address resolved, a redirect answered, a chunk arrived. The
  // idle budget starts again from here; the total one does not.
  touch(): void {
    if (this.done) return;
    this.timers.clearTimeout(this.idleHandle);
    this.idleHandle = this.timers.setTimeout(
      () => this.fire(`no progress for ${this.idleMs}ms`),
      this.idleMs,
    );
  }

  guard<T>(work: Promise<T>): Promise<T> {
    return Promise.race([work, this.expiry]).catch((error: unknown) => {
      // Whichever rejection arrives first, the deadline is what ended this.
      //
      // Aborting the request errors whatever it was waiting on, and a stream
      // rejects its pending read *synchronously* when that happens — so the
      // abort's own AbortError routinely reaches the race ahead of the expiry
      // it came from. Reported as it arrives, an image the sync gave up on
      // reads as "transfer failed": a connection somebody else dropped, which
      // is the one thing it is not.
      throw this.failure ?? error;
    });
  }

  // Named without a url, a host or a query: this message reaches a terminal and
  // a public Actions log, and a signed Notion URL carries its own credentials.
  private fire(detail: string): void {
    if (this.done) return;
    this.clear();
    this.failure = new ImageDownloadError("timed-out", `timed out — ${detail}`);
    this.controller.abort();
    this.expire(this.failure);
  }

  // Always, on every path out of a download: a timer nothing cleared keeps the
  // process alive after the work it was watching is over.
  clear(): void {
    this.done = true;
    this.timers.clearTimeout(this.totalHandle);
    this.timers.clearTimeout(this.idleHandle);
  }
}

// Follows redirects by hand: `fetch` would follow them itself, and a validated
// Notion host is free to answer 302 Location: http://169.254.169.254/... — so
// each hop is re-validated before it is requested.
async function fetchValidated(
  url: string,
  { fetchImpl = fetch, resolve }: DownloadImageOptions,
  deadline: ImageDeadline,
): Promise<Response> {
  const signal = deadline.controller.signal;
  // Resolution is part of the budget too: a resolver that never answers is a
  // download that never starts, and this one is injected, so it is watched
  // rather than waited on.
  let target = await deadline.guard(assertSafeImageUrl(url, resolve));
  deadline.touch();

  for (let hop = 0; ; hop++) {
    let response: Response;
    try {
      response = await deadline.guard(
        fetchImpl(target, { redirect: "manual", signal }),
      );
    } catch (error: unknown) {
      if (error instanceof ImageDownloadError) throw error;
      throw new ImageDownloadError("request-failed", "request failed");
    }
    // An answer, even a redirect, is progress.
    deadline.touch();
    if (!REDIRECT_STATUSES.has(response.status)) return response;

    const location = response.headers.get("location");
    if (!location) {
      throw new ImageDownloadError(
        "redirect-missing-location",
        "redirect has no Location header",
      );
    }
    if (hop >= MAX_IMAGE_REDIRECTS) {
      throw new ImageDownloadError(
        "redirect-limit",
        `too many redirects (${MAX_IMAGE_REDIRECTS})`,
      );
    }

    let next: URL;
    try {
      next = new URL(location, target);
    } catch {
      throw new ImageDownloadError(
        "invalid-redirect",
        "redirect Location is invalid",
      );
    }
    // Free the socket before the next hop; a 3xx may still carry a body.
    await response.body?.cancel();
    target = await deadline.guard(assertSafeImageUrl(next, resolve));
    deadline.touch();
  }
}

function tooLarge(detail: string): Error {
  return new ImageDownloadError(
    "too-large",
    `image too large: ${detail} (max ${MAX_IMAGE_BYTES})`,
  );
}

// Reads the body chunk by chunk and stops the transfer the moment the cap is
// passed. arrayBuffer() would buffer the entire response into memory first,
// which turns a hostile or mistaken 500 MB "image" into an OOM rather than an
// error message.
//
// A read is also where a transfer stops without ending: the socket stays open,
// the promise never settles, and there is nothing to notice unless something is
// watching the clock. So every read runs under the deadline, and every chunk
// that does arrive resets the idle half of it.
async function readCapped(
  response: Response,
  deadline: ImageDeadline,
): Promise<Uint8Array> {
  const controller = deadline.controller;
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) {
    controller.abort();
    throw tooLarge(`content-length ${declared} bytes`);
  }

  if (!response.body) {
    throw new ImageDownloadError("empty-body", "empty response body");
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    let read: ReadableStreamReadResult<Uint8Array>;
    try {
      read = await deadline.guard(reader.read());
    } catch (error: unknown) {
      // The deadline aborted the request already; the reader is what still
      // holds the stream, so it is released here. Not awaited: a body that
      // stopped answering reads is exactly the kind that could sit on its own
      // cancel too, and the deadline has to be a promise the caller gets back.
      void reader.cancel("image download timed out").catch(() => {});
      throw error;
    }
    if (read.done) break;

    const value = read.value;
    deadline.touch();
    total += value.byteLength;
    if (total > MAX_IMAGE_BYTES) {
      // Cancel first — the reader is still healthy, so this resolves — then
      // abort the request itself so the connection is torn down too.
      await reader.cancel("image exceeds the size cap");
      controller.abort();
      throw tooLarge(`exceeds ${MAX_IMAGE_BYTES} bytes`);
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export type DownloadedImage = {
  bytes: Uint8Array;
  // The canonical type of the format the bytes were proved to be, not the
  // header the server sent.
  contentType: string;
  format: ImageFormat;
};

// Notion's file URLs are signed and expire one hour after they are issued, so
// this must run while the URL from the current fetch is still fresh.
//
// Nothing is returned that has not been proved to be one of the raster formats
// the site publishes: the declared type is checked before the body is read at
// all, and the bytes are checked against it once they are in hand. An SVG never
// gets as far as being a value a caller could write.
//
// And nothing runs without a clock on it. One image has a total budget and an
// idle one (see ImageDeadline), both enforced through the same AbortController
// the size cap uses, and both cleared before this returns either way.
export async function downloadImage(
  url: string,
  options: DownloadImageOptions = {},
): Promise<DownloadedImage> {
  const {
    timers = realTimers,
    totalTimeoutMs = IMAGE_TOTAL_TIMEOUT_MS,
    idleTimeoutMs = IMAGE_IDLE_TIMEOUT_MS,
  } = options;
  const deadline = new ImageDeadline(timers, totalTimeoutMs, idleTimeoutMs);
  const controller = deadline.controller;

  try {
    const response = await fetchValidated(url, options, deadline);
    if (!response.ok) {
      controller.abort();
      throw new ImageDownloadError(
        "http-status",
        `server returned status ${response.status}`,
      );
    }

    // Refused before a byte of the body is read: an SVG is an SVG whatever it
    // weighs, and there is no reason to spend the transfer on one.
    const declared = response.headers.get("content-type") ?? "";
    if (!formatFromContentType(declared)) {
      await response.body?.cancel();
      controller.abort();
      throw new ImageFormatError("unsupported-content-type");
    }

    const bytes = await readCapped(response, deadline);
    const format = verifyImageFormat(declared, bytes);

    return { bytes, contentType: IMAGE_FORMAT_MIME[format], format };
  } catch (error: unknown) {
    if (
      error instanceof ImageUrlValidationError ||
      error instanceof ImageDownloadError ||
      error instanceof ImageFormatError
    ) {
      throw error;
    }
    throw new ImageDownloadError("transfer-failed", "transfer failed");
  } finally {
    // Every path out, including the ones that already fired: a timer nothing
    // cleared holds the process open long after the image is decided.
    deadline.clear();
  }
}
