import { describe, it, expect } from "vitest";
import {
  readHeader,
  retryAfterMs,
  withRetry,
  MAX_RETRY_WAIT_MS,
} from "@/lib/notion/retry";

describe("readHeader", () => {
  // The SDK sets an error's `headers` from the fetch Response, i.e. a Headers
  // instance — which has no index properties, so headers["retry-after"] is
  // always undefined. Both shapes have to work.
  it("reads a Headers instance", () => {
    expect(readHeader(new Headers({ "retry-after": "30" }), "retry-after")).toBe(
      "30",
    );
  });

  it("reads a plain object case-insensitively", () => {
    expect(readHeader({ "Retry-After": "12" }, "retry-after")).toBe("12");
  });

  it("returns undefined for a missing header or a non-object", () => {
    expect(readHeader(new Headers(), "retry-after")).toBeUndefined();
    expect(readHeader({}, "retry-after")).toBeUndefined();
    expect(readHeader(undefined, "retry-after")).toBeUndefined();
    expect(readHeader("nope", "retry-after")).toBeUndefined();
  });
});

describe("retryAfterMs", () => {
  it("honors the server's Retry-After over the attempt number", () => {
    expect(retryAfterMs(new Headers({ "retry-after": "30" }), 1)).toBe(30_000);
  });

  it("falls back to a per-attempt backoff when the header is absent", () => {
    expect(retryAfterMs(undefined, 1)).toBe(1_000);
    expect(retryAfterMs(new Headers(), 3)).toBe(3_000);
  });

  it("ignores a zero, negative, or unparseable Retry-After", () => {
    for (const value of ["0", "-5", "soon"]) {
      expect(retryAfterMs(new Headers({ "retry-after": value }), 2)).toBe(2_000);
    }
  });

  it("caps the wait so a hostile header can't stall the sync for hours", () => {
    expect(retryAfterMs(new Headers({ "retry-after": "99999" }), 1)).toBe(
      60_000,
    );
  });
});

// The retry loop itself had no coverage: it decides whether a rate-limited
// sync recovers or fails the run, and a wrong condition (retrying a 401 for
// ever, or giving up on the first 429) is invisible without it. The sleeper is
// injected so the tests assert the delay without waiting for it.
describe("withRetry", () => {
  const rateLimited = (headers?: HeadersInit) =>
    Object.assign(new Error("rate limited"), {
      status: 429,
      headers: headers ? new Headers(headers) : undefined,
    });

  function recorder() {
    const slept: number[] = [];
    return { slept, sleep: async (ms: number) => void slept.push(ms) };
  }

  it("returns the result without sleeping when the first call succeeds", async () => {
    const { slept, sleep } = recorder();
    await expect(withRetry(async () => "ok", { sleep })).resolves.toBe("ok");
    expect(slept).toEqual([]);
  });

  it("retries a 429 and returns the later success", async () => {
    const { slept, sleep } = recorder();
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls += 1;
        if (calls === 1) throw rateLimited({ "retry-after": "2" });
        return "recovered";
      },
      { sleep },
    );

    expect(result).toBe("recovered");
    expect(calls).toBe(2);
    expect(slept).toEqual([2_000]);
  });

  it("honors Retry-After on every attempt", async () => {
    const { slept, sleep } = recorder();
    let calls = 0;
    await withRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw rateLimited({ "retry-after": String(calls * 5) });
        return "ok";
      },
      { sleep },
    );
    expect(slept).toEqual([5_000, 10_000]);
  });

  it("falls back to a per-attempt backoff without the header", async () => {
    const { slept, sleep } = recorder();
    let calls = 0;
    await withRetry(
      async () => {
        calls += 1;
        if (calls < 4) throw rateLimited();
        return "ok";
      },
      { sleep },
    );
    expect(slept).toEqual([1_000, 2_000, 3_000]);
  });

  it("gives up after the attempt budget and rethrows the last error", async () => {
    const { slept, sleep } = recorder();
    let calls = 0;
    const error = rateLimited({ "retry-after": "1" });

    await expect(
      withRetry(
        async () => {
          calls += 1;
          throw error;
        },
        { attempts: 3, sleep },
      ),
    ).rejects.toBe(error);

    expect(calls).toBe(3);
    expect(slept).toEqual([1_000, 1_000]);
  });

  it("defaults to four attempts", async () => {
    const { sleep } = recorder();
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls += 1;
          throw rateLimited();
        },
        { sleep },
      ),
    ).rejects.toThrow(/rate limited/);
    expect(calls).toBe(4);
  });

  it("rethrows a non-429 immediately", async () => {
    for (const status of [400, 401, 403, 404, 500, undefined]) {
      const { slept, sleep } = recorder();
      let calls = 0;
      const error = Object.assign(new Error("nope"), { status });

      await expect(
        withRetry(
          async () => {
            calls += 1;
            throw error;
          },
          { sleep },
        ),
      ).rejects.toBe(error);

      expect(calls).toBe(1);
      expect(slept).toEqual([]);
    }
  });

  it("rethrows a thrown non-object without retrying", async () => {
    const { slept, sleep } = recorder();
    await expect(
      withRetry(async () => {
        throw "plain string";
      }, { sleep }),
    ).rejects.toBe("plain string");
    expect(slept).toEqual([]);
  });

  it("caps a hostile Retry-After", async () => {
    const { slept, sleep } = recorder();
    let calls = 0;
    await withRetry(
      async () => {
        calls += 1;
        if (calls === 1) throw rateLimited({ "retry-after": "99999" });
        return "ok";
      },
      { sleep },
    );
    expect(slept).toEqual([MAX_RETRY_WAIT_MS]);
  });
});
