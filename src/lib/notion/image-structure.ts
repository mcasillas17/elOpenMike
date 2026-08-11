import type { ImageFormat } from "./image-format";

// Whether a body is a *whole* image, rather than something that begins like one.
//
// A magic prefix says what a file is trying to be and nothing about whether it
// is one. The bytes that reach this check came back from a url an author pasted
// into a Notion page, over a redirect chain, from a server that chose its own
// Content-Type — and "PNG signature at offset zero" is eight bytes anybody can
// write in front of anything: an HTML document, a shell script, a zip archive.
// The file is then committed under public/ and served from the site's own
// origin, where what a browser does with it is decided by the extension the
// sync gave it, which came from the format the sync believed it had proved.
//
// So the whole file is walked, in the terms its own specification is written
// in: PNG's chunks, JPEG's marker segments, GIF's blocks, RIFF's chunks, ISO
// base media's boxes. Three questions, asked of every format:
//
//   * does every structure inside the file *fit* inside the file? A length that
//     runs past the end is a truncated download or a lie about the contents;
//   * does the file *end* where the format says it ends — at IEND, at EOI, at
//     the GIF trailer, at the last byte the RIFF header accounts for? Anything
//     after that is a payload riding along on a real image;
//   * does it declare a picture of a size a picture can have?
//
// Nothing here decodes an image, and nothing here is a substitute for a
// decoder. It is the check that says a body is structurally the thing it claims
// to be, which is what the extension on disk then promises a browser.

// Bigger than any picture on a blog, and smaller than the sizes each format's
// own fields can express. A dimension outside this is either a decompression
// bomb or a field somebody wrote a number into.
export const MAX_IMAGE_DIMENSION = 65_535;

// What a picture costs is not its width or its height but their product, and a
// bound on each side alone leaves 65535 x 65535 — four gigapixels, sixteen
// gigabytes decoded, declared in a hundred-byte header that arrives well inside
// the download's size cap. Nothing here decodes anything; whatever draws,
// resizes or indexes the file later does, and this is the only place the number
// it will be asked for can be refused.
//
// 40 megapixels is comfortably past any photograph a post carries — a 8K frame
// is 33 — and, at the four bytes a decoder holds a pixel of RGBA in, it is
// 160 MB of memory for one picture. That is the ceiling, expressed both ways
// because the pixels are what the file declares and the bytes are what they
// cost.
export const MAX_IMAGE_PIXELS = 40_000_000;
export const DECODED_BYTES_PER_PIXEL = 4;
export const MAX_DECODED_IMAGE_BYTES =
  MAX_IMAGE_PIXELS * DECODED_BYTES_PER_PIXEL;

// An animation is many pictures in one file, and every one of them is a decode.
// A canvas inside the budget above says nothing about that: a GIF, an APNG or
// an animated WebP can carry thousands of frames in a few kilobytes, because a
// frame of one flat colour compresses to almost nothing.
//
// Both halves are needed. A count on its own would allow a thousand
// canvas-sized frames; a total on its own would allow a million one-pixel ones,
// each of which is still a decode, an allocation and a composite. A frame also
// has to *be* inside the canvas it belongs to — a rectangle that starts or ends
// outside one is a file no encoder writes and a size no decoder agrees on.
//
// The total bounds work rather than memory: a decoder composites frames onto
// one canvas, so it holds the canvas and a frame, not the sum. 250 megapixels
// is a second or so of that work, and past any animation a blog post carries.
export const MAX_IMAGE_FRAMES = 1_024;
export const MAX_ANIMATION_PIXELS = 250_000_000;

function isSaneDimension(value: number): boolean {
  return Number.isInteger(value) && value > 0 && value <= MAX_IMAGE_DIMENSION;
}

// A whole picture: each side inside the per-side cap, and the two of them
// together inside the decoded budget.
function isSanePicture(width: number, height: number): boolean {
  return (
    isSaneDimension(width) &&
    isSaneDimension(height) &&
    width * height <= MAX_IMAGE_PIXELS
  );
}

// One frame of an animation, and what the frames before it have already cost.
// The rectangle has to be a picture, it has to lie entirely inside the canvas,
// and the animation has to still be inside both of its budgets.
class FrameBudget {
  private frames = 0;
  private pixels = 0;

  constructor(
    private readonly canvasWidth: number,
    private readonly canvasHeight: number,
  ) {}

  add(x: number, y: number, width: number, height: number): boolean {
    if (!isSanePicture(width, height)) return false;
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0) {
      return false;
    }
    if (x + width > this.canvasWidth || y + height > this.canvasHeight) {
      return false;
    }

    this.frames += 1;
    this.pixels += width * height;
    return (
      this.frames <= MAX_IMAGE_FRAMES && this.pixels <= MAX_ANIMATION_PIXELS
    );
  }
}


function u16be(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function u16le(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function u24le(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] + bytes[offset + 1] * 0x100 + bytes[offset + 2] * 0x10000
  );
}

// Unsigned, and built by multiplication rather than by shifting: `<< 24` in JS
// is a *signed* 32-bit operation, so a length with its top bit set comes back
// negative and every bounds check made with it passes.
function u32be(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] * 0x1000000 +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3]
  );
}

function u32le(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] +
    (bytes[offset + 1] << 8) +
    (bytes[offset + 2] << 16) +
    bytes[offset + 3] * 0x1000000
  );
}

function fourcc(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset],
    bytes[offset + 1],
    bytes[offset + 2],
    bytes[offset + 3],
  );
}

// ---------------------------------------------------------------------------
// PNG: an 8-byte signature and then a stream of length/type/data/CRC chunks,
// opening with IHDR and closing with IEND.
// ---------------------------------------------------------------------------

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
// The spec's own cap: a chunk length is a 31-bit number.
const MAX_PNG_CHUNK = 0x7fffffff;
const PNG_BIT_DEPTHS = new Set([1, 2, 4, 8, 16]);
const PNG_COLOR_TYPES = new Set([0, 2, 3, 4, 6]);
// An APNG's animation control (frame count and play count) and the frame
// control that opens each frame: a sequence number, the frame's own rectangle,
// a delay, and the two operators.
const PNG_ACTL_BYTES = 8;
const PNG_FCTL_BYTES = 26;

function isCompletePng(bytes: Uint8Array): boolean {
  if (bytes.byteLength < PNG_SIGNATURE.length) return false;
  if (PNG_SIGNATURE.some((byte, index) => bytes[index] !== byte)) return false;

  let offset = PNG_SIGNATURE.length;
  let ended = false;
  // The canvas the IHDR declared, and what the frames after it have cost.
  let frames: FrameBudget | undefined;

  while (offset + 8 <= bytes.byteLength) {
    const length = u32be(bytes, offset);
    if (length > MAX_PNG_CHUNK) return false;

    const type = fourcc(bytes, offset + 4);
    // length + type + data + CRC.
    const next = offset + 12 + length;
    if (next > bytes.byteLength) return false;

    if (frames === undefined) {
      if (type !== "IHDR" || length !== 13) return false;
      const canvas = pngHeader(bytes, offset + 8);
      if (!canvas) return false;
      frames = new FrameBudget(canvas.width, canvas.height);
    } else if (type === "acTL") {
      // An APNG says up front how many frames it has.
      if (length !== PNG_ACTL_BYTES) return false;
      const declared = u32be(bytes, offset + 8);
      if (declared < 1 || declared > MAX_IMAGE_FRAMES) return false;
    } else if (type === "fcTL") {
      // Every frame of an APNG carries its own rectangle, which has to lie
      // inside the canvas the IHDR declared.
      if (length !== PNG_FCTL_BYTES) return false;
      const at = offset + 8;
      const added = frames.add(
        u32be(bytes, at + 12),
        u32be(bytes, at + 16),
        u32be(bytes, at + 4),
        u32be(bytes, at + 8),
      );
      if (!added) return false;
    }

    if (type === "IEND") {
      if (length !== 0) return false;
      ended = true;
      offset = next;
      break;
    }

    offset = next;
  }

  // Nothing before the signature, nothing after IEND.
  return ended && offset === bytes.byteLength;
}

// The picture an IHDR declares, or undefined when what it declares is not one.
function pngHeader(
  bytes: Uint8Array,
  offset: number,
): { width: number; height: number } | undefined {
  const width = u32be(bytes, offset);
  const height = u32be(bytes, offset + 4);
  const depth = bytes[offset + 8];
  const color = bytes[offset + 9];
  const compression = bytes[offset + 10];
  const filter = bytes[offset + 11];
  const interlace = bytes[offset + 12];

  const sane =
    isSanePicture(width, height) &&
    PNG_BIT_DEPTHS.has(depth) &&
    PNG_COLOR_TYPES.has(color) &&
    compression === 0 &&
    filter === 0 &&
    interlace <= 1;

  return sane ? { width, height } : undefined;
}

// ---------------------------------------------------------------------------
// JPEG: SOI, a run of marker segments, the entropy-coded scan, EOI.
// ---------------------------------------------------------------------------

// The frame headers that carry the picture's size. Not 0xc4 (Huffman tables),
// 0xc8 (reserved) or 0xcc (arithmetic coding conditioning), which share the
// range and describe something else.
function isFrameHeader(marker: number): boolean {
  return (
    marker >= 0xc0 &&
    marker <= 0xcf &&
    marker !== 0xc4 &&
    marker !== 0xc8 &&
    marker !== 0xcc
  );
}

// Markers that stand alone: no length, no payload.
function isStandalone(marker: number): boolean {
  return marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7);
}

function isCompleteJpeg(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return false;
  }

  let offset = 2;
  let framed = false;
  // A JPEG normally carries one frame; a hierarchical one carries several, and
  // each of them is a decode of its own.
  let frames = 0;
  let pixels = 0;

  while (offset < bytes.byteLength) {
    if (bytes[offset] !== 0xff) return false;

    // Any number of 0xff bytes may pad the space before a marker.
    let at = offset + 1;
    while (at < bytes.byteLength && bytes[at] === 0xff) at += 1;
    if (at >= bytes.byteLength) return false;

    const marker = bytes[at];
    offset = at + 1;

    // A second SOI is two files in one, which is a polyglot rather than a
    // picture.
    if (marker === 0xd8) return false;
    if (marker === 0xd9) {
      // EOI: the frame has to have been described, and the file has to stop.
      return framed && offset === bytes.byteLength;
    }
    if (isStandalone(marker)) continue;

    if (offset + 2 > bytes.byteLength) return false;
    const length = u16be(bytes, offset);
    // The length counts itself, so anything below two is not a length.
    if (length < 2 || offset + length > bytes.byteLength) return false;

    if (isFrameHeader(marker)) {
      if (length < 8) return false;
      const height = u16be(bytes, offset + 3);
      const width = u16be(bytes, offset + 5);
      const components = bytes[offset + 7];
      if (!isSanePicture(width, height)) return false;
      if (components === 0) return false;
      frames += 1;
      pixels += width * height;
      if (frames > MAX_IMAGE_FRAMES || pixels > MAX_ANIMATION_PIXELS) {
        return false;
      }
      framed = true;
    }

    offset += length;

    if (marker === 0xda) {
      // SOS is followed by entropy-coded data rather than by another segment.
      const end = endOfScan(bytes, offset);
      if (end === -1) return false;
      offset = end;
    }
  }

  return false;
}

// Where the entropy-coded data stops: the first 0xff that is a marker rather
// than a stuffed byte (0xff 0x00), a fill byte (0xff 0xff) or a restart
// (0xff 0xd0..0xd7).
function endOfScan(bytes: Uint8Array, from: number): number {
  for (let index = from; index + 1 < bytes.byteLength; index++) {
    if (bytes[index] !== 0xff) continue;
    const next = bytes[index + 1];
    if (next === 0x00 || next === 0xff) continue;
    if (next >= 0xd0 && next <= 0xd7) continue;
    return index;
  }
  return -1;
}

// ---------------------------------------------------------------------------
// GIF: header, logical screen descriptor, an optional global colour table, a
// run of extension and image blocks, and the trailer.
// ---------------------------------------------------------------------------

const GIF_HEADERS = ["GIF87a", "GIF89a"];

function isCompleteGif(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 14) return false;
  const header = String.fromCharCode(...bytes.slice(0, 6));
  if (!GIF_HEADERS.includes(header)) return false;

  // The logical screen: the canvas every frame is drawn into. Both of its
  // fields are 16 bits, so a file of a hundred bytes can ask for four
  // gigapixels here.
  const width = u16le(bytes, 6);
  const height = u16le(bytes, 8);
  if (!isSanePicture(width, height)) return false;
  const frames = new FrameBudget(width, height);

  const packed = bytes[10];
  let offset = 13 + colorTableBytes(packed);
  if (offset > bytes.byteLength) return false;

  for (;;) {
    if (offset >= bytes.byteLength) return false;
    const block = bytes[offset];
    offset += 1;

    if (block === 0x3b) {
      // The trailer, and the end of the file.
      return offset === bytes.byteLength;
    }

    if (block === 0x21) {
      // An extension: a label, then sub-blocks.
      if (offset >= bytes.byteLength) return false;
      offset = skipSubBlocks(bytes, offset + 1);
    } else if (block === 0x2c) {
      // An image descriptor: its own frame, an optional local colour table, the
      // LZW minimum code size, then sub-blocks.
      //
      // Every one of these is a picture in its own right, drawn at its own
      // offset — so it has to fit inside the logical screen, and there has to
      // be a limit on how many of them there are and on what they add up to.
      // A frame of one flat colour is a handful of bytes, which is how a few
      // kilobytes come to hold thousands of decodes.
      if (offset + 9 > bytes.byteLength) return false;
      const added = frames.add(
        u16le(bytes, offset),
        u16le(bytes, offset + 2),
        u16le(bytes, offset + 4),
        u16le(bytes, offset + 6),
      );
      if (!added) return false;
      const local = bytes[offset + 8];
      offset += 9 + colorTableBytes(local);
      if (offset >= bytes.byteLength) return false;
      offset = skipSubBlocks(bytes, offset + 1);
    } else {
      return false;
    }

    if (offset === -1) return false;
  }
}

function colorTableBytes(packed: number): number {
  return (packed & 0x80) === 0 ? 0 : 3 * (1 << ((packed & 0x07) + 1));
}

// Past a chain of length-prefixed sub-blocks, or -1 when one of them runs off
// the end of the file.
function skipSubBlocks(bytes: Uint8Array, from: number): number {
  let offset = from;
  for (;;) {
    if (offset >= bytes.byteLength) return -1;
    const size = bytes[offset];
    offset += 1;
    if (size === 0) return offset;
    offset += size;
    if (offset > bytes.byteLength) return -1;
  }
}

// ---------------------------------------------------------------------------
// WebP: a RIFF container whose form is WEBP, holding a VP8 (lossy), VP8L
// (lossless) or VP8X (extended) chunk first.
// ---------------------------------------------------------------------------

// A VP8 or VP8L field is 14 bits wide, so the format cannot express a larger
// picture than this.
const MAX_WEBP_DIMENSION = 16_383;

// An animation frame's own header: two 24-bit offsets, two 24-bit sizes, a
// duration and a byte of flags, before the sub-chunks that hold its picture.
const WEBP_ANMF_HEADER_BYTES = 16;

function isCompleteWebp(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 20) return false;
  if (fourcc(bytes, 0) !== "RIFF" || fourcc(bytes, 8) !== "WEBP") return false;

  // The RIFF size counts everything after itself, so the file is exactly eight
  // bytes longer. A mismatch is a truncated download or a file with something
  // appended to it.
  if (u32le(bytes, 4) !== bytes.byteLength - 8) return false;

  let offset = 12;
  // The canvas the first chunk declared, and what the frames after it cost.
  let frames: FrameBudget | undefined;

  while (offset + 8 <= bytes.byteLength) {
    const type = fourcc(bytes, offset);
    const size = u32le(bytes, offset + 4);
    // Chunks are padded to an even length; the pad byte is not counted.
    const next = offset + 8 + size + (size % 2);
    if (next > bytes.byteLength || size > bytes.byteLength) return false;

    if (frames === undefined) {
      const canvas = webpCanvas(type, bytes, offset + 8, size);
      if (!canvas) return false;
      frames = new FrameBudget(canvas.width, canvas.height);
    } else if (type === "ANMF") {
      // Each frame of an animated WebP is drawn at its own offset inside the
      // canvas the VP8X declared. The offsets are stored halved, and the sizes
      // one less than they are.
      if (size < WEBP_ANMF_HEADER_BYTES) return false;
      const at = offset + 8;
      const added = frames.add(
        u24le(bytes, at) * 2,
        u24le(bytes, at + 3) * 2,
        u24le(bytes, at + 6) + 1,
        u24le(bytes, at + 9) + 1,
      );
      if (!added) return false;
    }

    offset = next;
  }

  return frames !== undefined && offset === bytes.byteLength;
}

// The picture the first chunk declares, or undefined when that chunk carries no
// picture at all.
function webpCanvas(
  type: string,
  bytes: Uint8Array,
  offset: number,
  size: number,
): { width: number; height: number } | undefined {
  if (type === "VP8 ") return vp8Size(bytes, offset, size);
  if (type === "VP8L") return vp8lSize(bytes, offset, size);
  if (type === "VP8X") return vp8xSize(bytes, offset, size);
  return undefined;
}

// A VP8 or VP8L field is 14 bits wide, so those two cannot express a picture
// larger than 16383 a side however big the budget is.
function isSaneWebpPicture(width: number, height: number): boolean {
  return (
    isSanePicture(width, height) &&
    width <= MAX_WEBP_DIMENSION &&
    height <= MAX_WEBP_DIMENSION
  );
}

// The lossy keyframe header: a three-byte frame tag whose low bit says
// keyframe, the start code, then two 14-bit sizes.
function vp8Size(
  bytes: Uint8Array,
  offset: number,
  size: number,
): { width: number; height: number } | undefined {
  if (size < 10) return undefined;
  const tag = u24le(bytes, offset);
  if ((tag & 1) !== 0) return undefined;
  if (
    bytes[offset + 3] !== 0x9d ||
    bytes[offset + 4] !== 0x01 ||
    bytes[offset + 5] !== 0x2a
  ) {
    return undefined;
  }
  const width = u16le(bytes, offset + 6) & 0x3fff;
  const height = u16le(bytes, offset + 8) & 0x3fff;
  return isSaneWebpPicture(width, height) ? { width, height } : undefined;
}

// The lossless header: a signature byte, then two 14-bit sizes packed into the
// bitstream, each stored one less than it is.
function vp8lSize(
  bytes: Uint8Array,
  offset: number,
  size: number,
): { width: number; height: number } | undefined {
  if (size < 5 || bytes[offset] !== 0x2f) return undefined;
  const packed = u32le(bytes, offset + 1);
  const width = (packed & 0x3fff) + 1;
  const height = ((packed >>> 14) & 0x3fff) + 1;
  return isSaneWebpPicture(width, height) ? { width, height } : undefined;
}

// The extended header: flags, three reserved bytes, then the canvas size as two
// 24-bit fields, each stored one less than it is. This one can express a canvas
// of sixteen million a side, which is the whole reason the budget exists.
function vp8xSize(
  bytes: Uint8Array,
  offset: number,
  size: number,
): { width: number; height: number } | undefined {
  if (size !== 10) return undefined;
  const width = u24le(bytes, offset + 4) + 1;
  const height = u24le(bytes, offset + 7) + 1;
  return isSanePicture(width, height) ? { width, height } : undefined;
}

// ---------------------------------------------------------------------------
// AVIF: ISO base media boxes. `ftyp` names the brands, `meta` describes the
// picture, and `mdat` (or `idat`) holds it.
// ---------------------------------------------------------------------------

const AVIF_BRANDS = new Set(["avif", "avis"]);
// Enough for any real file's box tree, and a bound on the walk.
const MAX_BOXES = 512;
const MAX_BOX_DEPTH = 6;

type Box = { type: string; start: number; end: number; body: number };

// Every box between `from` and `to`, or undefined when they do not tile that
// range exactly: a box that runs past the end, one that claims less than its
// own header, or a gap left over at the end.
function boxesIn(
  bytes: Uint8Array,
  from: number,
  to: number,
): Box[] | undefined {
  const boxes: Box[] = [];
  let offset = from;

  while (offset < to) {
    if (offset + 8 > to || boxes.length >= MAX_BOXES) return undefined;

    const declared = u32be(bytes, offset);
    const type = fourcc(bytes, offset + 4);
    let body = offset + 8;
    let end: number;

    if (declared === 1) {
      // The 64-bit form. Anything past 2^53 is not a length this can measure,
      // and is far past any file this downloads.
      if (offset + 16 > to) return undefined;
      const high = u32be(bytes, offset + 8);
      const low = u32be(bytes, offset + 12);
      if (high !== 0) return undefined;
      body = offset + 16;
      end = offset + low;
      if (low < 16) return undefined;
    } else if (declared === 0) {
      // "To the end of the file", which only the last box may say.
      end = to;
    } else {
      if (declared < 8) return undefined;
      end = offset + declared;
    }

    if (end > to || end <= offset) return undefined;
    boxes.push({ type, start: offset, end, body });
    offset = end;
  }

  return offset === to ? boxes : undefined;
}

function isCompleteAvif(bytes: Uint8Array): boolean {
  const boxes = boxesIn(bytes, 0, bytes.byteLength);
  if (!boxes || boxes.length === 0) return false;

  const [ftyp] = boxes;
  if (ftyp.type !== "ftyp" || !namesAvif(bytes, ftyp)) return false;

  const meta = boxes.find((box) => box.type === "meta");
  // A description with no picture behind it is a truncated file.
  const data = boxes.some((box) => box.type === "mdat" || box.type === "idat");
  if (!meta || !data) return false;

  // Every `ispe` the metadata carries, not the first one: a file can describe
  // several items, and a thumbnail with an ordinary size says nothing about the
  // one beside it that asks for four gigapixels.
  const sizes = pictureSizes(bytes, meta);
  return (
    sizes !== undefined &&
    sizes.length > 0 &&
    sizes.every((size) => isSanePicture(size.width, size.height))
  );
}

// The major brand, or any of the compatible brands after the minor version.
function namesAvif(bytes: Uint8Array, ftyp: Box): boolean {
  if (ftyp.body + 8 > ftyp.end) return false;
  if (AVIF_BRANDS.has(fourcc(bytes, ftyp.body))) return true;

  for (let offset = ftyp.body + 8; offset + 4 <= ftyp.end; offset += 4) {
    if (AVIF_BRANDS.has(fourcc(bytes, offset))) return true;
  }
  return false;
}

// The `ispe` properties inside meta → iprp → ipco, which is where an AVIF says
// how big its pictures are. A file whose metadata stops before this is a file
// whose download stopped.
function pictureSizes(
  bytes: Uint8Array,
  meta: Box,
): Array<{ width: number; height: number }> | undefined {
  // `meta` is a full box: a version and flags sit before its children.
  return collectIspe(bytes, meta.body + 4, meta.end, 0);
}

// Only the containers on the path are descended into; an unknown box is a leaf
// as far as this is concerned, so nothing is misread as a box tree.
const ISPE_CONTAINERS = new Set(["iprp", "ipco"]);

function collectIspe(
  bytes: Uint8Array,
  from: number,
  to: number,
  depth: number,
): Array<{ width: number; height: number }> | undefined {
  if (depth > MAX_BOX_DEPTH || from > to) return undefined;
  const boxes = boxesIn(bytes, from, to);
  if (!boxes) return undefined;

  const sizes: Array<{ width: number; height: number }> = [];
  for (const box of boxes) {
    if (box.type === "ispe") {
      // A full box: version and flags, then two 32-bit dimensions.
      if (box.body + 12 > box.end) return undefined;
      sizes.push({
        width: u32be(bytes, box.body + 4),
        height: u32be(bytes, box.body + 8),
      });
    }
    if (ISPE_CONTAINERS.has(box.type)) {
      const found = collectIspe(bytes, box.body, box.end, depth + 1);
      if (!found) return undefined;
      sizes.push(...found);
    }
  }

  return sizes;
}

// ---------------------------------------------------------------------------

const VALIDATORS: Record<ImageFormat, (bytes: Uint8Array) => boolean> = {
  png: isCompletePng,
  jpeg: isCompleteJpeg,
  gif: isCompleteGif,
  webp: isCompleteWebp,
  avif: isCompleteAvif,
};

// True when these bytes are a complete, well-formed file of that format.
export function isCompleteImage(
  format: ImageFormat,
  bytes: Uint8Array,
): boolean {
  return VALIDATORS[format](bytes);
}
