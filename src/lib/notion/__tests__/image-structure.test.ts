import { describe, it, expect } from "vitest";
import {
  ImageFormatError,
  isCompleteImage,
  verifyImageFormat,
  MAX_IMAGE_DIMENSION,
  type ImageFormat,
} from "@/lib/notion/image-format";
import {
  asciiBytes as ascii,
  concatBytes as concat,
  patchBytes as patch,
  rawBytes as raw,
  AVIF_BYTES,
  AVIF_EMPTY_IDAT_BYTES,
  AVIF_EMPTY_MDAT_BYTES,
  AVIF_ISPE_HEIGHT_OFFSET,
  AVIF_ISPE_WIDTH_OFFSET,
  AVIF_MDAT_OFFSET,
  AVIF_META_POLYGLOT_BYTES,
  AVIF_NESTED_IDAT_BYTES,
  AVIF_NESTED_IDAT_SIZE_OFFSET,
  AVIF_NESTED_META_SIZE_OFFSET,
  AVIF_NO_DATA_BYTES,
  AVIF_PREFIX,
  AVIF_TOP_LEVEL_IDAT_BYTES,
  GIF87_BYTES,
  GIF89_BYTES,
  GIF_FIRST_BLOCK_OFFSET,
  GIF_FIRST_SUB_BLOCK_SIZE_OFFSET,
  GIF_HEIGHT_OFFSET,
  GIF_PREFIX,
  GIF_WIDTH_OFFSET,
  JPEG_BYTES,
  JPEG_PREFIX,
  JPEG_SOF_HEIGHT_OFFSET,
  JPEG_SOF_WIDTH_OFFSET,
  PNG_BIT_DEPTH_OFFSET,
  PNG_BYTES,
  PNG_HEIGHT_OFFSET,
  PNG_IHDR_LENGTH_OFFSET,
  PNG_PREFIX,
  PNG_WIDTH_OFFSET,
  SCRIPT_SVG_BYTES,
  WEBP_BYTES,
  WEBP_EXTENDED_BYTES,
  WEBP_LOSSLESS_BYTES,
  WEBP_PREFIX,
  WEBP_RIFF_SIZE_OFFSET,
  WEBP_VP8_START_CODE_OFFSET,
  WEBP_VP8X_WIDTH_OFFSET,
} from "./fixtures/images";

// A magic prefix says what a file is *trying* to be. It says nothing at all
// about whether it is one.
//
// The bytes reaching this check came back from a url an author pasted into a
// Notion page, over a redirect chain, from a server that chose its own
// Content-Type. "PNG signature at offset zero" is eight bytes anybody can write
// in front of anything: an HTML document, a shell script, a zip. The file is
// then committed under public/ and served from the site's own origin, where
// what a browser does with it is decided by its extension — which the sync
// takes from the format it thinks it proved.
//
// So the whole file is walked instead. Each format is read the way its own
// specification defines it — chunk by chunk, segment by segment, box by box —
// and it is only an image if every structure inside it lands within the file,
// the file ends where the format says it ends, and the picture it declares has
// a size a picture can have. A prefix, a truncation, a length that does not
// match, a document stapled to the end: none of them survive that.

const VALID: Array<[ImageFormat, Uint8Array, string]> = [
  ["png", PNG_BYTES, "image/png"],
  ["jpeg", JPEG_BYTES, "image/jpeg"],
  ["gif", GIF87_BYTES, "image/gif"],
  ["gif", GIF89_BYTES, "image/gif"],
  ["webp", WEBP_BYTES, "image/webp"],
  ["webp", WEBP_LOSSLESS_BYTES, "image/webp"],
  ["webp", WEBP_EXTENDED_BYTES, "image/webp"],
  ["avif", AVIF_BYTES, "image/avif"],
  ["avif", AVIF_NESTED_IDAT_BYTES, "image/avif"],
];

describe("a whole, well-formed file of each format", () => {
  it.each(VALID)("accepts a real %s", (format, sample) => {
    expect(isCompleteImage(format, sample)).toBe(true);
  });

  it.each(VALID)("lets a real %s through the whole check", (format, sample, header) => {
    expect(verifyImageFormat(header, sample)).toBe(format);
  });
});

describe("the signature on its own", () => {
  const prefixes: Array<[ImageFormat, Uint8Array]> = [
    ["png", PNG_PREFIX],
    ["jpeg", JPEG_PREFIX],
    ["gif", GIF_PREFIX],
    ["webp", WEBP_PREFIX],
    ["avif", AVIF_PREFIX],
  ];

  it.each(prefixes)("is not a %s", (format, prefix) => {
    expect(isCompleteImage(format, prefix)).toBe(false);
  });

  it.each(prefixes)("is refused as a %s by the whole check", (format, prefix) => {
    expect(() =>
      verifyImageFormat(`image/${format}`, prefix),
    ).toThrow(ImageFormatError);
  });
});

describe("a file cut short", () => {
  // Every boundary, not a sample of them: a truncation is only interesting
  // where it lands, and every chunk header, segment length and box size in
  // these files is a place it could land.
  it.each(VALID)("is not a %s at any length", (format, sample) => {
    const truncations: number[] = [];
    for (let length = 0; length < sample.byteLength; length++) {
      if (isCompleteImage(format, sample.slice(0, length))) {
        truncations.push(length);
      }
    }
    expect(truncations).toEqual([]);
  });
});

describe("a document stapled to a real image", () => {
  it.each(VALID)("is not a %s", (format, sample) => {
    expect(isCompleteImage(format, concat(sample, SCRIPT_SVG_BYTES))).toBe(
      false,
    );
  });

  it.each(VALID)("is refused as a %s however it is declared", (format, sample, header) => {
    expect(() =>
      verifyImageFormat(header, concat(sample, SCRIPT_SVG_BYTES)),
    ).toThrow(ImageFormatError);
  });

  it.each(VALID)("is not a %s with a single byte appended either", (format, sample) => {
    expect(isCompleteImage(format, concat(sample, raw(0)))).toBe(false);
  });
});

describe("a polyglot that opens as an image and goes on to be a document", () => {
  it("is refused even though it sniffs as a GIF", () => {
    const polyglot = concat(GIF89_BYTES.slice(0, 13), SCRIPT_SVG_BYTES);

    expect(isCompleteImage("gif", polyglot)).toBe(false);
    expect(() => verifyImageFormat("image/gif", polyglot)).toThrow(
      ImageFormatError,
    );
  });

  it("is refused when the document sits inside a PNG's chunk stream", () => {
    const polyglot = concat(PNG_BYTES.slice(0, 33), SCRIPT_SVG_BYTES);

    expect(isCompleteImage("png", polyglot)).toBe(false);
  });
});

describe("PNG structure", () => {
  it("refuses an IHDR that is not 13 bytes", () => {
    expect(
      isCompleteImage("png", patch(PNG_BYTES, PNG_IHDR_LENGTH_OFFSET, 0, 0, 0, 12)),
    ).toBe(false);
  });

  it("refuses a zero width or height", () => {
    expect(
      isCompleteImage("png", patch(PNG_BYTES, PNG_WIDTH_OFFSET, 0, 0, 0, 0)),
    ).toBe(false);
    expect(
      isCompleteImage("png", patch(PNG_BYTES, PNG_HEIGHT_OFFSET, 0, 0, 0, 0)),
    ).toBe(false);
  });

  it("refuses a picture no picture could be", () => {
    expect(
      isCompleteImage("png", patch(PNG_BYTES, PNG_WIDTH_OFFSET, 0x7f, 0xff, 0xff, 0xff)),
    ).toBe(false);
  });

  it("refuses a bit depth the format does not define", () => {
    expect(isCompleteImage("png", patch(PNG_BYTES, PNG_BIT_DEPTH_OFFSET, 7))).toBe(
      false,
    );
  });

  it("refuses a chunk whose length runs past the end of the file", () => {
    // The IDAT chunk's length, made larger than the bytes that follow it.
    expect(
      isCompleteImage("png", patch(PNG_BYTES, 33, 0x00, 0x00, 0x10, 0x00)),
    ).toBe(false);
  });

  it("refuses a file with no IEND at all", () => {
    expect(isCompleteImage("png", PNG_BYTES.slice(0, PNG_BYTES.byteLength - 12))).toBe(
      false,
    );
  });

  it("refuses a first chunk that is not IHDR", () => {
    expect(isCompleteImage("png", patch(PNG_BYTES, 12, ...ascii("IDAT")))).toBe(
      false,
    );
  });
});

describe("JPEG structure", () => {
  it("refuses a zero width or height in the frame header", () => {
    expect(
      isCompleteImage("jpeg", patch(JPEG_BYTES, JPEG_SOF_WIDTH_OFFSET, 0, 0)),
    ).toBe(false);
    expect(
      isCompleteImage("jpeg", patch(JPEG_BYTES, JPEG_SOF_HEIGHT_OFFSET, 0, 0)),
    ).toBe(false);
  });

  it("refuses a file with no frame header at all", () => {
    // SOI, then straight to EOI: a marker stream with no picture in it.
    expect(isCompleteImage("jpeg", raw(0xff, 0xd8, 0xff, 0xd9))).toBe(false);
  });

  it("refuses a file that never reaches EOI", () => {
    expect(
      isCompleteImage("jpeg", JPEG_BYTES.slice(0, JPEG_BYTES.byteLength - 2)),
    ).toBe(false);
  });

  it("refuses a segment whose length runs past the end of the file", () => {
    // The APP0 segment's length.
    expect(isCompleteImage("jpeg", patch(JPEG_BYTES, 4, 0x7f, 0xff))).toBe(false);
  });

  it("refuses a segment claiming a length no segment can have", () => {
    expect(isCompleteImage("jpeg", patch(JPEG_BYTES, 4, 0x00, 0x00))).toBe(false);
  });
});

describe("GIF structure", () => {
  it("refuses a zero width or height", () => {
    expect(isCompleteImage("gif", patch(GIF89_BYTES, GIF_WIDTH_OFFSET, 0, 0))).toBe(
      false,
    );
    expect(isCompleteImage("gif", patch(GIF89_BYTES, GIF_HEIGHT_OFFSET, 0, 0))).toBe(
      false,
    );
  });

  it("refuses a file with no trailer", () => {
    expect(
      isCompleteImage("gif", GIF89_BYTES.slice(0, GIF89_BYTES.byteLength - 1)),
    ).toBe(false);
  });

  it("refuses a block type the format does not define", () => {
    expect(
      isCompleteImage("gif", patch(GIF89_BYTES, GIF_FIRST_BLOCK_OFFSET, 0x5a)),
    ).toBe(false);
  });

  it("refuses a sub-block that runs past the end of the file", () => {
    expect(
      isCompleteImage(
        "gif",
        patch(GIF89_BYTES, GIF_FIRST_SUB_BLOCK_SIZE_OFFSET, 0xff),
      ),
    ).toBe(false);
  });
});

describe("WebP structure", () => {
  it("refuses a RIFF size that does not match the file", () => {
    expect(
      isCompleteImage("webp", patch(WEBP_BYTES, WEBP_RIFF_SIZE_OFFSET, 0xff, 0, 0, 0)),
    ).toBe(false);
    expect(
      isCompleteImage("webp", patch(WEBP_BYTES, WEBP_RIFF_SIZE_OFFSET, 0x10, 0, 0, 0)),
    ).toBe(false);
  });

  it("refuses a chunk whose size runs past the declared RIFF size", () => {
    expect(isCompleteImage("webp", patch(WEBP_BYTES, 16, 0xf0, 0, 0, 0))).toBe(
      false,
    );
  });

  it("refuses a first chunk that carries no picture", () => {
    expect(isCompleteImage("webp", patch(WEBP_BYTES, 12, ...ascii("EXIF")))).toBe(
      false,
    );
  });

  it("refuses a VP8 bitstream with the wrong start code", () => {
    expect(
      isCompleteImage("webp", patch(WEBP_BYTES, WEBP_VP8_START_CODE_OFFSET, 0x00)),
    ).toBe(false);
  });

  it("refuses a canvas no canvas could be in an extended file", () => {
    // VP8X stores the canvas size one less than it is, so an all-ones field
    // means sixteen million pixels across.
    const huge = patch(
      WEBP_EXTENDED_BYTES,
      WEBP_VP8X_WIDTH_OFFSET,
      0xff,
      0xff,
      0xff,
    );

    expect(isCompleteImage("webp", huge)).toBe(false);
  });

  it("refuses a container that is not WEBP", () => {
    expect(isCompleteImage("webp", patch(WEBP_BYTES, 8, ...ascii("WAVE")))).toBe(
      false,
    );
  });
});

describe("AVIF structure", () => {
  it("refuses a box whose size runs past the end of the file", () => {
    expect(isCompleteImage("avif", patch(AVIF_BYTES, 0, 0x00, 0x00, 0xf0, 0x00))).toBe(
      false,
    );
  });

  it("refuses a box claiming a size smaller than its own header", () => {
    expect(isCompleteImage("avif", patch(AVIF_BYTES, 0, 0x00, 0x00, 0x00, 0x04))).toBe(
      false,
    );
  });

  it("refuses a first box that is not ftyp", () => {
    expect(isCompleteImage("avif", patch(AVIF_BYTES, 4, ...ascii("moov")))).toBe(
      false,
    );
  });

  it("refuses brands that never mention AVIF", () => {
    const heic = patch(AVIF_BYTES, 8, ...ascii("heic"));
    expect(
      isCompleteImage("avif", patch(heic, 16, ...ascii("heicmsf1"))),
    ).toBe(false);
  });

  it("refuses a file carrying metadata but no image data", () => {
    // Everything up to the mdat box: the description of a picture whose bytes
    // never arrived.
    expect(isCompleteImage("avif", AVIF_BYTES.slice(0, AVIF_MDAT_OFFSET))).toBe(
      false,
    );
  });

  it("refuses a declared picture size a picture cannot have", () => {
    expect(
      isCompleteImage("avif", patch(AVIF_BYTES, AVIF_ISPE_WIDTH_OFFSET, 0, 0, 0, 0)),
    ).toBe(false);
    expect(
      isCompleteImage("avif", patch(AVIF_BYTES, AVIF_ISPE_HEIGHT_OFFSET, 0, 0, 0, 0)),
    ).toBe(false);
    expect(
      isCompleteImage(
        "avif",
        patch(AVIF_BYTES, AVIF_ISPE_WIDTH_OFFSET, 0x00, 0x01, 0x00, 0x00),
      ),
    ).toBe(false);
  });

  it("refuses metadata with no picture size in it at all", () => {
    // `ispe` renamed: the box is still there, and nothing says how big the
    // picture is.
    expect(isCompleteImage("avif", patch(AVIF_BYTES, 252, ...ascii("free")))).toBe(
      false,
    );
  });
});

// ISO base media lets a still image keep its coded bytes in either of two
// places: a top-level `mdat`, or an `idat` inside the `meta` that describes it.
// An item data box is a child of meta and never a box of its own at the top of
// a file, and meta is a full box — a version and three flag bytes before its
// children — so finding one means reading past those rather than treating the
// first four bytes of the version as a box header.
describe("where an AVIF keeps its picture", () => {
  it("accepts one carried in an idat inside the metadata", () => {
    expect(isCompleteImage("avif", AVIF_NESTED_IDAT_BYTES)).toBe(true);
    expect(verifyImageFormat("image/avif", AVIF_NESTED_IDAT_BYTES)).toBe("avif");
  });

  it("refuses a description with no picture behind it at all", () => {
    expect(isCompleteImage("avif", AVIF_NO_DATA_BYTES)).toBe(false);
  });

  it("refuses an item data box holding nothing", () => {
    expect(isCompleteImage("avif", AVIF_EMPTY_IDAT_BYTES)).toBe(false);
  });

  it("refuses a media data box holding nothing", () => {
    expect(isCompleteImage("avif", AVIF_EMPTY_MDAT_BYTES)).toBe(false);
  });

  // An `idat` is meaningful inside the metadata that locates it and nowhere
  // else, so one at the top of a file is a box of arbitrary bytes wearing a
  // name the check used to accept as a picture.
  it("refuses an item data box at the top of the file", () => {
    expect(isCompleteImage("avif", AVIF_TOP_LEVEL_IDAT_BYTES)).toBe(false);
  });
});

describe("the bounds of an AVIF's metadata", () => {
  const metaSize = (bytes: Uint8Array): number =>
    (bytes[AVIF_NESTED_META_SIZE_OFFSET] << 24) +
    (bytes[AVIF_NESTED_META_SIZE_OFFSET + 1] << 16) +
    (bytes[AVIF_NESTED_META_SIZE_OFFSET + 2] << 8) +
    bytes[AVIF_NESTED_META_SIZE_OFFSET + 3];

  const withMetaSize = (size: number): Uint8Array =>
    patch(
      AVIF_NESTED_IDAT_BYTES,
      AVIF_NESTED_META_SIZE_OFFSET,
      (size >>> 24) & 0xff,
      (size >>> 16) & 0xff,
      (size >>> 8) & 0xff,
      size & 0xff,
    );

  it("refuses a meta box its children do not tile exactly", () => {
    const declared = metaSize(AVIF_NESTED_IDAT_BYTES);
    for (const size of [declared - 4, declared + 4, 8, 10, 0x7fffffff]) {
      expect(isCompleteImage("avif", withMetaSize(size))).toBe(false);
    }
  });

  it("refuses an item data box that runs past the metadata holding it", () => {
    expect(
      isCompleteImage(
        "avif",
        patch(AVIF_NESTED_IDAT_BYTES, AVIF_NESTED_IDAT_SIZE_OFFSET, 0x00, 0x00, 0xf0, 0x00),
      ),
    ).toBe(false);
  });

  it("refuses an item data box claiming less than its own header", () => {
    expect(
      isCompleteImage(
        "avif",
        patch(AVIF_NESTED_IDAT_BYTES, AVIF_NESTED_IDAT_SIZE_OFFSET, 0, 0, 0, 4),
      ),
    ).toBe(false);
  });

  // A document after the last box is refused by the top-level walk. One
  // *inside* the box tree — bytes the meta box's size covers and no child
  // accounts for — is the same trick one level down.
  it("refuses a document smuggled inside the metadata", () => {
    expect(isCompleteImage("avif", AVIF_META_POLYGLOT_BYTES)).toBe(false);
    expect(() =>
      verifyImageFormat("image/avif", AVIF_META_POLYGLOT_BYTES),
    ).toThrow(ImageFormatError);
  });
});

describe("the size a picture is allowed to be", () => {
  it("is bounded", () => {
    expect(MAX_IMAGE_DIMENSION).toBeGreaterThan(0);
    expect(MAX_IMAGE_DIMENSION).toBeLessThanOrEqual(65_535);
  });
});

describe("what a structural refusal says", () => {
  it("says a category and nothing about the bytes", () => {
    const cases: Uint8Array[] = [
      concat(PNG_BYTES, SCRIPT_SVG_BYTES),
      PNG_PREFIX,
      concat(GIF89_BYTES.slice(0, 13), SCRIPT_SVG_BYTES),
      patch(PNG_BYTES, PNG_WIDTH_OFFSET, 0, 0, 0, 0),
    ];

    for (const sample of cases) {
      try {
        verifyImageFormat("image/png", sample);
        verifyImageFormat("image/gif", sample);
        expect.unreachable("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ImageFormatError);
        const message = (error as Error).message;
        expect(message).toMatch(/image/i);
        for (const secret of [
          "svg",
          "alert",
          "document.domain",
          "IHDR",
          "GIF89a",
          "width",
          "0x",
        ]) {
          expect(message).not.toContain(secret);
        }
      }
    }
  });
});
