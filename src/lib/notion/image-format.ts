// What the sync is allowed to commit under public/images/blog/, and how it
// decides.
//
// A file in public/ is served from the site's own origin. That is fine for a
// picture and catastrophic for a document: an SVG is XML that carries script,
// event handlers and external references, so a browser pointed at
// /images/blog/a-post/deadbeef.svg runs it *as elopenmike.dev*. The page CSP
// does not help — a direct navigation is a document of its own — and neither
// does `X-Content-Type-Options: nosniff`, which pins the type the extension
// already asked for rather than refusing it.
//
// The bytes are not ours either. A Notion image block carries a URL, and an
// `external` block's URL is whatever an author (or anyone who can edit the
// page) pasted; the response's Content-Type is whatever that server chose to
// say. So neither the URL's extension nor the declared type decides anything:
//
//   * the declared type must be one of a small raster allowlist — the formats
//     the site actually renders — and every other type, SVG included, is
//     refused outright;
//   * the bytes must sniff as that very format. A GIF served as image/png is
//     refused rather than renamed, because "the server mislabelled it" and "the
//     server is trying something" look identical from here;
//   * the extension written to disk comes from the format that was *proved*,
//     never from the header that was read. The extension is what the host later
//     derives the Content-Type from, so it is the only thing that decides
//     whether a file is drawn or executed.
//
// That ordering is what makes the policy an allowlist rather than a filter: a
// body only reaches the repo by being positively recognized as one of five
// raster formats. Refusing markup explicitly is defence in depth and a clearer
// message, not the thing standing between an SVG and the origin.

export type ImageFormat = "png" | "jpeg" | "gif" | "webp" | "avif";

export const ALLOWED_IMAGE_FORMATS: readonly ImageFormat[] = [
  "png",
  "jpeg",
  "gif",
  "webp",
  "avif",
];

// The canonical type each format is recorded and served as.
export const IMAGE_FORMAT_MIME: Record<ImageFormat, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
};

export const IMAGE_FORMAT_EXTENSION: Record<ImageFormat, string> = {
  png: "png",
  jpeg: "jpg",
  gif: "gif",
  webp: "webp",
  avif: "avif",
};

// Every spelling of an allowed type. `image/jpg` is not registered but is what
// a good deal of software sends, and it means the same file.
const CONTENT_TYPES: Record<string, ImageFormat> = {
  "image/png": "png",
  "image/jpeg": "jpeg",
  "image/jpg": "jpeg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
};

export type ImageFormatRejectionReason =
  | "unsupported-content-type"
  | "markup-content"
  | "unrecognized-content"
  | "content-type-mismatch"
  | "unsupported-format";

// Categories only. The response these describe came back from a signed URL, on
// a host chosen by whoever wrote the Notion page, and the message is printed
// into a public Actions log — so it says what kind of thing went wrong and
// nothing whatsoever about the bytes, the headers or the address.
const REJECTION_MESSAGES: Record<ImageFormatRejectionReason, string> = {
  "unsupported-content-type":
    "the type served is not one of the raster image formats this site publishes",
  "markup-content":
    "the body is markup, which a browser would run as a document rather than draw as a picture",
  "unrecognized-content": "the body is not a recognized raster image",
  "content-type-mismatch": "the body is not the image format it was served as",
  "unsupported-format":
    "no file name can be built for a format this site does not publish",
};

export class ImageFormatError extends Error {
  constructor(readonly reason: ImageFormatRejectionReason) {
    super(`image rejected: ${REJECTION_MESSAGES[reason]}`);
    this.name = "ImageFormatError";
  }
}

// The format a Content-Type header names, or undefined for everything else —
// including image/svg+xml, text/html, application/octet-stream and a header
// that is missing altogether.
export function formatFromContentType(header: string): ImageFormat | undefined {
  const mime = header.split(";")[0].trim().toLowerCase();
  return CONTENT_TYPES[mime];
}

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.byteLength < signature.length) return false;
  return signature.every((byte, index) => bytes[index] === byte);
}

const ascii = (text: string): number[] => [...text].map((c) => c.charCodeAt(0));

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
// SOI followed by the first marker of the stream. Every JPEG opens this way,
// whatever the APPn segment after it is.
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const GIF87 = ascii("GIF87a");
const GIF89 = ascii("GIF89a");

function reads(bytes: Uint8Array, offset: number, text: string): boolean {
  const wanted = ascii(text);
  if (bytes.byteLength < offset + wanted.length) return false;
  return wanted.every((byte, index) => bytes[offset + index] === byte);
}

// RIFF is a container: the four bytes at 8 say which kind, and only WEBP is one
// of ours. A RIFF/WAVE is not a mislabelled image, it is not an image at all.
function isWebp(bytes: Uint8Array): boolean {
  return reads(bytes, 0, "RIFF") && reads(bytes, 8, "WEBP");
}

// ISO base media format: a `ftyp` box whose brands say what the file is. The
// major brand at 8 is the usual answer, but an AVIF written by some encoders
// carries `mif1` there and names `avif` among its compatible brands, so the
// whole (bounded) brand list is read.
const AVIF_BRANDS = new Set(["avif", "avis"]);
const MAX_FTYP_BYTES = 512;

function isAvif(bytes: Uint8Array): boolean {
  if (!reads(bytes, 4, "ftyp")) return false;

  const declared =
    ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
  const end = Math.min(bytes.byteLength, MAX_FTYP_BYTES, Math.max(declared, 16));

  for (let offset = 8; offset + 4 <= end; offset += 4) {
    // Skip the four bytes of minor version that sit between the major brand
    // and the compatible brands.
    if (offset === 12) continue;
    const brand = String.fromCharCode(...bytes.slice(offset, offset + 4));
    if (AVIF_BRANDS.has(brand)) return true;
  }
  return false;
}

// The format the bytes themselves say they are, or undefined when they say
// nothing this site publishes. Never guesses: an unrecognized body is a refusal
// rather than a default.
export function sniffImageFormat(bytes: Uint8Array): ImageFormat | undefined {
  if (startsWith(bytes, PNG_SIGNATURE)) return "png";
  if (startsWith(bytes, JPEG_SIGNATURE)) return "jpeg";
  if (startsWith(bytes, GIF87) || startsWith(bytes, GIF89)) return "gif";
  if (isWebp(bytes)) return "webp";
  if (isAvif(bytes)) return "avif";
  return undefined;
}

const UTF8_BOM = [0xef, 0xbb, 0xbf];
// The characters HTML and XML parsers skip before a document's first tag.
const LEADING_SPACE = new Set([0x09, 0x0a, 0x0c, 0x0d, 0x20]);
// How far in to look for the opening `<`. A document with more leading
// whitespace than this is not a document anyone wrote.
const MARKUP_SCAN_BYTES = 1024;

const MARKUP_OPENINGS = ["<?xml", "<svg", "<!doctype", "<!--", "<html", "<?"];

// True when the body looks like a document rather than a picture. Only ever
// used to say *why* something was refused: nothing is accepted on the strength
// of this returning false, because the accept path is the positive sniff above.
export function looksLikeMarkup(bytes: Uint8Array): boolean {
  let start = startsWith(bytes, UTF8_BOM) ? UTF8_BOM.length : 0;
  while (start < bytes.byteLength && LEADING_SPACE.has(bytes[start])) start += 1;

  const head = String.fromCharCode(
    ...bytes.slice(start, start + MARKUP_SCAN_BYTES),
  ).toLowerCase();

  return MARKUP_OPENINGS.some((opening) => head.startsWith(opening));
}

// The format these bytes are, proved rather than assumed. Throws for anything
// that is not one of the five raster formats, whatever it claims to be.
export function verifyImageFormat(
  contentType: string,
  bytes: Uint8Array,
): ImageFormat {
  const declared = formatFromContentType(contentType);
  if (!declared) throw new ImageFormatError("unsupported-content-type");

  const sniffed = sniffImageFormat(bytes);
  if (!sniffed) {
    throw new ImageFormatError(
      looksLikeMarkup(bytes) ? "markup-content" : "unrecognized-content",
    );
  }
  if (sniffed !== declared) {
    throw new ImageFormatError("content-type-mismatch");
  }

  return sniffed;
}

// The extension a proved format is written with. Rejects anything else, so a
// caller that skipped the check above still cannot name a file `.svg`.
export function extensionForFormat(format: ImageFormat): string {
  const extension = IMAGE_FORMAT_EXTENSION[format];
  if (extension === undefined) throw new ImageFormatError("unsupported-format");
  return extension;
}
