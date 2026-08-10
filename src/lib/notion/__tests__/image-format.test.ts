import { describe, it, expect } from "vitest";
import {
  ALLOWED_IMAGE_FORMATS,
  ImageFormatError,
  formatFromContentType,
  sniffImageFormat,
  verifyImageFormat,
  type ImageFormat,
} from "@/lib/notion/image-format";
import {
  asciiBytes as ascii,
  concatBytes as concat,
  AVIF_BYTES,
  AVIS_BYTES,
  GIF87_BYTES,
  GIF89_BYTES,
  HTML_BYTES,
  JPEG_BYTES,
  PNG_BYTES,
  SCRIPT_SVG_BYTES,
  UTF8_BOM,
  WEBP_BYTES,
  XML_BYTES,
} from "./fixtures/images";

// An image the sync commits is served from the site's own origin. An SVG is not
// a picture to a browser: it is a document that runs script, so one stored under
// public/images/blog/ is same-origin XSS on the site — the CSP a page carries
// does not reach a document somebody navigates to directly.
//
// So the format is decided by the bytes rather than by anything the response
// claims: the declared type has to be one of a small raster allowlist, the bytes
// have to sniff as that very format, and the extension is written from the
// format that was proved rather than from the header that was read.

describe("the formats the site may serve from its own origin", () => {
  it("is the raster allowlist and nothing else", () => {
    expect([...ALLOWED_IMAGE_FORMATS].sort()).toEqual([
      "avif",
      "gif",
      "jpeg",
      "png",
      "webp",
    ]);
  });

  it("has no member a browser executes as a document", () => {
    for (const format of ALLOWED_IMAGE_FORMATS) {
      expect(format).not.toMatch(/svg|xml|html/);
    }
  });
});

describe("formatFromContentType", () => {
  it.each([
    ["image/png", "png"],
    ["image/jpeg", "jpeg"],
    ["image/jpg", "jpeg"],
    ["image/gif", "gif"],
    ["image/webp", "webp"],
    ["image/avif", "avif"],
  ])("reads %s as %s", (header, format) => {
    expect(formatFromContentType(header)).toBe(format);
  });

  it("ignores parameters, case and surrounding space", () => {
    expect(formatFromContentType("  IMAGE/PNG ; charset=binary ")).toBe("png");
  });

  it.each([
    "image/svg+xml",
    "image/svg+xml; charset=utf-8",
    "IMAGE/SVG+XML",
    "image/svg",
    "text/xml",
    "application/xml",
    "text/html",
    "application/octet-stream",
    "image/x-icon",
    "image/tiff",
    "image/heic",
    "",
    "   ",
  ])("refuses %s", (header) => {
    expect(formatFromContentType(header)).toBeUndefined();
  });
});

describe("sniffImageFormat", () => {
  it.each([
    ["png", PNG_BYTES],
    ["jpeg", JPEG_BYTES],
    ["gif", GIF87_BYTES],
    ["gif", GIF89_BYTES],
    ["webp", WEBP_BYTES],
    ["avif", AVIF_BYTES],
    ["avif", AVIS_BYTES],
  ])("recognizes %s from its magic bytes", (format, sample) => {
    expect(sniffImageFormat(sample)).toBe(format);
  });

  it.each([
    ["a script-bearing SVG", SCRIPT_SVG_BYTES],
    ["an XML declaration", XML_BYTES],
    ["an HTML document", HTML_BYTES],
    ["an SVG behind a byte-order mark", concat(UTF8_BOM, SCRIPT_SVG_BYTES)],
    ["an SVG behind leading whitespace", concat(ascii("\n\t  "), SCRIPT_SVG_BYTES)],
    ["an SVG behind a comment", concat(ascii("<!-- hi -->"), SCRIPT_SVG_BYTES)],
    ["an SVG behind a doctype", concat(ascii("<!DOCTYPE svg>"), SCRIPT_SVG_BYTES)],
    ["an empty body", new Uint8Array()],
    ["a truncated PNG signature", new Uint8Array([0x89, 0x50, 0x4e])],
    [
      "a RIFF container that is not WEBP",
      concat(ascii("RIFF"), new Uint8Array([4, 0, 0, 0]), ascii("WAVE")),
    ],
    [
      "an ISO-BMFF box that is not AVIF",
      concat(new Uint8Array([0, 0, 0, 0x20]), ascii("ftypheic")),
    ],
  ])("does not recognize %s as an image", (_name, sample) => {
    expect(sniffImageFormat(sample)).toBeUndefined();
  });
});

describe("verifyImageFormat", () => {
  const samples: Array<[ImageFormat, string, Uint8Array<ArrayBuffer>]> = [
    ["png", "image/png", PNG_BYTES],
    ["jpeg", "image/jpeg", JPEG_BYTES],
    ["gif", "image/gif", GIF89_BYTES],
    ["webp", "image/webp", WEBP_BYTES],
    ["avif", "image/avif", AVIF_BYTES],
  ];

  it.each(samples)("accepts a real %s declared as %s", (format, header, sample) => {
    expect(verifyImageFormat(header, sample)).toBe(format);
  });

  it("refuses an SVG however it is labelled", () => {
    for (const header of [
      "image/svg+xml",
      "image/png",
      "image/webp",
      "image/avif",
    ]) {
      expect(() => verifyImageFormat(header, SCRIPT_SVG_BYTES)).toThrow(
        ImageFormatError,
      );
    }
  });

  it("refuses XML and HTML bodies", () => {
    for (const sample of [XML_BYTES, HTML_BYTES]) {
      expect(() => verifyImageFormat("image/png", sample)).toThrow(
        ImageFormatError,
      );
    }
  });

  it("refuses a raster whose bytes are another raster", () => {
    expect(() => verifyImageFormat("image/png", GIF89_BYTES)).toThrow(
      ImageFormatError,
    );
    expect(() => verifyImageFormat("image/webp", PNG_BYTES)).toThrow(
      ImageFormatError,
    );
  });

  it("refuses bytes it cannot recognize at all", () => {
    expect(() => verifyImageFormat("image/png", ascii("not an image"))).toThrow(
      ImageFormatError,
    );
  });

  // The message goes to a public Actions log, and the response it describes came
  // back from a URL carrying a signature.
  it("says a category and nothing about the response", () => {
    const cases: Array<[string, Uint8Array<ArrayBuffer>]> = [
      ["image/svg+xml", SCRIPT_SVG_BYTES],
      ["image/png", SCRIPT_SVG_BYTES],
      ["image/png", ascii("not an image")],
      ["image/png", GIF89_BYTES],
    ];

    for (const [header, sample] of cases) {
      try {
        verifyImageFormat(header, sample);
        expect.unreachable("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ImageFormatError);
        const message = (error as Error).message;
        expect(message).toMatch(/image/i);
        for (const secret of [
          "svg+xml",
          "alert",
          "document.domain",
          "fetch",
          "GIF89a",
          "not an image",
        ]) {
          expect(message).not.toContain(secret);
        }
      }
    }
  });
});
