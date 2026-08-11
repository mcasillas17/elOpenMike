import { describe, it, expect } from "vitest";
import {
  ImageFormatError,
  isCompleteImage,
  sniffImageFormat,
  verifyImageFormat,
} from "@/lib/notion/image-format";
import {
  AVIF_BYTES,
  AVIF_RAGGED_BRANDS_BYTES,
  AVIF_WITH_AVIS_COMPATIBLE_BYTES,
  AVIF_WITH_MSF1_COMPATIBLE_BYTES,
  AVIF_WITH_UPPERCASE_AVIS_BYTES,
  AVIS_BYTES,
  AVIS_UPPERCASE_MAJOR_BYTES,
} from "./fixtures/images";

// `avis` is not a spelling of `avif`. It is the brand of an AVIF image
// *sequence*: many pictures, a track that plays them, and — where a still image
// keeps its bytes in one `mdat` a single `meta` describes — a movie box, sample
// tables and per-sample offsets that nothing here reads.
//
// The check in image-structure.ts proves a *still* image: an `ftyp`, a `meta`
// carrying the sizes the pictures declare, and the data behind it. Run over a
// sequence it proves the wrapper and says nothing whatsoever about the frames
// inside — so it would accept a file whose thousand frames are a thousand
// decodes, under an extension the site serves as a picture, on the strength of
// one `ispe` that describes the first of them.
//
// So a sequence is refused outright, at both gates, and the brands are read the
// way an attacker would write them rather than the way an encoder does: every
// brand in the box is looked at, not just the major one, because a file whose
// major brand is `avif` may name `avis` among its compatible brands and still
// be played as a sequence by anything that reads the whole list. If the still
// subset is ever widened to sequences it will be because something here parses
// the tracks; until then this is the line.

const SEQUENCES: Array<[string, Uint8Array]> = [
  ["a sequence's major brand", AVIS_BYTES],
  ["a sequence among the compatible brands", AVIF_WITH_AVIS_COMPATIBLE_BYTES],
  ["a HEIF sequence's structural brand", AVIF_WITH_MSF1_COMPATIBLE_BYTES],
];

describe("an AVIF that is a sequence rather than a picture", () => {
  it.each(SEQUENCES)("is not a complete still image: %s", (_name, sample) => {
    expect(isCompleteImage("avif", sample)).toBe(false);
  });

  it.each(SEQUENCES)("is not sniffed as an AVIF at all: %s", (_name, sample) => {
    expect(sniffImageFormat(sample)).toBeUndefined();
  });

  it.each(SEQUENCES)("is refused by the whole check: %s", (_name, sample) => {
    expect(() => verifyImageFormat("image/avif", sample)).toThrow(
      ImageFormatError,
    );
  });
});

// A brand is a case-sensitive four-character code, so `AVIS` names nothing —
// and a deny list that only knows one spelling is a deny list a byte of shift
// walks around. The allow list stays exact; the refusal does not.
describe("a sequence brand in another case", () => {
  const cased: Array<[string, Uint8Array]> = [
    ["compatible AVIS beside a real avif", AVIF_WITH_UPPERCASE_AVIS_BYTES],
    ["a major AvIs", AVIS_UPPERCASE_MAJOR_BYTES],
  ];

  it.each(cased)("is refused too: %s", (_name, sample) => {
    expect(isCompleteImage("avif", sample)).toBe(false);
    expect(sniffImageFormat(sample)).toBeUndefined();
  });
});

describe("an ftyp whose brand list is malformed", () => {
  it("is not read as naming anything", () => {
    expect(isCompleteImage("avif", AVIF_RAGGED_BRANDS_BYTES)).toBe(false);
  });

  it("is not an AVIF, whatever the two bytes left over spell", () => {
    expect(sniffImageFormat(AVIF_RAGGED_BRANDS_BYTES)).toBeUndefined();
  });
});

// The point of all of the above is that a still AVIF still goes through.
describe("a static AVIF", () => {
  it("is still accepted", () => {
    expect(isCompleteImage("avif", AVIF_BYTES)).toBe(true);
    expect(sniffImageFormat(AVIF_BYTES)).toBe("avif");
    expect(verifyImageFormat("image/avif", AVIF_BYTES)).toBe("avif");
  });
});
