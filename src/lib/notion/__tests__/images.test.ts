import { describe, it, expect } from "vitest";
import {
  imageFileName,
  imageDir,
  downloadImage,
  MAX_IMAGE_BYTES,
} from "@/lib/notion/images";

const bytes = (s: string) => new TextEncoder().encode(s);

describe("imageFileName", () => {
  it("is deterministic for identical bytes", () => {
    expect(imageFileName(bytes("abc"), "image/png")).toBe(
      imageFileName(bytes("abc"), "image/png"),
    );
  });

  it("differs for different bytes", () => {
    expect(imageFileName(bytes("abc"), "image/png")).not.toBe(
      imageFileName(bytes("xyz"), "image/png"),
    );
  });

  it("uses a 12-character hash and the mapped extension", () => {
    expect(imageFileName(bytes("abc"), "image/png")).toMatch(
      /^[0-9a-f]{12}\.png$/,
    );
    expect(imageFileName(bytes("abc"), "image/webp")).toMatch(/\.webp$/);
    expect(imageFileName(bytes("abc"), "image/jpeg")).toMatch(/\.jpg$/);
    expect(imageFileName(bytes("abc"), "image/gif")).toMatch(/\.gif$/);
    expect(imageFileName(bytes("abc"), "image/svg+xml")).toMatch(/\.svg$/);
  });

  it("ignores content-type parameters", () => {
    expect(imageFileName(bytes("abc"), "image/png; charset=binary")).toMatch(
      /\.png$/,
    );
  });

  it("falls back to .bin for unknown types", () => {
    expect(imageFileName(bytes("abc"), "application/octet-stream")).toMatch(
      /\.bin$/,
    );
  });
});

describe("imageDir", () => {
  it("namespaces images by post slug", () => {
    expect(imageDir("my-post")).toBe("public/images/blog/my-post");
  });
});

describe("downloadImage", () => {
  it("returns bytes and content type", async () => {
    const fake = async () =>
      new Response(bytes("png-data"), {
        headers: { "content-type": "image/png" },
      });
    const result = await downloadImage("https://s3/signed", fake as typeof fetch);
    expect(new TextDecoder().decode(result.bytes)).toBe("png-data");
    expect(result.contentType).toBe("image/png");
  });

  it("throws on a non-OK response", async () => {
    const fake = async () => new Response("nope", { status: 403 });
    await expect(
      downloadImage("https://s3/expired", fake as typeof fetch),
    ).rejects.toThrow(/403/);
  });

  it("throws when the payload exceeds the size cap", async () => {
    const huge = new Uint8Array(MAX_IMAGE_BYTES + 1);
    const fake = async () =>
      new Response(huge, { headers: { "content-type": "image/png" } });
    await expect(
      downloadImage("https://s3/huge", fake as typeof fetch),
    ).rejects.toThrow(/too large/i);
  });
});

// Notion file URLs are pre-signed S3 links carrying X-Amz-Signature and
// X-Amz-Security-Token. The sync prints error messages to a public Actions log,
// so a raw URL in an error hands out a working credential for the next hour.
describe("downloadImage error redaction", () => {
  const signed =
    "https://s3.us-west-2.amazonaws.com/secure.notion-static.com/img.png" +
    "?X-Amz-Credential=AKIAEXAMPLE&X-Amz-Signature=deadbeef&X-Amz-Security-Token=tok";

  const expectRedacted = (message: string) => {
    expect(message).not.toContain("X-Amz-Signature");
    expect(message).not.toContain("X-Amz-Security-Token");
    expect(message).not.toContain("deadbeef");
    expect(message).toContain("secure.notion-static.com/img.png");
  };

  it("keeps the signature out of a failed-download message", async () => {
    const fake = async () => new Response("nope", { status: 403 });
    await expect(
      downloadImage(signed, fake as typeof fetch),
    ).rejects.toSatisfy((error: unknown) => {
      const message = (error as Error).message;
      expectRedacted(message);
      return message.includes("403");
    });
  });

  it("keeps the signature out of an oversized-payload message", async () => {
    const fake = async () =>
      new Response(new Uint8Array(MAX_IMAGE_BYTES + 1), {
        headers: { "content-type": "image/png" },
      });
    await expect(
      downloadImage(signed, fake as typeof fetch),
    ).rejects.toSatisfy((error: unknown) => {
      const message = (error as Error).message;
      expectRedacted(message);
      return /too large/i.test(message);
    });
  });
});
