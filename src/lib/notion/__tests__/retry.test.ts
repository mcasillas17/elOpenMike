import { describe, it, expect } from "vitest";
import { readHeader, retryAfterMs } from "@/lib/notion/retry";

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
