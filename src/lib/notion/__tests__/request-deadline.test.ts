import { describe, expect, it, vi } from "vitest";
import {
  createNotionClient,
  NOTION_REQUEST_TIMEOUT_MS,
} from "@/lib/notion/client";
import { withMutationRetry, withReadRetry } from "@/lib/notion/retry";

// The deadline used to end where the *headers* did.
//
// `paced()` raced the `fetch` call against 60 seconds and handed the response
// straight to the SDK, which then does `await response.text()` — outside the
// race, under no clock at all. A host that answered `200 OK` and then stopped
// sending held that read open forever: the scheduled sync sat on a runner until
// the job timed out, having written nothing, with the slot spent and the socket
// still open. Precisely the failure images.ts already had a clock for, on the
// half of the run that fetches the posts themselves.
//
// Nothing aborted anything, either. `RequestTimeoutError.rejectAfterTimeout`
// rejects a promise; it does not touch the request behind it. So a request the
// caller had given up on stayed in flight, and a request that never answers
// stayed in flight forever.
//
// So the deadline is one budget for the whole request — the fetch, the headers,
// and every byte of the body the SDK reads — enforced by an AbortController, on
// a timer that is cleared when the body ends, is cancelled, or fails.

const encoder = new TextEncoder();

type Fake = {
  ok: boolean;
  status: number;
  headers: Headers;
  text: () => Promise<string>;
  body?: ReadableStream<Uint8Array> | null;
};

const PAGE = '{"object":"page","id":"page-1","last_edited_time":"t"}';

// A body that arrives in pieces, `gapMs` apart, and then ends. Everything runs
// on the fake clock, so a body that takes a minute costs a test nothing.
function trickle(parts: string[], gapMs: number): ReadableStream<Uint8Array> {
  let index = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      await new Promise((resolve) => setTimeout(resolve, gapMs));
      if (index >= parts.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(parts[index++]));
    },
  });
}

// A body whose reads never settle: the socket is open, the promise is owed, and
// nothing but a clock will ever notice.
function stalled(): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    pull() {
      return new Promise<void>(() => {});
    },
  });
}

function streamed(body: ReadableStream<Uint8Array>, status = 200): Fake {
  return {
    ok: status < 400,
    status,
    headers: new Headers({ "content-type": "application/json" }),
    body,
    // The SDK reads a response with `text()`. Reading it *around* the
    // deadline-bound body would be a read under no clock, so this fails loudly
    // rather than quietly answering.
    text: async () => {
      throw new Error("the body must be read through the deadline-bound stream");
    },
  };
}

type Sent = { signal?: AbortSignal };

// Every request the client makes, with the signal it was handed, so a test can
// ask whether the thing behind a given-up request was actually stopped.
function record(
  answer: (call: number) => Fake | Promise<Fake>,
): { sent: Sent[]; fetch: (url: string, init?: unknown) => Promise<Fake> } {
  const sent: Sent[] = [];
  return {
    sent,
    fetch: async (_url: string, init?: unknown) => {
      const signal = (init as { signal?: AbortSignal } | undefined)?.signal;
      sent.push({ signal });
      return answer(sent.length - 1);
    },
  };
}

// The outcome of work that is still running, as a thunk, so a test can drive
// the clock forward *before* it asks how the work ended — which is the only
// order in which a deadline can be observed at all.
function settle<T>(work: Promise<T>): Promise<() => T> {
  return work.then(
    (value) => () => value,
    (error: unknown) => () => {
      throw error;
    },
  );
}

describe("the deadline one Notion request runs under", () => {
  it("ends a request that is never answered at all, and stops it", async () => {
    vi.useFakeTimers();
    try {
      const { sent, fetch } = record(() => new Promise<Fake>(() => {}));
      const client = createNotionClient("secret_t", { fetch });

      const outcome = settle(client.pages.retrieve({ page_id: "page-1" }));
      await vi.advanceTimersByTimeAsync(NOTION_REQUEST_TIMEOUT_MS + 1_000);

      expect(await outcome).toThrow(/timed out/i);
      // Not merely abandoned: the request behind it was aborted.
      expect(sent).toHaveLength(1);
      expect(sent[0].signal?.aborted).toBe(true);
      // And nothing is still counting.
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("ends a request whose headers arrived and whose body then stopped", async () => {
    vi.useFakeTimers();
    try {
      const { sent, fetch } = record(async () => streamed(stalled()));
      const client = createNotionClient("secret_t", { fetch });

      const outcome = settle(client.pages.retrieve({ page_id: "page-1" }));
      await vi.advanceTimersByTimeAsync(NOTION_REQUEST_TIMEOUT_MS + 1_000);

      expect(await outcome).toThrow(/timed out/i);
      expect(sent[0].signal?.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("ends a body that keeps trickling past the budget", async () => {
    vi.useFakeTimers();
    try {
      const forever = Array.from({ length: 40 }, () => " ");
      const { sent, fetch } = record(async () =>
        streamed(trickle(['{"object":"page",', ...forever], 15_000)),
      );
      const client = createNotionClient("secret_t", { fetch });

      const outcome = settle(client.pages.retrieve({ page_id: "page-1" }));
      await vi.advanceTimersByTimeAsync(NOTION_REQUEST_TIMEOUT_MS + 30_000);

      expect(await outcome).toThrow(/timed out/i);
      expect(sent[0].signal?.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("gives a body that arrives slowly the whole budget", async () => {
    vi.useFakeTimers();
    try {
      const { sent, fetch } = record(async () =>
        streamed(
          // Four waits — one per chunk, one to find the end — for 48 of the 60
          // seconds this request has. Slow is not stalled.
          trickle(
            ['{"object":"page",', '"id":"page-1",', '"last_edited_time":"t"}'],
            12_000,
          ),
        ),
      );
      const client = createNotionClient("secret_t", { fetch });

      const outcome = settle(client.pages.retrieve({ page_id: "page-1" }));
      await vi.advanceTimersByTimeAsync(NOTION_REQUEST_TIMEOUT_MS * 2);

      expect((await outcome)()).toMatchObject({ id: "page-1" });
      // A body that finished was never given up on, and nothing was left over.
      expect(sent[0].signal?.aborted).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears the deadline the moment a body ends", async () => {
    vi.useFakeTimers();
    try {
      const { sent, fetch } = record(async () => streamed(trickle([PAGE], 0)));
      const client = createNotionClient("secret_t", { fetch });

      const outcome = settle(client.pages.retrieve({ page_id: "page-1" }));
      await vi.advanceTimersByTimeAsync(10);
      expect((await outcome)()).toMatchObject({ id: "page-1" });

      // Nothing is counting, and nothing fires later: the request is over.
      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(NOTION_REQUEST_TIMEOUT_MS * 3);
      expect(sent[0].signal?.aborted).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("still answers a response that carries no body at all", async () => {
    vi.useFakeTimers();
    try {
      const { fetch } = record(async () => ({
        ok: true,
        status: 200,
        headers: new Headers(),
        body: null,
        text: async () => PAGE,
      }));
      const client = createNotionClient("secret_t", { fetch });

      const outcome = settle(client.pages.retrieve({ page_id: "page-1" }));
      await vi.advanceTimersByTimeAsync(10);

      expect((await outcome)()).toMatchObject({ id: "page-1" });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not spend the deadline waiting for a slot", async () => {
    vi.useFakeTimers();
    try {
      const { fetch } = record(async (call) =>
        call === 0
          ? {
              ok: false,
              status: 429,
              headers: new Headers({ "retry-after": "60" }),
              body: null,
              text: async () => '{"code":"rate_limited","message":"slow down"}',
            }
          : streamed(trickle([PAGE], 0)),
      );
      const client = createNotionClient("secret_t", { fetch });

      const refused = settle(client.pages.retrieve({ page_id: "page-1" }));
      const queued = settle(client.pages.retrieve({ page_id: "page-2" }));
      await vi.advanceTimersByTimeAsync(5 * 60_000);

      expect(await refused).toThrow(
        expect.objectContaining({ status: 429 }) as unknown as Error,
      );
      // Held back for a minute by somebody else's 429 and answered anyway: the
      // wait for a slot is not the request's to pay for.
      expect((await queued)()).toMatchObject({ id: "page-1" });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

// A timeout says nothing about whether the request landed. On a read that does
// not matter — reading twice leaves Notion exactly as it was — and repeating is
// what keeps one stalled socket from costing a post. On a write it is the whole
// question: repeating a `pages.create` that may already have created the page
// is how one post becomes two pages claiming one slug.
describe("what a timeout is allowed to repeat", () => {
  it("repeats a read whose first attempt stalled", async () => {
    vi.useFakeTimers();
    try {
      const { sent, fetch } = record(async (call) =>
        call === 0 ? streamed(stalled()) : streamed(trickle([PAGE], 0)),
      );
      const client = createNotionClient("secret_t", { fetch });

      const outcome = settle(
        withReadRetry(() => client.pages.retrieve({ page_id: "page-1" })),
      );
      await vi.advanceTimersByTimeAsync(NOTION_REQUEST_TIMEOUT_MS * 5);

      expect((await outcome)()).toMatchObject({ id: "page-1" });
      expect(sent).toHaveLength(2);
      expect(sent[0].signal?.aborted).toBe(true);
      expect(sent[1].signal?.aborted).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("never repeats a write that timed out", async () => {
    vi.useFakeTimers();
    try {
      const { sent, fetch } = record(async () => streamed(stalled()));
      const client = createNotionClient("secret_t", { fetch });

      const outcome = settle(
        withMutationRetry(() =>
          client.request<{ id: string }>({
            path: "pages",
            method: "post",
            body: { parent: { data_source_id: "ds-1" }, properties: {} },
          }),
        ),
      );
      await vi.advanceTimersByTimeAsync(NOTION_REQUEST_TIMEOUT_MS * 5);

      expect(await outcome).toThrow(/timed out/i);
      // One request, once: the page may well have been created.
      expect(sent).toHaveLength(1);
      expect(sent[0].signal?.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("gives up on a read that stalls every time, without hammering", async () => {
    vi.useFakeTimers();
    try {
      const { sent, fetch } = record(async () => streamed(stalled()));
      const client = createNotionClient("secret_t", { fetch });

      const outcome = settle(
        withReadRetry(() => client.pages.retrieve({ page_id: "page-1" })),
      );
      await vi.advanceTimersByTimeAsync(NOTION_REQUEST_TIMEOUT_MS * 10);

      expect(await outcome).toThrow(/timed out/i);
      expect(sent).toHaveLength(4);
      expect(sent.every((call) => call.signal?.aborted)).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
