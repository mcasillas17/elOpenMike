import { createHash } from "node:crypto";
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

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

type ImageDownloadFailureReason =
  | "request-failed"
  | "redirect-missing-location"
  | "redirect-limit"
  | "invalid-redirect"
  | "too-large"
  | "empty-body"
  | "http-status"
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
// The extension comes from the format downloadImage *proved* the bytes to be,
// never from a declared content type: the extension is what the host serves the
// file's Content-Type from, so it is what decides whether a browser draws the
// file or executes it. A format outside the allowlist has no name here at all —
// see image-format.ts.
export function imageFileName(bytes: Uint8Array, format: ImageFormat): string {
  const extension = extensionForFormat(format);
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 12);
  return `${hash}.${extension}`;
}

export const BLOG_IMAGE_ROOT = "public/images/blog";

export function imageDir(slug: string): string {
  return `${BLOG_IMAGE_ROOT}/${slug}`;
}

export type DownloadImageOptions = {
  fetchImpl?: typeof fetch;
  resolve?: AddressResolver;
};

// Follows redirects by hand: `fetch` would follow them itself, and a validated
// Notion host is free to answer 302 Location: http://169.254.169.254/... — so
// each hop is re-validated before it is requested.
async function fetchValidated(
  url: string,
  { fetchImpl = fetch, resolve }: DownloadImageOptions,
  signal: AbortSignal,
): Promise<Response> {
  let target = await assertSafeImageUrl(url, resolve);

  for (let hop = 0; ; hop++) {
    let response: Response;
    try {
      response = await fetchImpl(target, { redirect: "manual", signal });
    } catch {
      throw new ImageDownloadError("request-failed", "request failed");
    }
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
    target = await assertSafeImageUrl(next, resolve);
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
async function readCapped(
  response: Response,
  controller: AbortController,
): Promise<Uint8Array> {
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
    const { done, value } = await reader.read();
    if (done) break;

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
export async function downloadImage(
  url: string,
  options: DownloadImageOptions = {},
): Promise<DownloadedImage> {
  try {
    const controller = new AbortController();
    const response = await fetchValidated(url, options, controller.signal);
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

    const bytes = await readCapped(response, controller);
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
  }
}
