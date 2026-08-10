import { createHash } from "node:crypto";

// Notion's free tier caps uploads at 5 MB; this leaves headroom while still
// refusing anything that would bloat the repo.
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

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

// Notion's file URLs are pre-signed S3 links whose query string carries
// X-Amz-Signature and X-Amz-Security-Token. The sync's errors are printed to a
// public Actions log, so only the location — never the credentials — is shown.
function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return "<unparseable url>";
  }
}

// Notion's file URLs are signed and expire one hour after they are issued, so
// this must run while the URL from the current fetch is still fresh.
export async function downloadImage(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ bytes: Uint8Array; contentType: string }> {
  const response = await fetchImpl(url);
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
