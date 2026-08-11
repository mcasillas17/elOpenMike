import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  downloadImage,
  MAX_IMAGE_BYTES,
  type ImageTimers,
} from "@/lib/notion/images";
import type { AddressResolver } from "@/lib/notion/image-url";
import { pngCarrying, pngMarker } from "./fixtures/images";

// Giving up on a body is not the same as being told it is over.
//
// Every way this module refuses an image ends by letting go of the response:
// the 3xx body before the next hop, the body of a type it will not read, the
// body that went past the size cap, the body the deadline ended. Each of those
// was written as `await ...cancel()` — and a cancel is a promise the *other
// side* settles. A host that stops answering reads is exactly the host whose
// stream sits on its cancel too, and the run that was supposed to be bounded by
// a deadline then hung on the cleanup that deadline asked for. The whole point
// of the size cap and the timeouts is that this function comes back; a cancel
// nobody can be made to answer must never be what stops it.
//
// So cancellation is best effort, and it happens in this order: the request is
// aborted first — that is the part this side controls, and it is what actually
// tears the connection down — and only then is the body asked to release. That
// ask is never awaited unbounded, and its rejection is always taken, because an
// unhandled rejection is a process-level event that would take the run down
// from a path whose whole job is to fail quietly.

const SIGNED_URL =
  "https://prod-files-secure.s3.us-west-2.amazonaws.com/abc/photo.png?X-Amz-Signature=deadbeef";

const publicResolver: AddressResolver = async () => ["52.219.100.1"];

const SHORT = { totalTimeoutMs: 10_000, idleTimeoutMs: 1_000 };

// How long a refusal may take once nothing is left to wait for. Real
// milliseconds, deliberately: the point is that the function comes back without
// anything settling the cancel it asked for, and a fake clock nobody advances
// is the closest thing to a host that never answers.
const PROMPTLY_MS = 500;

// A clock the test owns, so a timer left behind is visible as a number.
function testClock() {
  let handles = 0;
  const pending = new Map<number, () => void>();

  const timers: ImageTimers = {
    setTimeout: (fire: () => void) => {
      handles += 1;
      pending.set(handles, fire);
      return handles;
    },
    clearTimeout: (handle: unknown) => {
      pending.delete(handle as number);
    },
  };

  return { timers, pending: () => pending.size };
}

// Settles into a thunk that rethrows, or fails outright when the work is still
// running after `ms` — which is what awaiting a cancel nobody answers looks
// like from the outside.
async function within<T>(work: Promise<T>, ms = PROMPTLY_MS): Promise<() => T> {
  let handle: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    handle = setTimeout(
      () => reject(new Error(`did not settle within ${ms}ms`)),
      ms,
    );
  });

  try {
    const settled = await Promise.race([
      work.then(
        (value) => () => value,
        (error: unknown) => () => {
          throw error;
        },
      ),
      late,
    ]);
    return settled;
  } finally {
    clearTimeout(handle);
  }
}

// Collects the rejections nothing took. Node reports these on its own turn, so
// the check has to come after one.
function watchUnhandled() {
  const seen: unknown[] = [];
  const onUnhandled = (reason: unknown) => {
    seen.push(reason);
  };
  process.on("unhandledRejection", onUnhandled);
  return {
    seen,
    stop: () => process.off("unhandledRejection", onUnhandled),
    settle: async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return seen;
    },
  };
}

let unhandled: ReturnType<typeof watchUnhandled>;

beforeEach(() => {
  unhandled = watchUnhandled();
});

afterEach(async () => {
  const seen = await unhandled.settle();
  unhandled.stop();
  expect(seen.map(String)).toEqual([]);
});

type CancelBehaviour = "hangs" | "rejects";

// A body that hands over its chunks and then refuses to be let go of: its
// cancel either never settles or rejects, which is every hostile or broken
// stream this module has to survive.
//
// It never ends of its own accord either — once its chunks are gone it simply
// goes quiet, the way an open socket that has stopped sending does. A fixture
// that closes itself would have nothing left to cancel, and would prove
// nothing about the path that has to let go of a live one.
function unreleasableBody(chunks: Uint8Array[], behaviour: CancelBehaviour) {
  const state = { cancels: 0, abortedWhenCancelled: [] as boolean[] };
  let signal: AbortSignal | undefined;
  let index = 0;

  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index >= chunks.length) return new Promise<void>(() => {});
      controller.enqueue(chunks[index]);
      index += 1;
      return undefined;
    },
    cancel() {
      state.cancels += 1;
      state.abortedWhenCancelled.push(signal?.aborted ?? false);
      return behaviour === "hangs"
        ? new Promise<void>(() => {})
        : Promise.reject(new Error("this body will not be cancelled"));
    },
  });

  return {
    state,
    stream,
    // The signal whose `aborted` the cancel callback reads: the order this
    // module does its two jobs in is the thing being asserted.
    watch(init: RequestInit | undefined): void {
      signal = init?.signal ?? undefined;
    },
  };
}

const pngBody = () => pngCarrying("png-data");

const oversized = () => [new Uint8Array(MAX_IMAGE_BYTES + 1)];

describe("a body that will not be cancelled", () => {
  it.each<CancelBehaviour>(["hangs", "rejects"])(
    "still ends an over-sized transfer when its cancel %s",
    async (behaviour) => {
      const clock = testClock();
      const body = unreleasableBody(oversized(), behaviour);
      const fetchImpl = (async (_url: string | URL, init?: RequestInit) => {
        body.watch(init);
        return new Response(body.stream, {
          headers: { "content-type": "image/png" },
        });
      }) as unknown as typeof fetch;

      const settled = await within(
        downloadImage(SIGNED_URL, {
          fetchImpl,
          resolve: publicResolver,
          timers: clock.timers,
          ...SHORT,
        }),
      );

      expect(settled).toThrow(/too large/i);
      expect(body.state.cancels).toBe(1);
      // Aborted first: the connection is torn down by the side that can, and
      // the ask to release is the courtesy afterwards.
      expect(body.state.abortedWhenCancelled).toEqual([true]);
      expect(clock.pending()).toBe(0);
    },
  );

  it.each<CancelBehaviour>(["hangs", "rejects"])(
    "still refuses a body of the wrong type when its cancel %s",
    async (behaviour) => {
      const clock = testClock();
      const body = unreleasableBody([new Uint8Array(8)], behaviour);
      const fetchImpl = (async (_url: string | URL, init?: RequestInit) => {
        body.watch(init);
        return new Response(body.stream, {
          headers: { "content-type": "image/svg+xml" },
        });
      }) as unknown as typeof fetch;

      const settled = await within(
        downloadImage(SIGNED_URL, {
          fetchImpl,
          resolve: publicResolver,
          timers: clock.timers,
          ...SHORT,
        }),
      );

      expect(settled).toThrow(/image rejected/i);
      expect(body.state.cancels).toBe(1);
      expect(body.state.abortedWhenCancelled).toEqual([true]);
      expect(clock.pending()).toBe(0);
    },
  );

  it.each<CancelBehaviour>(["hangs", "rejects"])(
    "still refuses a declared length over the cap when its cancel %s",
    async (behaviour) => {
      const clock = testClock();
      const body = unreleasableBody([new Uint8Array(8)], behaviour);
      const fetchImpl = (async (_url: string | URL, init?: RequestInit) => {
        body.watch(init);
        return new Response(body.stream, {
          headers: {
            "content-type": "image/png",
            "content-length": String(MAX_IMAGE_BYTES + 1),
          },
        });
      }) as unknown as typeof fetch;

      const settled = await within(
        downloadImage(SIGNED_URL, {
          fetchImpl,
          resolve: publicResolver,
          timers: clock.timers,
          ...SHORT,
        }),
      );

      expect(settled).toThrow(/too large/i);
      // The body is let go of here too: refusing on the header alone used to
      // abort and leave the stream holding itself open.
      expect(body.state.cancels).toBe(1);
      expect(body.state.abortedWhenCancelled).toEqual([true]);
      expect(clock.pending()).toBe(0);
    },
  );

  it.each<CancelBehaviour>(["hangs", "rejects"])(
    "still follows a redirect whose 3xx body's cancel %s",
    async (behaviour) => {
      const clock = testClock();
      const body = unreleasableBody([new Uint8Array(4)], behaviour);
      let hop = 0;
      const fetchImpl = (async (_url: string | URL, init?: RequestInit) => {
        hop += 1;
        if (hop === 1) {
          body.watch(init);
          return new Response(body.stream, {
            status: 302,
            headers: {
              location:
                "https://prod-files-secure.s3.us-west-2.amazonaws.com/final.png",
            },
          });
        }
        return new Response(pngBody(), {
          headers: { "content-type": "image/png" },
        });
      }) as unknown as typeof fetch;

      const settled = await within(
        downloadImage("https://file.notion.so/f/f/a/photo.png", {
          fetchImpl,
          resolve: publicResolver,
          timers: clock.timers,
          ...SHORT,
        }),
      );

      // A hop that will not let go of its socket does not stop the chain: the
      // ask is made, and the next request goes out regardless.
      expect(pngMarker(settled().bytes)).toBe("png-data");
      expect(hop).toBe(2);
      expect(body.state.cancels).toBe(1);
      // The download is still running here, so nothing has been aborted: this
      // one is a release, not a refusal.
      expect(body.state.abortedWhenCancelled).toEqual([false]);
      expect(clock.pending()).toBe(0);
    },
  );

  it.each<CancelBehaviour>(["hangs", "rejects"])(
    "still ends a refused status when the body's cancel %s",
    async (behaviour) => {
      const clock = testClock();
      const body = unreleasableBody([new Uint8Array(8)], behaviour);
      const fetchImpl = (async (_url: string | URL, init?: RequestInit) => {
        body.watch(init);
        return new Response(body.stream, {
          status: 403,
          headers: { "content-type": "text/plain" },
        });
      }) as unknown as typeof fetch;

      const settled = await within(
        downloadImage(SIGNED_URL, {
          fetchImpl,
          resolve: publicResolver,
          timers: clock.timers,
          ...SHORT,
        }),
      );

      expect(settled).toThrow(/status 403/);
      expect(body.state.cancels).toBe(1);
      expect(body.state.abortedWhenCancelled).toEqual([true]);
      expect(clock.pending()).toBe(0);
    },
  );

  it.each<CancelBehaviour>(["hangs", "rejects"])(
    "still ends a stalled transfer on its deadline when the cancel %s",
    async (behaviour) => {
      // A real clock this time, because the deadline is what has to fire — and
      // then the cancel it asks for must not become the new way to hang.
      const body = unreleasableBody([], behaviour);
      const stalling = new ReadableStream<Uint8Array>({
        pull() {
          return new Promise<void>(() => {});
        },
        cancel: () => {
          body.state.cancels += 1;
          return behaviour === "hangs"
            ? new Promise<void>(() => {})
            : Promise.reject(new Error("this body will not be cancelled"));
        },
      });

      const fetchImpl = (async () =>
        new Response(stalling, {
          headers: { "content-type": "image/png" },
        })) as unknown as typeof fetch;

      const settled = await within(
        downloadImage(SIGNED_URL, {
          fetchImpl,
          resolve: publicResolver,
          totalTimeoutMs: 200,
          idleTimeoutMs: 20,
        }),
        2_000,
      );

      expect(settled).toThrow(/timed out/i);
      expect(body.state.cancels).toBe(1);
    },
  );
});

// The ordinary paths, unchanged: a cancel that answers is still asked for, and
// an image that arrives is never cancelled at all.
describe("a body that behaves", () => {
  it("is never cancelled when the image simply arrives", async () => {
    const clock = testClock();
    let cancels = 0;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(pngBody());
        controller.close();
      },
      cancel() {
        cancels += 1;
      },
    });

    const image = await downloadImage(SIGNED_URL, {
      fetchImpl: (async () =>
        new Response(stream, {
          headers: { "content-type": "image/png" },
        })) as unknown as typeof fetch,
      resolve: publicResolver,
      timers: clock.timers,
      ...SHORT,
    });

    expect(pngMarker(image.bytes)).toBe("png-data");
    expect(cancels).toBe(0);
    expect(clock.pending()).toBe(0);
  });

  it("releases a redirect's body before the next hop", async () => {
    const clock = testClock();
    let cancels = 0;
    let hop = 0;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(4));
        controller.close();
      },
      cancel() {
        cancels += 1;
      },
    });

    const image = await downloadImage("https://file.notion.so/f/f/a/photo.png", {
      fetchImpl: (async () => {
        hop += 1;
        if (hop === 1) {
          return new Response(stream, {
            status: 302,
            headers: {
              location:
                "https://prod-files-secure.s3.us-west-2.amazonaws.com/final.png",
            },
          });
        }
        return new Response(pngBody(), {
          headers: { "content-type": "image/png" },
        });
      }) as unknown as typeof fetch,
      resolve: publicResolver,
      timers: clock.timers,
      ...SHORT,
    });

    expect(pngMarker(image.bytes)).toBe("png-data");
    expect(cancels).toBe(1);
    expect(clock.pending()).toBe(0);
  });
});
