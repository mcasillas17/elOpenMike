import { describe, it, expect, vi } from "vitest";
import {
  imageFileName,
  imageDir,
  downloadImage,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_REDIRECTS,
} from "@/lib/notion/images";
import type { AddressResolver } from "@/lib/notion/image-url";

const bytes = (s: string) => new TextEncoder().encode(s);

// No test here touches DNS or the network: the resolver is injected and always
// answers with a routable public address unless the case is about resolution.
const publicResolver: AddressResolver = async () => ["52.219.100.1"];

const SIGNED_URL =
  "https://prod-files-secure.s3.us-west-2.amazonaws.com/abc/photo.png?X-Amz-Signature=deadbeef";

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
    const result = await downloadImage(SIGNED_URL, {
      fetchImpl: fake as typeof fetch,
      resolve: publicResolver,
    });
    expect(new TextDecoder().decode(result.bytes)).toBe("png-data");
    expect(result.contentType).toBe("image/png");
  });

  it("throws on a non-OK response", async () => {
    const fake = async () => new Response("nope", { status: 403 });
    await expect(
      downloadImage(SIGNED_URL, {
        fetchImpl: fake as typeof fetch,
        resolve: publicResolver,
      }),
    ).rejects.toThrow(/403/);
  });

  it("throws when the payload exceeds the size cap", async () => {
    const huge = new Uint8Array(MAX_IMAGE_BYTES + 1);
    const fake = async () =>
      new Response(huge, { headers: { "content-type": "image/png" } });
    await expect(
      downloadImage(SIGNED_URL, {
        fetchImpl: fake as typeof fetch,
        resolve: publicResolver,
      }),
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
      downloadImage(signed, {
        fetchImpl: fake as typeof fetch,
        resolve: publicResolver,
      }),
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
      downloadImage(signed, {
        fetchImpl: fake as typeof fetch,
        resolve: publicResolver,
      }),
    ).rejects.toSatisfy((error: unknown) => {
      const message = (error as Error).message;
      expectRedacted(message);
      return /too large/i.test(message);
    });
  });
});

// fetch follows redirects itself by default, which would let a validated
// Notion host hand the sync a Location pointing at 127.0.0.1 or the cloud
// metadata service. Redirects are therefore followed manually so every hop is
// re-checked against the same policy as the first request.
describe("downloadImage redirect handling", () => {
  const png = () =>
    new Response(bytes("png-data"), {
      headers: { "content-type": "image/png" },
    });

  const redirectTo = (location: string, status = 302) =>
    new Response(null, { status, headers: { location } });

  it("never lets fetch auto-follow redirects", async () => {
    const calls: { url: string; redirect?: RequestRedirect }[] = [];
    const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
      calls.push({ url: String(input), redirect: init?.redirect });
      return png();
    }) as unknown as typeof fetch;

    await downloadImage(SIGNED_URL, { fetchImpl, resolve: publicResolver });
    expect(calls).toEqual([{ url: SIGNED_URL, redirect: "manual" }]);
  });

  it("follows a redirect to another allowed host", async () => {
    const seen: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL) => {
      seen.push(String(input));
      return seen.length === 1
        ? redirectTo(
            "https://prod-files-secure.s3.us-west-2.amazonaws.com/final.png",
          )
        : png();
    });

    const result = await downloadImage("https://file.notion.so/f/f/a/photo.png", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      resolve: publicResolver,
    });

    expect(new TextDecoder().decode(result.bytes)).toBe("png-data");
    expect(seen).toEqual([
      "https://file.notion.so/f/f/a/photo.png",
      "https://prod-files-secure.s3.us-west-2.amazonaws.com/final.png",
    ]);
  });

  it("resolves a relative Location against the current hop", async () => {
    const seen: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL) => {
      seen.push(String(input));
      return seen.length === 1 ? redirectTo("/moved/final.png") : png();
    });

    await downloadImage("https://file.notion.so/f/f/a/photo.png", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      resolve: publicResolver,
    });

    expect(seen[1]).toBe("https://file.notion.so/moved/final.png");
  });

  it("rejects a redirect to a loopback address", async () => {
    const fetchImpl = vi.fn(async (input: string | URL) =>
      String(input).includes("notion.so")
        ? redirectTo("https://s3.amazonaws.com/pwn.png")
        : png(),
    );
    const resolve: AddressResolver = async (hostname) =>
      hostname === "s3.amazonaws.com" ? ["127.0.0.1"] : ["52.219.100.1"];

    await expect(
      downloadImage("https://file.notion.so/f/f/a/photo.png", {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        resolve,
      }),
    ).rejects.toThrow(/non-public address/i);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects a redirect to the cloud metadata service", async () => {
    const fetchImpl = vi.fn(async (input: string | URL) =>
      String(input).includes("notion.so")
        ? redirectTo("https://s3.amazonaws.com/metadata")
        : png(),
    );
    const resolve: AddressResolver = async (hostname) =>
      hostname === "s3.amazonaws.com" ? ["169.254.169.254"] : ["52.219.100.1"];

    await expect(
      downloadImage("https://file.notion.so/f/f/a/photo.png", {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        resolve,
      }),
    ).rejects.toThrow(/non-public address/i);
  });

  it("rejects a redirect that drops to http or an unknown host", async () => {
    for (const location of [
      "http://www.notion.so/image/a.png",
      "https://evil.example.com/a.png",
    ]) {
      const fetchImpl = vi.fn(async () => redirectTo(location));
      await expect(
        downloadImage(SIGNED_URL, {
          fetchImpl: fetchImpl as unknown as typeof fetch,
          resolve: publicResolver,
        }),
      ).rejects.toThrow(/https|host/i);
    }
  });

  it("rejects a redirect with no Location header", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 302 }));
    await expect(
      downloadImage(SIGNED_URL, {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        resolve: publicResolver,
      }),
    ).rejects.toThrow(/location/i);
  });

  it("stops after the redirect budget instead of looping forever", async () => {
    const fetchImpl = vi.fn(async () => redirectTo(SIGNED_URL));
    await expect(
      downloadImage(SIGNED_URL, {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        resolve: publicResolver,
      }),
    ).rejects.toThrow(/too many redirects/i);
    expect(fetchImpl).toHaveBeenCalledTimes(MAX_IMAGE_REDIRECTS + 1);
  });
});

describe("downloadImage url policy", () => {
  it("refuses a disallowed host before any request is made", async () => {
    const fetchImpl = vi.fn(async () => png());
    await expect(
      downloadImage("https://169.254.169.254/latest/meta-data/", {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        resolve: publicResolver,
      }),
    ).rejects.toThrow(/not an allowed Notion image host/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses a non-https url before any request is made", async () => {
    const fetchImpl = vi.fn(async () => png());
    await expect(
      downloadImage("http://www.notion.so/image/a.png", {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        resolve: publicResolver,
      }),
    ).rejects.toThrow(/https/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

function png(): Response {
  return new Response(bytes("png-data"), {
    headers: { "content-type": "image/png" },
  });
}
