// Real magic bytes, so a test that says "a PNG" hands the code the eight bytes
// a PNG actually starts with rather than a string that claims to be one. The
// sync decides an image's format from these, so a fixture that lies is a test
// that proves nothing.

const bytes = (...values: number[]): Uint8Array<ArrayBuffer> =>
  new Uint8Array(values);
const ascii = (text: string): Uint8Array<ArrayBuffer> =>
  new TextEncoder().encode(text);

export function concatBytes(
  ...parts: Uint8Array[]
): Uint8Array<ArrayBuffer> {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

export const PNG_BYTES = concatBytes(
  bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
  bytes(0x00, 0x00, 0x00, 0x0d),
  ascii("IHDR"),
);

export const JPEG_BYTES = concatBytes(
  bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10),
  ascii("JFIF"),
);

export const GIF87_BYTES = concatBytes(ascii("GIF87a"), bytes(1, 0, 1, 0, 0x80, 0, 0));
export const GIF89_BYTES = concatBytes(ascii("GIF89a"), bytes(1, 0, 1, 0, 0x80, 0, 0));

export const WEBP_BYTES = concatBytes(
  ascii("RIFF"),
  bytes(0x1a, 0x00, 0x00, 0x00),
  ascii("WEBPVP8 "),
);

export const AVIF_BYTES = concatBytes(
  bytes(0x00, 0x00, 0x00, 0x20),
  ascii("ftypavif"),
  bytes(0x00, 0x00, 0x00, 0x00),
  ascii("avifmif1"),
);

export const AVIS_BYTES = concatBytes(
  bytes(0x00, 0x00, 0x00, 0x20),
  ascii("ftypavis"),
  bytes(0x00, 0x00, 0x00, 0x00),
  ascii("avisavif"),
);

// The payload the whole policy exists for: a document that runs script the
// moment a browser is pointed at it, which is what happens the instant one is
// committed under public/ and someone follows the link.
export const SCRIPT_SVG_BYTES = ascii(
  '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(document.domain)">' +
    "<script>fetch('/steal')</script></svg>",
);

export const XML_BYTES = ascii('<?xml version="1.0" encoding="UTF-8"?>\n<root/>');
export const HTML_BYTES = ascii("<!DOCTYPE html>\n<html><body>hi</body></html>");

export const UTF8_BOM = bytes(0xef, 0xbb, 0xbf);

export const asciiBytes = ascii;
