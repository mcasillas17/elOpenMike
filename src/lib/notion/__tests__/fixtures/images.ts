// Real image files, not the first eight bytes of one.
//
// The sync decides an image's format from its bytes and then commits it into
// public/, where the site serves it from its own origin — so a fixture that
// only carries a magic prefix proves nothing about the check that matters. Each
// of these is a complete, well-formed image produced by a real encoder, base64'd
// verbatim; the malformed ones are built by taking one of them apart.

const bytes = (...values: number[]): Uint8Array<ArrayBuffer> =>
  new Uint8Array(values);
const ascii = (text: string): Uint8Array<ArrayBuffer> =>
  new TextEncoder().encode(text);

const decode = (base64: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));

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

// The same bytes with `patch` written over them at `offset`. The malformed
// cases are built out of the valid ones this way, so a test that says "the same
// file with a zero width" really is the same file.
export function patchBytes(
  source: Uint8Array,
  offset: number,
  ...patch: number[]
): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(source);
  out.set(patch, offset);
  return out;
}

// A 1x1 RGBA PNG: signature, IHDR, IDAT, IEND.
export const PNG_BYTES = decode(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmM" +
    "IQAAAABJRU5ErkJggg==",
);

// A 1x1 baseline JPEG: SOI, APP0/APP1/APP13, SOF0, DHT, DQT, DRI, SOS, entropy
// data, EOI.
export const JPEG_BYTES = decode(
  "/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAA" +
    "A6ABAAMAAAABAAEAAKACAAQAAAABAAAAAaADAAQAAAABAAAAAQAAAAD/7QA4UGhvdG9zaG9wIDMu" +
    "MAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8AAEQgAAQABAwEiAAIR" +
    "AQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAAB" +
    "fQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5" +
    "OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeo" +
    "qaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMB" +
    "AQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYS" +
    "QVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNU" +
    "VVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5" +
    "usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/bAEMAAgICAgICAwICAwUDAwMF" +
    "BgUFBQUGCAYGBgYGCAoICAgICAgKCgoKCgoKCgwMDAwMDA4ODg4ODw8PDw8PDw8PD//bAEMBAgIC" +
    "BAQEBwQEBxALCQsQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQ" +
    "EBAQEP/dAAQAAf/aAAwDAQACEQMRAD8A+mKKKK/Kz/QA/9k=",
);

// A 1x1 GIF87a: header, logical screen descriptor with a global colour table, a
// graphic control extension, one image, and the trailer.
export const GIF87_BYTES = decode(
  "R0lGODdhAQABAJEAAAAAAP8AAP///wAAACH5BAkAAAMALAAAAAABAAEAAAICTAEAOw==",
);

// The same file under the other header. Both spellings are the same format and
// the same structure; only the version differs.
export const GIF89_BYTES = patchBytes(GIF87_BYTES, 4, ...ascii("9a"));

// A 1x1 lossy WebP: RIFF/WEBP with a single VP8 chunk.
export const WEBP_BYTES = decode(
  "UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=",
);

// A 1x1 lossless WebP: the same container with a VP8L chunk, whose 17 bytes are
// odd and therefore padded to an even boundary.
export const WEBP_LOSSLESS_BYTES = decode(
  "UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=",
);

// The extended container: a VP8X chunk carrying the canvas size, followed by
// the image chunk it describes. Built from the lossy file's own VP8 chunk so
// the two agree about the picture inside.
function buildExtendedWebp(): Uint8Array<ArrayBuffer> {
  const body = concatBytes(
    ascii("WEBP"),
    ascii("VP8X"),
    bytes(10, 0, 0, 0),
    // flags, then three reserved bytes
    bytes(0, 0, 0, 0),
    // canvas width - 1 and height - 1, three bytes each, little-endian
    bytes(0, 0, 0),
    bytes(0, 0, 0),
    WEBP_BYTES.slice(12),
  );
  const size = new Uint8Array(4);
  new DataView(size.buffer).setUint32(0, body.byteLength, true);
  return concatBytes(ascii("RIFF"), size, body);
}

export const WEBP_EXTENDED_BYTES = buildExtendedWebp();

// A 2x2 AVIF: ftyp, meta (holding the item properties, `ispe` among them) and
// mdat, whose box uses the 64-bit size form.
export const AVIF_BYTES = decode(
  "AAAAGGZ0eXBhdmlmAAAAAGF2aWZtaWYxAAAB4W1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAHBpY3QA" +
    "AAAAAAAAAAAAAAAAAAAAJGRpbmYAAAAcZHJlZgAAAAAAAAABAAAADHVybCAAAAABAAAADnBpdG0A" +
    "AAAAAAEAAAA4aWluZgAAAAAAAgAAABVpbmZlAgAAAAABAABhdjAxAAAAABVpbmZlAgAAAQACAABh" +
    "djAxAAAAABppcmVmAAAAAAAAAA5hdXhsAAIAAQABAAABBGlwcnAAAADZaXBjbwAAABNjb2xybmNs" +
    "eAACAAIABoAAAAAMY2xsaQDLAEAAAAAUaXNwZQAAAAAAAAACAAAAAgAAAChjbGFwAAAAAQAAAAEA" +
    "AAABAAAAAf/AAAAAgAAA/8AAAACAAAAAAAAJaXJvdAAAAAAQcGl4aQAAAAADCAgIAAAADnBpeGkA" +
    "AAAAAQgAAAA3YXV4QwAAAAB1cm46bXBlZzpoZXZjOjIwMTU6YXV4aWQ6MQAAAAAMAAAACE4BpQQA" +
    "Af5AAAAADGF2MUOBAAwAAAAADGF2MUOBABwAAAAAI2lwbWEAAAAAAAAAAgABB4ECAwaJhIUAAgYD" +
    "B4iKhIUAAAAsaWxvYwAAAABEAAACAAEAAAABAAACCQAAAC8AAgAAAAEAAAI4AAAAJQAAAAFtZGF0" +
    "AAAAAAAAAGQSAAoMAAAAAAZ//AgQEDQgMh0QAZIACCCCKAN1NNEwT/3P9Nw+Q+J46zxZ7UFnUBIA" +
    "CggAAAAABn/8FTIXEAGOACCKCtLnPRcb/ogR7z/z/fHq3cA=",
);

// Where an ISO base media file writes the brands that say what it is: the major
// brand, then a four-byte minor version, then the compatible brands. AVIF_BYTES
// carries two of the latter, `avif` and `mif1`.
export const AVIF_MAJOR_BRAND_OFFSET = 8;
export const AVIF_FIRST_COMPATIBLE_BRAND_OFFSET = 16;
export const AVIF_SECOND_COMPATIBLE_BRAND_OFFSET = 20;

// The same file under the image *sequence* major brand. `avis` is a file of
// many pictures and a track that plays them — a different format wearing the
// same extension — and the compatible brands still list `avif`.
export const AVIS_BYTES = patchBytes(
  AVIF_BYTES,
  AVIF_MAJOR_BRAND_OFFSET,
  ...ascii("avis"),
);

// A still image's major brand with a sequence named beside it, which is how a
// sequence rides in on a file that introduces itself as a picture.
export const AVIF_WITH_AVIS_COMPATIBLE_BYTES = patchBytes(
  AVIF_BYTES,
  AVIF_SECOND_COMPATIBLE_BRAND_OFFSET,
  ...ascii("avis"),
);

// The same trick with the structural brand a HEIF image sequence carries.
export const AVIF_WITH_MSF1_COMPATIBLE_BYTES = patchBytes(
  AVIF_BYTES,
  AVIF_SECOND_COMPATIBLE_BRAND_OFFSET,
  ...ascii("msf1"),
);

// Brands are case-sensitive four-character codes, so `AVIS` names nothing at
// all — which is exactly why a check that only knows the lowercase spelling
// would let it past on the strength of the `avif` beside it.
export const AVIF_WITH_UPPERCASE_AVIS_BYTES = patchBytes(
  AVIF_BYTES,
  AVIF_SECOND_COMPATIBLE_BRAND_OFFSET,
  ...ascii("AVIS"),
);
export const AVIS_UPPERCASE_MAJOR_BYTES = patchBytes(
  AVIF_BYTES,
  AVIF_MAJOR_BRAND_OFFSET,
  ...ascii("AvIs"),
);

// An ftyp whose brand list stops mid-brand: sixteen bytes of header, major
// brand and minor version, and then two bytes where a fourth brand would be.
// The box tiles the file exactly, so only the brand walk can refuse it.
export const AVIF_RAGGED_BRANDS_BYTES = concatBytes(
  bytes(0, 0, 0, 22),
  ascii("ftypavif"),
  bytes(0, 0, 0, 0),
  ascii("av"),
  AVIF_BYTES.slice(24),
);

// Where each format writes the numbers a test needs to make impossible.
export const PNG_IHDR_LENGTH_OFFSET = 8;
export const PNG_WIDTH_OFFSET = 16;
export const PNG_HEIGHT_OFFSET = 20;
export const PNG_BIT_DEPTH_OFFSET = 24;
export const GIF_WIDTH_OFFSET = 6;
export const GIF_HEIGHT_OFFSET = 8;
// The first block after the global colour table: the graphic control
// extension's introducer, and the size byte of its first sub-block.
export const GIF_FIRST_BLOCK_OFFSET = 25;
export const GIF_FIRST_SUB_BLOCK_SIZE_OFFSET = 27;
// The SOF0 marker in JPEG_BYTES: 0xff 0xc0, then length, precision, height,
// width.
export const JPEG_SOF_HEIGHT_OFFSET = 161;
export const JPEG_SOF_WIDTH_OFFSET = 163;
export const WEBP_RIFF_SIZE_OFFSET = 4;
export const WEBP_VP8_START_CODE_OFFSET = 23;
// The VP8X canvas width, stored one less than it is, in WEBP_EXTENDED_BYTES.
export const WEBP_VP8X_WIDTH_OFFSET = 24;
// The `ispe` property inside AVIF_BYTES: its width field, then its height.
export const AVIF_ISPE_WIDTH_OFFSET = 260;
export const AVIF_ISPE_HEIGHT_OFFSET = 264;
// The first byte of the mdat box, which is everything after the metadata.
export const AVIF_MDAT_OFFSET = 505;

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

// What a magic-byte check alone accepts: the signature and nothing else. Every
// one of these is a truncated file, and none of them is an image.
export const PNG_PREFIX = PNG_BYTES.slice(0, 16);
export const JPEG_PREFIX = JPEG_BYTES.slice(0, 16);
export const GIF_PREFIX = GIF87_BYTES.slice(0, 13);
export const WEBP_PREFIX = WEBP_BYTES.slice(0, 16);
export const AVIF_PREFIX = AVIF_BYTES.slice(0, 24);

export const asciiBytes = ascii;
export const rawBytes = bytes;

// ---------------------------------------------------------------------------
// A real PNG of a chosen size, carrying a marker a test can read back.
//
// The download tests are about transport — redirects, chunking, the size cap —
// and they need a body they can tell apart from another one. Appending bytes to
// a PNG is not a way to do that: a file with anything after its IEND is a
// payload riding on an image, and the sync refuses it. So the marker goes
// *inside*, as a tEXt chunk with a real CRC, which is what a PNG carrying a
// comment actually looks like.
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(input: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of input) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function be32(value: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value, false);
  return out;
}

const PNG_MARKER_KEYWORD = "Comment";
// signature + IHDR + IDAT, i.e. everything before IEND.
const PNG_BEFORE_IEND = PNG_BYTES.byteLength - 12;
// A tEXt chunk's length, type, keyword, separator and CRC.
export const PNG_TEXT_CHUNK_OVERHEAD = 8 + PNG_MARKER_KEYWORD.length + 1 + 4;

export function pngCarrying(marker: string, padding = 0): Uint8Array<ArrayBuffer> {
  const data = concatBytes(
    ascii(PNG_MARKER_KEYWORD),
    bytes(0),
    ascii(marker),
    // Spaces rather than NULs: a tEXt value is text.
    new Uint8Array(padding).fill(0x20),
  );
  const type = ascii("tEXt");
  const chunk = concatBytes(
    be32(data.byteLength),
    type,
    data,
    be32(crc32(concatBytes(type, data))),
  );

  return concatBytes(
    PNG_BYTES.slice(0, PNG_BEFORE_IEND),
    chunk,
    PNG_BYTES.slice(PNG_BEFORE_IEND),
  );
}

// A real PNG of exactly `size` bytes.
export function pngOfSize(size: number): Uint8Array<ArrayBuffer> {
  const overhead = PNG_BYTES.byteLength + PNG_TEXT_CHUNK_OVERHEAD;
  if (size < overhead) throw new Error(`a PNG cannot be ${size} bytes`);
  return pngCarrying("", size - overhead);
}

// The marker pngCarrying put inside, read back out of the file: the chunk's own
// declared length says where its data ends, so nothing here guesses.
export function pngMarker(png: Uint8Array): string {
  const text = new TextDecoder("latin1").decode(png);
  const type = text.indexOf(`tEXt${PNG_MARKER_KEYWORD}\u0000`);
  if (type < 4) return "";

  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const length = view.getUint32(type - 4, false);
  const from = type + 4 + PNG_MARKER_KEYWORD.length + 1;
  return text.slice(from, type + 4 + length).trimEnd();
}

// ---------------------------------------------------------------------------
// Pictures whose *headers* describe something enormous, in files of a few
// hundred bytes.
//
// A decompression bomb is not a big file. Every one of these is small enough to
// pass the download's size cap without noticing, and each one asks whatever
// decodes it for gigabytes: the numbers live in the header, and the pixels are
// only ever conjured on the other side. So they are built rather than
// downloaded — a real encoder will not write one.
// ---------------------------------------------------------------------------

function be16(value: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(2);
  new DataView(out.buffer).setUint16(0, value, false);
  return out;
}

function le16(value: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(2);
  new DataView(out.buffer).setUint16(0, value, true);
  return out;
}

function le24(value: number): Uint8Array<ArrayBuffer> {
  return bytes(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff);
}

function le32(value: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value, true);
  return out;
}

// A PNG chunk with a real CRC: length, type, data, checksum.
export function pngChunk(
  type: string,
  data: Uint8Array,
): Uint8Array<ArrayBuffer> {
  const name = ascii(type);
  return concatBytes(
    be32(data.byteLength),
    name,
    data,
    be32(crc32(concatBytes(name, data))),
  );
}

// The same 1x1 PNG with another size written into its IHDR. Nothing decodes
// it — the point is a header that claims a picture nobody can hold.
export function pngDeclaring(
  width: number,
  height: number,
): Uint8Array<ArrayBuffer> {
  return patchBytes(
    patchBytes(PNG_BYTES, PNG_WIDTH_OFFSET, ...be32(width)),
    PNG_HEIGHT_OFFSET,
    ...be32(height),
  );
}

export type AnimationFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

// An animated PNG: the same file with an `acTL` and one `fcTL` per frame, each
// declaring its own rectangle inside the canvas.
export function apngDeclaring(
  canvas: { width: number; height: number },
  frames: AnimationFrame[],
): Uint8Array<ArrayBuffer> {
  const base = pngDeclaring(canvas.width, canvas.height);
  const head = base.slice(0, 33);
  const tail = base.slice(33);

  const control = pngChunk(
    "acTL",
    concatBytes(be32(frames.length), be32(0)),
  );
  const frameChunks = frames.map((frame, index) =>
    pngChunk(
      "fcTL",
      concatBytes(
        be32(index),
        be32(frame.width),
        be32(frame.height),
        be32(frame.x),
        be32(frame.y),
        be16(1),
        be16(10),
        bytes(0, 0),
      ),
    ),
  );

  return concatBytes(head, control, ...frameChunks, tail);
}

// A GIF of a chosen canvas, holding a chosen set of image descriptors. Each
// frame carries the smallest legal LZW payload, so a file with a thousand of
// them is still a few kilobytes — which is the whole point.
export function gifDeclaring(
  canvas: { width: number; height: number },
  frames: AnimationFrame[],
): Uint8Array<ArrayBuffer> {
  const screen = concatBytes(
    ascii("GIF89a"),
    le16(canvas.width),
    le16(canvas.height),
    // No global colour table, so nothing follows the descriptor.
    bytes(0x00, 0x00, 0x00),
  );

  const images = frames.map((frame) =>
    concatBytes(
      bytes(0x2c),
      le16(frame.x),
      le16(frame.y),
      le16(frame.width),
      le16(frame.height),
      bytes(0x00),
      // LZW minimum code size, one data sub-block, and the block terminator.
      bytes(0x02, 0x02, 0x4c, 0x01, 0x00),
    ),
  );

  return concatBytes(screen, ...images, bytes(0x3b));
}

// A RIFF/WEBP container around whichever chunks a test wants inside it.
export function buildWebp(
  chunks: Array<{ type: string; payload: Uint8Array }>,
): Uint8Array<ArrayBuffer> {
  const body = concatBytes(
    ascii("WEBP"),
    ...chunks.map(({ type, payload }) =>
      concatBytes(
        ascii(type),
        le32(payload.byteLength),
        payload,
        // Chunks are padded to an even length.
        new Uint8Array(payload.byteLength % 2),
      ),
    ),
  );
  return concatBytes(ascii("RIFF"), le32(body.byteLength), body);
}

// The extended container declaring a canvas of a chosen size, with the lossy
// file's own VP8 chunk inside it.
export function webpDeclaring(
  width: number,
  height: number,
): Uint8Array<ArrayBuffer> {
  return buildWebp([
    {
      type: "VP8X",
      // flags, three reserved bytes, then the canvas stored one less than it is
      payload: concatBytes(
        bytes(0, 0, 0, 0),
        le24(width - 1),
        le24(height - 1),
      ),
    },
    { type: "VP8 ", payload: WEBP_BYTES.slice(20) },
  ]);
}

// An animated WebP: a VP8X canvas, the ANIM chunk, and one ANMF per frame. A
// frame's offsets are stored halved, and its size one less than it is.
export function animatedWebpDeclaring(
  canvas: { width: number; height: number },
  frames: AnimationFrame[],
): Uint8Array<ArrayBuffer> {
  return buildWebp([
    {
      type: "VP8X",
      payload: concatBytes(
        // The animation flag.
        bytes(0x02, 0, 0, 0),
        le24(canvas.width - 1),
        le24(canvas.height - 1),
      ),
    },
    { type: "ANIM", payload: concatBytes(le32(0), le16(0)) },
    ...frames.map((frame) => ({
      type: "ANMF",
      payload: concatBytes(
        le24(frame.x / 2),
        le24(frame.y / 2),
        le24(frame.width - 1),
        le24(frame.height - 1),
        // duration, then flags
        le24(10),
        bytes(0),
        WEBP_BYTES.slice(12),
      ),
    })),
  ]);
}

// The same AVIF with another size written into the `ispe` its metadata carries.
export function avifDeclaring(
  width: number,
  height: number,
): Uint8Array<ArrayBuffer> {
  return patchBytes(
    patchBytes(AVIF_BYTES, AVIF_ISPE_WIDTH_OFFSET, ...be32(width)),
    AVIF_ISPE_HEIGHT_OFFSET,
    ...be32(height),
  );
}

// The same JPEG with another size written into its SOF0 frame header.
export function jpegDeclaring(
  width: number,
  height: number,
): Uint8Array<ArrayBuffer> {
  return patchBytes(
    patchBytes(JPEG_BYTES, JPEG_SOF_WIDTH_OFFSET, ...be16(width)),
    JPEG_SOF_HEIGHT_OFFSET,
    ...be16(height),
  );
}

