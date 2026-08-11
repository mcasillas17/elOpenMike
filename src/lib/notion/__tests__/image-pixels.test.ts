import { describe, it, expect } from "vitest";
import {
  isCompleteImage,
  verifyImageFormat,
  ImageFormatError,
  MAX_IMAGE_DIMENSION,
  MAX_IMAGE_PIXELS,
  MAX_DECODED_IMAGE_BYTES,
  DECODED_BYTES_PER_PIXEL,
  MAX_IMAGE_FRAMES,
  MAX_ANIMATION_PIXELS,
  type ImageFormat,
} from "@/lib/notion/image-format";
import {
  animatedWebpDeclaring,
  apngDeclaring,
  avifDeclaring,
  gifDeclaring,
  jpegDeclaring,
  pngDeclaring,
  webpDeclaring,
  type AnimationFrame,
} from "./fixtures/images";

// A decompression bomb is not a big file.
//
// Every dimension in every one of these formats is a number in a header, and
// the pixels it asks for are conjured on the other side, by whatever decodes
// the file: a browser drawing it, a CDN resizing it, a thumbnailer indexing it.
// The size cap on the download bounds the bytes that arrive and says nothing at
// all about that. `MAX_IMAGE_DIMENSION` bounded each side on its own, which
// leaves 65535 x 65535 — four *gigapixels*, sixteen gigabytes decoded, written
// into a hundred-byte GIF header.
//
// So width and height are bounded, and so is their product, and so is what that
// product costs to hold: one decoded picture is bounded in pixels and therefore
// in bytes. Animations get the same treatment one level down, because a file
// with one small canvas can carry thousands of frames — each one a decode of its
// own — so every frame's rectangle has to fit inside the canvas it claims to
// belong to, there is a limit on how many of them there can be, and there is a
// limit on what they add up to.
//
// Nothing here decodes anything. These are the numbers the file itself declares,
// read where its own specification puts them.

const isSmall = (file: Uint8Array) => file.byteLength < 64 * 1024;

// Two sides whose product is exactly the budget and which both fit inside the
// per-side cap, so "at the budget" is a real picture rather than an arithmetic
// coincidence. Derived from the constants, so moving a constant moves the test
// with it.
function sidesAtBudget(): [number, number] {
  for (let width = Math.floor(Math.sqrt(MAX_IMAGE_PIXELS)); width > 0; width--) {
    if (MAX_IMAGE_PIXELS % width !== 0) continue;
    const height = MAX_IMAGE_PIXELS / width;
    if (height <= MAX_IMAGE_DIMENSION) return [width, height];
  }
  throw new Error("no picture of exactly the budget fits the dimension cap");
}

const [BUDGET_WIDTH, BUDGET_HEIGHT] = sidesAtBudget();

// One picture of a declared size, in each format, built rather than encoded:
// no encoder writes a file whose header says four gigapixels.
const DECLARING: Array<[ImageFormat, (w: number, h: number) => Uint8Array]> = [
  ["png", pngDeclaring],
  ["jpeg", jpegDeclaring],
  ["webp", webpDeclaring],
  ["avif", avifDeclaring],
  ["gif", (width, height) => gifDeclaring({ width, height }, [])],
];

describe("the picture a header is allowed to declare", () => {
  it("is bounded in pixels as well as in each direction", () => {
    expect(MAX_IMAGE_PIXELS).toBeGreaterThan(0);
    expect(MAX_IMAGE_PIXELS).toBeLessThan(MAX_IMAGE_DIMENSION * MAX_IMAGE_DIMENSION);
  });

  it("is bounded in what it costs to decode", () => {
    expect(DECODED_BYTES_PER_PIXEL).toBeGreaterThanOrEqual(1);
    expect(MAX_DECODED_IMAGE_BYTES).toBe(
      MAX_IMAGE_PIXELS * DECODED_BYTES_PER_PIXEL,
    );
  });

  it("costs no more than the byte budget at the pixel budget", () => {
    expect(BUDGET_WIDTH * BUDGET_HEIGHT * DECODED_BYTES_PER_PIXEL).toBe(
      MAX_DECODED_IMAGE_BYTES,
    );
    expect((BUDGET_WIDTH + 1) * BUDGET_HEIGHT * DECODED_BYTES_PER_PIXEL).
      toBeGreaterThan(MAX_DECODED_IMAGE_BYTES);
  });

  it.each(DECLARING)("accepts a %s of exactly the budget", (format, build) => {
    expect(isCompleteImage(format, build(BUDGET_WIDTH, BUDGET_HEIGHT))).toBe(true);
  });

  it.each(DECLARING)("refuses a %s one row past the budget", (format, build) => {
    expect(isCompleteImage(format, build(BUDGET_WIDTH, BUDGET_HEIGHT + 1))).toBe(
      false,
    );
  });

  it.each(DECLARING)("refuses a %s that is one column past it", (format, build) => {
    expect(isCompleteImage(format, build(BUDGET_WIDTH + 1, BUDGET_HEIGHT))).toBe(
      false,
    );
  });
});

// The whole point: each of these is a few hundred bytes and asks for gigabytes.
describe("a tiny file that decodes to gigabytes", () => {
  const bombs: Array<[string, Uint8Array]> = [
    ["png", pngDeclaring(60_000, 60_000)],
    ["jpeg", jpegDeclaring(60_000, 60_000)],
    ["webp", webpDeclaring(60_000, 60_000)],
    ["avif", avifDeclaring(60_000, 60_000)],
    [
      "gif",
      gifDeclaring({ width: MAX_IMAGE_DIMENSION, height: MAX_IMAGE_DIMENSION }, [
        { x: 0, y: 0, width: 1, height: 1 },
      ]),
    ],
  ];

  it.each(bombs)("is a small file, as a %s", (_format, bomb) => {
    expect(isSmall(bomb)).toBe(true);
  });

  it.each(bombs)("is refused as a %s", (format, bomb) => {
    expect(isCompleteImage(format as ImageFormat, bomb)).toBe(false);
  });

  it.each(bombs)("is refused by the whole check as a %s", (format, bomb) => {
    expect(() => verifyImageFormat(`image/${format}`, bomb)).toThrow(
      ImageFormatError,
    );
  });

  it("says a category and nothing about the numbers it read", () => {
    try {
      verifyImageFormat("image/png", pngDeclaring(60_000, 60_000));
      expect.unreachable("should have thrown");
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toMatch(/image/i);
      for (const secret of ["60000", "60,000", "width", "height", "IHDR"]) {
        expect(message).not.toContain(secret);
      }
    }
  });
});

// An animation is many decodes wearing one file's clothes.
type Animator = (
  canvas: { width: number; height: number },
  frames: AnimationFrame[],
) => Uint8Array;

const ANIMATED: Array<[string, ImageFormat, Animator]> = [
  ["GIF", "gif", gifDeclaring],
  ["APNG", "png", apngDeclaring],
  ["animated WebP", "webp", animatedWebpDeclaring],
];

const tile = (count: number, size = 2): AnimationFrame[] =>
  Array.from({ length: count }, () => ({ x: 0, y: 0, width: size, height: size }));

describe.each(ANIMATED)("%s frames", (_name, format, animate) => {
  const canvas = { width: 100, height: 100 };

  it("accepts an ordinary animation", () => {
    const file = animate(canvas, [
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 10, y: 10, width: 20, height: 20 },
      { x: 50, y: 50, width: 50, height: 50 },
    ]);

    expect(isCompleteImage(format, file)).toBe(true);
  });

  it("refuses a frame larger than the canvas it sits in", () => {
    const file = animate(canvas, [{ x: 0, y: 0, width: 200, height: 200 }]);

    expect(isCompleteImage(format, file)).toBe(false);
  });

  it("refuses a frame that begins inside the canvas and ends outside it", () => {
    const file = animate(canvas, [{ x: 80, y: 0, width: 50, height: 10 }]);

    expect(isCompleteImage(format, file)).toBe(false);
  });

  it("refuses a frame whose offset is already outside the canvas", () => {
    const file = animate(canvas, [{ x: 200, y: 200, width: 2, height: 2 }]);

    expect(isCompleteImage(format, file)).toBe(false);
  });

  it("refuses a frame with no picture in it", () => {
    const file = animate(canvas, [{ x: 0, y: 0, width: 0, height: 10 }]);

    expect(isCompleteImage(format, file)).toBe(false);
  });

  it("accepts as many frames as an animation is allowed", () => {
    const file = animate(canvas, tile(MAX_IMAGE_FRAMES));

    expect(isSmall(file)).toBe(true);
    expect(isCompleteImage(format, file)).toBe(true);
  });

  it("refuses one frame more than that", () => {
    const file = animate(canvas, tile(MAX_IMAGE_FRAMES + 1));

    // Still a small file. That is what makes it worth refusing.
    expect(isSmall(file)).toBe(true);
    expect(isCompleteImage(format, file)).toBe(false);
  });

  // Each frame is inside the canvas, the canvas is inside the budget, and there
  // are few enough of them — and together they are still hundreds of megapixels
  // of decoding.
  it("refuses frames that add up to more than an animation's budget", () => {
    const wide = { width: BUDGET_WIDTH, height: BUDGET_HEIGHT };
    const each = { x: 0, y: 0, width: BUDGET_WIDTH, height: BUDGET_HEIGHT };
    const count = Math.floor(MAX_ANIMATION_PIXELS / MAX_IMAGE_PIXELS) + 1;
    expect(count).toBeLessThanOrEqual(MAX_IMAGE_FRAMES);

    const file = animate(wide, Array.from({ length: count }, () => ({ ...each })));

    expect(isSmall(file)).toBe(true);
    expect(isCompleteImage(format, file)).toBe(false);
  });

  it("accepts the same animation one frame shorter", () => {
    const wide = { width: BUDGET_WIDTH, height: BUDGET_HEIGHT };
    const count = Math.floor(MAX_ANIMATION_PIXELS / MAX_IMAGE_PIXELS);
    const file = animate(
      wide,
      Array.from({ length: count }, () => ({
        x: 0,
        y: 0,
        width: BUDGET_WIDTH,
        height: BUDGET_HEIGHT,
      })),
    );

    expect(isCompleteImage(format, file)).toBe(true);
  });
});

describe("what an animation's budget is", () => {
  it("is bounded in frames and in what they decode to", () => {
    expect(MAX_IMAGE_FRAMES).toBeGreaterThan(1);
    expect(MAX_ANIMATION_PIXELS).toBeGreaterThanOrEqual(MAX_IMAGE_PIXELS);
    // A count cap alone would let one canvas-sized frame be repeated up to the
    // limit; a pixel cap alone would let a million one-pixel frames through.
    expect(MAX_ANIMATION_PIXELS).toBeLessThan(
      MAX_IMAGE_FRAMES * MAX_IMAGE_PIXELS,
    );
  });
});
