import { createHash } from "node:crypto";
import {
  assertSafeImageUrl,
  redactUrl,
  type AddressResolver,
} from "./image-url";

// Notion's free tier caps uploads at 5 MB; this leaves headroom while still
// refusing anything that would bloat the repo.
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

// file.notion.so redirects to the signed S3 object, so at least one hop is
// normal. More than a handful means a loop or an open redirector.
export const MAX_IMAGE_REDIRECTS = 5;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "image/avif": "avif",
};

// Content-addressed: identical bytes always produce the same filename, so an
// unchanged image yields no diff and the 10-minute cron stays quiet (spec §6).
export function imageFileName(bytes: Uint8Array, contentType: string): string {
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 12);
  const mime = contentType.split(";")[0].trim().toLowerCase();
  return `${hash}.${EXTENSIONS[mime] ?? "bin"}`;
}

export function imageDir(slug: string): string {
  return `public/images/blog/${slug}`;
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
): Promise<Response> {
  let target = await assertSafeImageUrl(url, resolve);

  for (let hop = 0; ; hop++) {
    const response = await fetchImpl(target, { redirect: "manual" });
    if (!REDIRECT_STATUSES.has(response.status)) return response;

    const location = response.headers.get("location");
    if (!location) {
      throw new Error(
        `image download failed: ${response.status} with no Location header ${redactUrl(target)}`,
      );
    }
    if (hop >= MAX_IMAGE_REDIRECTS) {
      throw new Error(
        `image download failed: too many redirects (${MAX_IMAGE_REDIRECTS}) from ${redactUrl(url)}`,
      );
    }

    let next: URL;
    try {
      next = new URL(location, target);
    } catch {
      throw new Error(
        `image download failed: unparseable redirect Location from ${redactUrl(target)}`,
      );
    }
    target = await assertSafeImageUrl(next, resolve);
  }
}

// Notion's file URLs are signed and expire one hour after they are issued, so
// this must run while the URL from the current fetch is still fresh.
export async function downloadImage(
  url: string,
  options: DownloadImageOptions = {},
): Promise<{ bytes: Uint8Array; contentType: string }> {
  const response = await fetchValidated(url, options);
  if (!response.ok) {
    throw new Error(
      `image download failed: ${response.status} ${redactUrl(url)}`,
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(
      `image too large: ${bytes.byteLength} bytes (max ${MAX_IMAGE_BYTES}) ${redactUrl(url)}`,
    );
  }
  return {
    bytes,
    contentType:
      response.headers.get("content-type") ?? "application/octet-stream",
  };
}
