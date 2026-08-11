import { describe, it, expect, vi } from "vitest";
import {
  imageFileName,
  imageDir,
  downloadImage,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_REDIRECTS,
} from "@/lib/notion/images";
import type { AddressResolver } from "@/lib/notion/image-url";
import { ImageFormatError } from "@/lib/notion/image-format";
import {
  AVIF_BYTES,
  GIF89_BYTES,
  HTML_BYTES,
  JPEG_BYTES,
  PNG_BYTES,
  pngCarrying,
  pngMarker,
  pngOfSize,
  SCRIPT_SVG_BYTES,
  WEBP_BYTES,
  XML_BYTES,
} from "./fixtures/images";

const bytes = (s: string) => new TextEncoder().encode(s);

// A real PNG carrying a recognizable marker, so a test can assert both that the
// body arrived intact and that it passed the format check the sync makes. The
// marker lives in a tEXt chunk rather than after the file's IEND, because a
// file with anything after its IEND is exactly what the sync refuses.
const pngBody = (marker: string) => pngCarrying(marker);
const tailOf = (body: Uint8Array) => pngMarker(body);

// The same bytes, handed over `size` at a time.
function streamOf(body: Uint8Array, size: number): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= body.byteLength) {
        controller.close();
        return;
      }
      controller.enqueue(body.slice(offset, offset + size));
      offset += size;
    },
  });
}

// No test here touches DNS or the network: the resolver is injected and always
// answers with a routable public address unless the case is about resolution.
const publicResolver: AddressResolver = async () => ["52.219.100.1"];

const SIGNED_URL =
  "https://prod-files-secure.s3.us-west-2.amazonaws.com/abc/photo.png?X-Amz-Signature=deadbeef";

describe("imageFileName", () => {
  it("is deterministic for identical bytes", () => {
    expect(imageFileName(bytes("abc"), "png")).toBe(
      imageFileName(bytes("abc"), "png"),
    );
  });

  it("differs for different bytes", () => {
    expect(imageFileName(bytes("abc"), "png")).not.toBe(
      imageFileName(bytes("xyz"), "png"),
    );
  });

  it("uses a 12-character hash and the extension of the verified format", () => {
    expect(imageFileName(bytes("abc"), "png")).toMatch(/^[0-9a-f]{12}\.png$/);
    expect(imageFileName(bytes("abc"), "webp")).toMatch(/\.webp$/);
    expect(imageFileName(bytes("abc"), "jpeg")).toMatch(/\.jpg$/);
    expect(imageFileName(bytes("abc"), "gif")).toMatch(/\.gif$/);
    expect(imageFileName(bytes("abc"), "avif")).toMatch(/\.avif$/);
  });

  // The extension is what decides the Content-Type the site serves the file
  // with, so it may only ever come from a format the bytes were proved to be.
  it("names no extension a browser would run as a document", () => {
    for (const format of ["png", "jpeg", "gif", "webp", "avif"] as const) {
      expect(imageFileName(bytes("abc"), format)).not.toMatch(
        /\.(svg|xml|html|bin)$/,
      );
    }
  });

  it("refuses a format outside the raster allowlist", () => {
    for (const format of ["svg", "svg+xml", "bin", "", "application/octet-stream"]) {
      expect(() =>
        imageFileName(bytes("abc"), format as unknown as "png"),
      ).toThrow(ImageFormatError);
    }
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
      new Response(pngBody("png-data"), {
        headers: { "content-type": "image/png" },
      });
    const result = await downloadImage(SIGNED_URL, {
      fetchImpl: fake as typeof fetch,
      resolve: publicResolver,
    });
    expect(tailOf(result.bytes)).toBe("png-data");
    expect(result.contentType).toBe("image/png");
    expect(result.format).toBe("png");
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
    for (const secret of [
      "s3.us-west-2.amazonaws.com",
      "secure.notion-static.com",
      "/img.png",
      "X-Amz-Credential",
      "X-Amz-Signature",
      "X-Amz-Security-Token",
      "AKIAEXAMPLE",
      "deadbeef",
      "tok",
    ]) {
      expect(message).not.toContain(secret);
    }
    expect(message).toMatch(/image/i);
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
    new Response(pngBody("png-data"), {
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

    expect(tailOf(result.bytes)).toBe("png-data");
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

  it("does not expose redirect hosts, paths, secrets, or resolver addresses", async () => {
    const source =
      "https://file.notion.so/private/source.png" +
      "?source-token=query-secret#source-fragment";
    const target =
      "https://s3.amazonaws.com/private/redirect.png" +
      "?target-token=redirect-secret#target-fragment";
    const fetchImpl = vi.fn(async () => redirectTo(target));
    const resolve: AddressResolver = async (hostname) =>
      hostname === "s3.amazonaws.com"
        ? ["10.87.65.43"]
        : ["52.219.100.1"];

    const failure = await downloadImage(source, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      resolve,
    }).then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(Error);
    const message = (failure as Error).message;
    expect(message).toMatch(/image url rejected/i);
    for (const secret of [
      "file.notion.so",
      "s3.amazonaws.com",
      "10.87.65.43",
      "/private/source.png",
      "/private/redirect.png",
      "query-secret",
      "source-fragment",
      "redirect-secret",
      "target-fragment",
    ]) {
      expect(message).not.toContain(secret);
    }
  });

  it("sanitizes endpoint details thrown by the fetch implementation", async () => {
    const source =
      "https://file.notion.so/private/source.png?token=query-secret#fragment-secret";
    const fetchImpl = vi.fn(async () => {
      throw new Error(
        "fetch leaked file.notion.so at 203.0.113.77/private/source.png?token=query-secret#fragment-secret",
      );
    });

    const failure = await downloadImage(source, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      resolve: publicResolver,
    }).then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(Error);
    const message = (failure as Error).message;
    expect(message).toMatch(/image download failed/i);
    for (const secret of [
      "file.notion.so",
      "203.0.113.77",
      "/private/source.png",
      "query-secret",
      "fragment-secret",
    ]) {
      expect(message).not.toContain(secret);
    }
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
  return new Response(pngBody("png-data"), {
    headers: { "content-type": "image/png" },
  });
}

// A 500 MB "image" must not be buffered into memory before it is rejected:
// arrayBuffer() reads the whole body first, so the cap has to be enforced
// while the bytes stream in.
describe("downloadImage size cap", () => {
  const CHUNK = 1024 * 1024;

  // Streams `count` 1 MiB chunks, recording how many were actually pulled and
  // whether the consumer cancelled.
  function chunkedResponse(count: number, headers: HeadersInit = {}) {
    const state = { pulled: 0, cancelled: false };
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (state.pulled >= count) {
          controller.close();
          return;
        }
        state.pulled += 1;
        // Every test using this expects the cap to stop the transfer, so what
        // the bytes are never comes into it.
        controller.enqueue(new Uint8Array(CHUNK));
      },
      cancel() {
        state.cancelled = true;
      },
    });
    return {
      state,
      response: new Response(stream, {
        headers: { "content-type": "image/png", ...headers },
      }),
    };
  }

  it("rejects a declared content-length over the cap without reading the body", async () => {
    const { state, response } = chunkedResponse(64, {
      "content-length": String(MAX_IMAGE_BYTES + 1),
    });
    await expect(
      downloadImage(SIGNED_URL, {
        fetchImpl: (async () => response) as unknown as typeof fetch,
        resolve: publicResolver,
      }),
    ).rejects.toThrow(/too large: content-length/i);
    // A ReadableStream prefetches one chunk on its own; the point is that the
    // remaining 63 MiB were never pulled.
    expect(state.pulled).toBeLessThanOrEqual(1);
  });

  it("aborts mid-stream instead of buffering an oversized body", async () => {
    const { state, response } = chunkedResponse(512); // 512 MiB if fully read
    const signals: AbortSignal[] = [];
    const fetchImpl = (async (_input: string | URL, init?: RequestInit) => {
      if (init?.signal) signals.push(init.signal);
      return response;
    }) as unknown as typeof fetch;

    await expect(
      downloadImage(SIGNED_URL, { fetchImpl, resolve: publicResolver }),
    ).rejects.toThrow(/too large/i);

    // Stops as soon as the cap is passed rather than draining 512 MiB (the
    // extra chunk is the stream's own one-chunk prefetch).
    expect(state.pulled).toBeLessThanOrEqual(MAX_IMAGE_BYTES / CHUNK + 2);
    expect(state.cancelled).toBe(true);
    expect(signals[0]?.aborted).toBe(true);
  });

  it("never calls arrayBuffer(), which would buffer the whole body first", async () => {
    const response = new Response(streamOf(pngOfSize(2 * CHUNK), CHUNK), {
      headers: { "content-type": "image/png" },
    });
    const guarded = new Proxy(response, {
      get(target, property) {
        if (property === "arrayBuffer" || property === "blob") {
          throw new Error(`${String(property)}() must not be called`);
        }
        // Read with the real Response as receiver: its getters touch private
        // fields that a proxy receiver cannot reach.
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });

    const result = await downloadImage(SIGNED_URL, {
      fetchImpl: (async () => guarded) as unknown as typeof fetch,
      resolve: publicResolver,
    });
    expect(result.bytes.byteLength).toBe(2 * CHUNK);
    expect(result.format).toBe("png");
  });

  it("accepts a body of exactly the cap and rejects one byte more", async () => {
    const exact = pngOfSize(MAX_IMAGE_BYTES);
    const okResult = await downloadImage(SIGNED_URL, {
      fetchImpl: (async () =>
        new Response(exact, {
          headers: {
            "content-type": "image/png",
            "content-length": String(MAX_IMAGE_BYTES),
          },
        })) as unknown as typeof fetch,
      resolve: publicResolver,
    });
    expect(okResult.bytes.byteLength).toBe(MAX_IMAGE_BYTES);

    const overByOne = new Uint8Array(MAX_IMAGE_BYTES + 1);
    await expect(
      downloadImage(SIGNED_URL, {
        fetchImpl: (async () =>
          new Response(overByOne, {
            headers: { "content-type": "image/png" },
          })) as unknown as typeof fetch,
        resolve: publicResolver,
      }),
    ).rejects.toThrow(/too large/i);
  });

  it("reassembles multi-chunk bodies in order", async () => {
    const whole = pngCarrying("png-data");
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(whole.slice(0, 20));
        controller.enqueue(whole.slice(20));
        controller.close();
      },
    });
    const result = await downloadImage(SIGNED_URL, {
      fetchImpl: (async () =>
        new Response(stream, {
          headers: { "content-type": "image/png" },
        })) as unknown as typeof fetch,
      resolve: publicResolver,
    });
    expect(tailOf(result.bytes)).toBe("png-data");
  });
});

// A committed image is served from the site's own origin, and an SVG is a
// document a browser runs rather than a picture it draws: one under
// public/images/blog/ is stored XSS on the site, reachable by following the
// link the post itself carries. Nothing about the response can be taken on
// trust — a Notion image block's `external` URL is whatever an author (or
// whoever can edit the page) pasted, and the extension the sync writes is what
// decides the Content-Type the file is later served with.
describe("downloadImage format policy", () => {
  const served = (body: Uint8Array<ArrayBuffer>, contentType: string) =>
    (async () =>
      new Response(body, { headers: { "content-type": contentType } })) as
      unknown as typeof fetch;

  const download = (body: Uint8Array<ArrayBuffer>, contentType: string) =>
    downloadImage(SIGNED_URL, {
      fetchImpl: served(body, contentType),
      resolve: publicResolver,
    });

  it("refuses an SVG that declares itself one", async () => {
    await expect(download(SCRIPT_SVG_BYTES, "image/svg+xml")).rejects.toThrow(
      ImageFormatError,
    );
  });

  it("refuses an SVG dressed as every raster type in turn", async () => {
    for (const contentType of [
      "image/png",
      "image/jpeg",
      "image/gif",
      "image/webp",
      "image/avif",
    ]) {
      await expect(download(SCRIPT_SVG_BYTES, contentType)).rejects.toThrow(
        ImageFormatError,
      );
    }
  });

  it("refuses an SVG whose extension and type are both a lie", async () => {
    await expect(
      downloadImage(
        "https://prod-files-secure.s3.us-west-2.amazonaws.com/a/logo.png?X-Amz-Signature=x",
        {
          fetchImpl: served(SCRIPT_SVG_BYTES, "image/png"),
          resolve: publicResolver,
        },
      ),
    ).rejects.toThrow(ImageFormatError);
  });

  it("refuses XML and HTML bodies", async () => {
    await expect(download(XML_BYTES, "image/png")).rejects.toThrow(
      ImageFormatError,
    );
    await expect(download(HTML_BYTES, "image/png")).rejects.toThrow(
      ImageFormatError,
    );
  });

  it("refuses a body no allowed format claims", async () => {
    await expect(download(bytes("not an image at all"), "image/png")).rejects.toThrow(
      ImageFormatError,
    );
  });

  it("refuses a type outside the raster allowlist even with matching bytes", async () => {
    await expect(download(PNG_BYTES, "application/octet-stream")).rejects.toThrow(
      ImageFormatError,
    );
    await expect(download(PNG_BYTES, "")).rejects.toThrow(ImageFormatError);
  });

  it("refuses a response that declares no type at all", async () => {
    await expect(
      downloadImage(SIGNED_URL, {
        fetchImpl: (async () => new Response(PNG_BYTES)) as unknown as typeof fetch,
        resolve: publicResolver,
      }),
    ).rejects.toThrow(ImageFormatError);
  });

  it("refuses a raster mislabelled as another raster", async () => {
    await expect(download(GIF89_BYTES, "image/png")).rejects.toThrow(
      ImageFormatError,
    );
  });

  it.each([
    ["png", PNG_BYTES, "image/png", "image/png"],
    ["jpeg", JPEG_BYTES, "image/jpeg", "image/jpeg"],
    ["jpeg", JPEG_BYTES, "image/jpg", "image/jpeg"],
    ["gif", GIF89_BYTES, "image/gif", "image/gif"],
    ["webp", WEBP_BYTES, "image/webp", "image/webp"],
    ["avif", AVIF_BYTES, "image/avif", "image/avif"],
  ])(
    "accepts a real %s and reports the type it proved",
    async (format, body, contentType, canonical) => {
      const result = await download(body, contentType);
      expect(result.format).toBe(format);
      expect(result.contentType).toBe(canonical);
      expect(imageFileName(result.bytes, result.format)).not.toMatch(/\.svg$/);
    },
  );

  // The file name is the only thing that decides what the site serves the bytes
  // as, so it has to come from the format that was proved rather than from the
  // header that was read.
  it("names the file from the proved format, not the declared one", async () => {
    const result = await download(JPEG_BYTES, "image/jpg");
    expect(imageFileName(result.bytes, result.format)).toMatch(/\.jpg$/);
  });

  it("keeps the signed URL out of a refusal", async () => {
    const signed =
      "https://s3.us-west-2.amazonaws.com/secure.notion-static.com/logo.png" +
      "?X-Amz-Signature=deadbeef&X-Amz-Security-Token=tok";

    await expect(
      downloadImage(signed, {
        fetchImpl: served(SCRIPT_SVG_BYTES, "image/svg+xml"),
        resolve: publicResolver,
      }),
    ).rejects.toSatisfy((error: unknown) => {
      const message = (error as Error).message;
      for (const secret of [
        "deadbeef",
        "X-Amz-Signature",
        "secure.notion-static.com",
        "/logo.png",
        "alert",
        "document.domain",
      ]) {
        expect(message).not.toContain(secret);
      }
      return /image/i.test(message);
    });
  });
});
