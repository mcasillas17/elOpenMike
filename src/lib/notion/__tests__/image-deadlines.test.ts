import { describe, expect, it } from "vitest";
import {
  downloadImage,
  IMAGE_IDLE_TIMEOUT_MS,
  IMAGE_TOTAL_TIMEOUT_MS,
  safeImageErrorMessage,
  type ImageTimers,
} from "@/lib/notion/images";
import { renderPosts } from "@/lib/notion/sync";
import type { AddressResolver } from "@/lib/notion/image-url";
import type { MdBlock } from "@/lib/notion/types";
import { block, rt } from "./fixtures/blocks";
import { pngCarrying, pngMarker } from "./fixtures/images";

// A Notion image URL is signed and expires in an hour, and the host on the
// other end is not this repo's. The download had no deadline of any kind: no
// total budget, and nothing at all watching a body that stops mid-transfer.
//
// `fetch` has no default timeout, so a host that accepts the connection and
// then says nothing holds the promise open forever. That is not one slow image:
// the sync awaits every image of a post before it renders it, so one stalled
// socket hangs the run — the scheduled workflow sits on a runner until the job
// times out, having written nothing, and the next tick starts behind the last.
//
// So every image gets two deadlines, and both of them can end the transfer:
//
//   * a total budget, which a body that trickles forever cannot outlast; and
//   * an idle budget, which is reset by every piece of progress — the address
//     resolving, a redirect answering, a chunk of the body arriving — and which
//     ends a transfer that has simply stopped.
//
// Both are enforced with the same AbortController the size cap already uses, so
// the connection is torn down rather than left open, and both are timers this
// module clears on its way out.

const SIGNED_URL =
  "https://prod-files-secure.s3.us-west-2.amazonaws.com/abc/photo.png?X-Amz-Signature=deadbeef";

const publicResolver: AddressResolver = async () => ["52.219.100.1"];

const pngBody = () => pngCarrying("png-data");

// A clock the test moves by hand. Nothing here waits on a real millisecond, and
// what is left pending when a download returns is exactly what a leaked timer
// would look like.
function testClock() {
  let now = 0;
  let handles = 0;
  const pending = new Map<number, { at: number; fire: () => void }>();

  const timers: ImageTimers = {
    setTimeout: (fire: () => void, ms: number) => {
      handles += 1;
      pending.set(handles, { at: now + ms, fire });
      return handles;
    },
    clearTimeout: (handle: unknown) => {
      pending.delete(handle as number);
    },
  };

  // Fires everything due within `ms`, in order, letting the promises each one
  // settles run before the next — and letting the work already in flight reach
  // its next await before the clock moves at all, so what a timer interrupts is
  // decided by the test rather than by how many microtasks a download happens
  // to take.
  const advance = async (ms: number): Promise<void> => {
    await flush();
    const target = now + ms;
    for (;;) {
      const due = [...pending.entries()]
        .filter(([, timer]) => timer.at <= target)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      pending.delete(due[0]);
      now = due[1].at;
      due[1].fire();
      await flush();
    }
    now = target;
    await flush();
  };

  return { timers, advance, pending: () => pending.size };
}

// Lets everything already queued run: the microtasks a chain of awaits leaves
// behind, and the one task turn a stream's own machinery needs.
const flush = async (): Promise<void> => {
  for (let turn = 0; turn < 5; turn += 1) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

const SHORT = { totalTimeoutMs: 10_000, idleTimeoutMs: 1_000 };

// A body handed over in pieces, one piece per `release()`, so a test decides
// when the transfer makes progress.
function trickle(chunks: Uint8Array[]) {
  const state = { pulled: 0, cancelled: false };
  let release: (() => void) | undefined;
  let controls: ReadableStreamDefaultController<Uint8Array> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controls = controller;
    },
    pull(controller) {
      if (state.pulled >= chunks.length) {
        controller.close();
        return;
      }
      const chunk = chunks[state.pulled];
      state.pulled += 1;
      return new Promise<void>((resolve) => {
        release = () => {
          controller.enqueue(chunk);
          release = undefined;
          resolve();
        };
      });
    },
    cancel() {
      state.cancelled = true;
      release = undefined;
    },
  });

  return {
    state,
    stream,
    // What a real body does when its request is aborted.
    error(reason: unknown): void {
      controls?.error(reason);
    },
    // Hands over the next chunk the reader asked for.
    async next(): Promise<void> {
      await flush();
      release?.();
      await flush();
    },
  };
}

const responseOf = (stream: ReadableStream<Uint8Array>) =>
  new Response(stream, { headers: { "content-type": "image/png" } });

// A body that behaves the way a real one does when the request is aborted: the
// stream is *errored*, which rejects the read already pending on it — and does
// so synchronously, so the abort's own rejection reaches the caller ahead of
// the deadline's. A fixture that merely stops answering lets the deadline win
// by default and proves nothing about which failure the operator is told about.
function abortingTrickle(chunks: Uint8Array[]) {
  const body = trickle(chunks);
  return {
    ...body,
    response(signal: AbortSignal | null | undefined): Response {
      signal?.addEventListener("abort", () => {
        body.error(new DOMException("This operation was aborted", "AbortError"));
      });
      return responseOf(body.stream);
    },
  };
}

// Splits a real PNG into `count` pieces, so a trickled body is still an image.
function pieces(count: number): Uint8Array[] {
  const body = pngBody();
  const size = Math.ceil(body.byteLength / count);
  const out: Uint8Array[] = [];
  for (let at = 0; at < body.byteLength; at += size) {
    out.push(body.slice(at, at + size));
  }
  return out;
}

describe("the deadlines every image download runs under", () => {
  it("has a total and an idle budget, and the idle one is the shorter", () => {
    expect(IMAGE_TOTAL_TIMEOUT_MS).toBeGreaterThan(0);
    expect(IMAGE_IDLE_TIMEOUT_MS).toBeGreaterThan(0);
    expect(IMAGE_IDLE_TIMEOUT_MS).toBeLessThan(IMAGE_TOTAL_TIMEOUT_MS);
  });

  it("ends a fetch that never answers at all", async () => {
    const clock = testClock();
    const signals: AbortSignal[] = [];
    const fetchImpl = (async (_url: string | URL, init?: RequestInit) => {
      if (init?.signal) signals.push(init.signal);
      return new Promise<Response>(() => {});
    }) as unknown as typeof fetch;

    const pending = downloadImage(SIGNED_URL, {
      fetchImpl,
      resolve: publicResolver,
      timers: clock.timers,
      ...SHORT,
    });
    const settled = pending.then(
      () => () => undefined,
      (error: unknown) => () => {
        throw error;
      },
    );

    await clock.advance(1_000);

    expect(await settled).toThrow(/timed out/i);
    expect(signals[0]?.aborted).toBe(true);
    expect(clock.pending()).toBe(0);
  });

  it("ends a body that arrives headers-first and then stops", async () => {
    const clock = testClock();
    const body = trickle(pieces(4));
    const signals: AbortSignal[] = [];
    const fetchImpl = (async (_url: string | URL, init?: RequestInit) => {
      if (init?.signal) signals.push(init.signal);
      return responseOf(body.stream);
    }) as unknown as typeof fetch;

    const settled = downloadImage(SIGNED_URL, {
      fetchImpl,
      resolve: publicResolver,
      timers: clock.timers,
      ...SHORT,
    }).then(
      () => () => undefined,
      (error: unknown) => () => {
        throw error;
      },
    );

    await body.next();
    await clock.advance(1_000);

    expect(await settled).toThrow(/timed out/i);
    expect(body.state.cancelled).toBe(true);
    expect(signals[0]?.aborted).toBe(true);
    expect(clock.pending()).toBe(0);
  });

  // A real body is *errored* by the abort the deadline makes, and a stream
  // rejects its pending read synchronously when that happens — so the abort's
  // own rejection can reach the caller before the deadline's does. What ended
  // the download is the deadline either way, and that is what has to be
  // reported: "transfer failed" reads as a connection somebody else dropped.
  it("still says it timed out when the abort errors the body first", async () => {
    const clock = testClock();
    const body = abortingTrickle(pieces(4));
    const fetchImpl = (async (_url: string | URL, init?: RequestInit) =>
      body.response(init?.signal)) as unknown as typeof fetch;

    const settled = downloadImage(SIGNED_URL, {
      fetchImpl,
      resolve: publicResolver,
      timers: clock.timers,
      ...SHORT,
    }).then(
      () => () => undefined,
      (error: unknown) => () => {
        throw error;
      },
    );

    await body.next();
    await clock.advance(1_000);

    expect(await settled).toThrow(/timed out/i);
    expect(await settled).not.toThrow(/transfer failed/i);
    expect(clock.pending()).toBe(0);
  });

  // The same race one step earlier: a fetch that rejects the moment it is
  // aborted, which is what every implementation that honours the signal does.
  it("still says it timed out when the fetch rejects on the abort", async () => {
    const clock = testClock();
    const fetchImpl = (async (_url: string | URL, init?: RequestInit) =>
      new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("This operation was aborted", "AbortError"));
        });
      })) as unknown as typeof fetch;

    const settled = downloadImage(SIGNED_URL, {
      fetchImpl,
      resolve: publicResolver,
      timers: clock.timers,
      ...SHORT,
    }).then(
      () => () => undefined,
      (error: unknown) => () => {
        throw error;
      },
    );

    await clock.advance(1_000);

    expect(await settled).toThrow(/timed out/i);
    expect(await settled).not.toThrow(/request failed|transfer failed/i);
    expect(clock.pending()).toBe(0);
  });

  it("keeps a slow but moving transfer alive — each chunk resets the idle budget", async () => {
    const clock = testClock();
    const body = trickle(pieces(4));
    const fetchImpl = (async () => responseOf(body.stream)) as unknown as typeof fetch;

    const pending = downloadImage(SIGNED_URL, {
      fetchImpl,
      resolve: publicResolver,
      timers: clock.timers,
      ...SHORT,
    });

    for (let chunk = 0; chunk < 4; chunk += 1) {
      // Just short of the idle budget, four times over: no single gap is long
      // enough to be a stall, and together they are four times the budget.
      await clock.advance(900);
      await body.next();
    }

    const image = await pending;

    expect(pngMarker(image.bytes)).toBe("png-data");
    expect(body.state.cancelled).toBe(false);
    expect(clock.pending()).toBe(0);
  });

  it("ends a transfer that never stops but never finishes either", async () => {
    const clock = testClock();
    // Enough chunks that the total budget runs out before the body does.
    const body = trickle(pieces(4));
    const fetchImpl = (async () => responseOf(body.stream)) as unknown as typeof fetch;

    const settled = downloadImage(SIGNED_URL, {
      fetchImpl,
      resolve: publicResolver,
      timers: clock.timers,
      totalTimeoutMs: 2_000,
      idleTimeoutMs: 1_000,
    }).then(
      () => () => undefined,
      (error: unknown) => () => {
        throw error;
      },
    );

    // Progress every 900ms keeps the idle budget open forever; the total one
    // is what ends it.
    for (let chunk = 0; chunk < 3; chunk += 1) {
      await clock.advance(900);
      await body.next();
    }

    expect(await settled).toThrow(/timed out/i);
    expect(body.state.cancelled).toBe(true);
    expect(clock.pending()).toBe(0);
  });

  it("ends a download whose address never resolves", async () => {
    const clock = testClock();
    let asked = 0;
    const stalling: AddressResolver = async () => {
      asked += 1;
      return new Promise<string[]>(() => {});
    };
    const fetchImpl = (async () => responseOf(trickle(pieces(1)).stream)) as unknown as typeof fetch;

    const settled = downloadImage(SIGNED_URL, {
      fetchImpl,
      resolve: stalling,
      timers: clock.timers,
      ...SHORT,
    }).then(
      () => () => undefined,
      (error: unknown) => () => {
        throw error;
      },
    );

    await clock.advance(1_000);

    expect(await settled).toThrow(/timed out/i);
    expect(asked).toBe(1);
    expect(clock.pending()).toBe(0);
  });

  it("ends a redirect chain that stalls on a later hop", async () => {
    const clock = testClock();
    const hops: string[] = [];
    const fetchImpl = (async (url: string | URL) => {
      hops.push(String(url));
      if (hops.length === 1) {
        return new Response(null, {
          status: 302,
          headers: {
            location:
              "https://prod-files-secure.s3.us-west-2.amazonaws.com/final.png",
          },
        });
      }
      return new Promise<Response>(() => {});
    }) as unknown as typeof fetch;

    const settled = downloadImage("https://file.notion.so/f/f/a/photo.png", {
      fetchImpl,
      resolve: publicResolver,
      timers: clock.timers,
      ...SHORT,
    }).then(
      () => () => undefined,
      (error: unknown) => () => {
        throw error;
      },
    );

    await clock.advance(1_000);

    expect(await settled).toThrow(/timed out/i);
    expect(hops).toHaveLength(2);
    expect(clock.pending()).toBe(0);
  });

  it("counts a redirect as progress, so a chain of slow hops still arrives", async () => {
    const clock = testClock();
    let hop = 0;
    const fetchImpl = (async () => {
      hop += 1;
      if (hop <= 3) {
        return new Response(null, {
          status: 302,
          headers: {
            location: `https://prod-files-secure.s3.us-west-2.amazonaws.com/hop-${hop}.png`,
          },
        });
      }
      return new Response(pngBody(), {
        headers: { "content-type": "image/png" },
      });
    }) as unknown as typeof fetch;

    const pending = downloadImage("https://file.notion.so/f/f/a/photo.png", {
      fetchImpl,
      resolve: publicResolver,
      timers: clock.timers,
      ...SHORT,
    });
    // Each hop lands well inside the idle budget, and four of them together
    // are three times it.
    for (let step = 0; step < 4; step += 1) await clock.advance(900);

    const image = await pending;

    expect(pngMarker(image.bytes)).toBe("png-data");
    expect(clock.pending()).toBe(0);
  });
});

describe("what a timed-out download says, and what it leaves behind", () => {
  const stalledDownload = async () => {
    const clock = testClock();
    const fetchImpl = (async () =>
      new Promise<Response>(() => {})) as unknown as typeof fetch;

    const settled = downloadImage(SIGNED_URL, {
      fetchImpl,
      resolve: publicResolver,
      timers: clock.timers,
      ...SHORT,
    }).then(
      () => undefined,
      (error: unknown) => error,
    );

    await clock.advance(1_000);
    return { error: await settled, clock };
  };

  it("names no url, no host and no signature", async () => {
    const { error } = await stalledDownload();
    const message = (error as Error).message;

    expect(message).not.toContain("prod-files-secure");
    expect(message).not.toContain("amazonaws");
    expect(message).not.toContain("deadbeef");
    expect(message).not.toContain("photo.png");
  });

  it("is the same shape of failure the rest of the module reports", async () => {
    const { error } = await stalledDownload();

    expect(safeImageErrorMessage(error)).toBe((error as Error).message);
    expect(safeImageErrorMessage(error)).toMatch(/^image download failed:/);
  });

  it("leaves no timer behind, whichever way the download ended", async () => {
    const { clock } = await stalledDownload();
    expect(clock.pending()).toBe(0);

    const done = testClock();
    await downloadImage(SIGNED_URL, {
      fetchImpl: (async () =>
        new Response(pngBody(), {
          headers: { "content-type": "image/png" },
        })) as unknown as typeof fetch,
      resolve: publicResolver,
      timers: done.timers,
      ...SHORT,
    });
    expect(done.pending()).toBe(0);

    const refused = testClock();
    await expect(
      downloadImage(SIGNED_URL, {
        fetchImpl: (async () =>
          new Response("nope", { status: 403 })) as unknown as typeof fetch,
        resolve: publicResolver,
        timers: refused.timers,
        ...SHORT,
      }),
    ).rejects.toThrow(/status 403/);
    expect(refused.pending()).toBe(0);
  });
});

// Every test above owns the clock. This is the wiring underneath it: no timers
// injected, so the module's own are used, with a budget short enough to watch.
describe("the same deadlines on the real clock", () => {
  it("ends a download that stalls, without a clock injected", async () => {
    const fetchImpl = (async () =>
      new Promise<Response>(() => {})) as unknown as typeof fetch;

    await expect(
      downloadImage(SIGNED_URL, {
        fetchImpl,
        resolve: publicResolver,
        totalTimeoutMs: 500,
        idleTimeoutMs: 20,
      }),
    ).rejects.toThrow(/timed out/i);
  });

  it("leaves an image that answers alone", async () => {
    const image = await downloadImage(SIGNED_URL, {
      fetchImpl: (async () =>
        new Response(pngBody(), {
          headers: { "content-type": "image/png" },
        })) as unknown as typeof fetch,
      resolve: publicResolver,
      totalTimeoutMs: 500,
      idleTimeoutMs: 200,
    });

    expect(pngMarker(image.bytes)).toBe("png-data");
    expect(image.format).toBe("png");
  });
});

// A post is published with all of its images or not at all — but one post's
// stalled image must not cost the rest of the blog its sync.
describe("a post whose image stalled", () => {
  const post = (slug: string, url: string) => ({
    pageId: `page-${slug}`,
    slug,
    frontmatter: {
      title: `Title ${slug}`,
      date: "2026-05-20",
      excerpt: `Excerpt ${slug}`,
      tags: ["AI"],
      updated: "2026-06-01",
    },
    blocks: [
      block("paragraph", { rich_text: [rt(`Body of ${slug}.`)] }),
      block("image", { type: "file", file: { url }, caption: [] }),
    ] as MdBlock[],
  });

  it("fails alone, with a message that repeats nothing about the url", async () => {
    const clock = testClock();
    const stalls = "https://file.notion.so/f/f/stalled/photo.png";

    const fetchImpl = (async (url: string | URL) =>
      String(url).includes("stalled")
        ? new Promise<Response>(() => {})
        : new Response(pngBody(), {
            headers: { "content-type": "image/png" },
          })) as unknown as typeof fetch;

    const rendering = renderPosts([post("a", SIGNED_URL), post("b", stalls)], (url) =>
      downloadImage(url, {
        fetchImpl,
        resolve: publicResolver,
        timers: clock.timers,
        ...SHORT,
      }),
    );

    // The first post's image arrives at once; the second one never does.
    await clock.advance(1_000);
    await clock.advance(1_000);
    const outcome = await rendering;

    expect(outcome.rendered.map((entry) => entry.slug)).toEqual(["a"]);
    expect(outcome.failures.map((failure) => failure.slug)).toEqual(["b"]);
    expect(outcome.failures[0].message).toMatch(/timed out/i);
    expect(outcome.failures[0].message).not.toContain("stalled");
    expect(clock.pending()).toBe(0);
  });
});
