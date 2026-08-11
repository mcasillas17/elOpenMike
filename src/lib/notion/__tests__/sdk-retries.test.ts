import { describe, expect, it, vi } from "vitest";
import { Client } from "@notionhq/client";
import { createNotionClient } from "@/lib/notion/client";
import { withMutationRetry, withReadRetry } from "@/lib/notion/retry";

// The SDK retries by itself. Version 5 ships `retry: { maxRetries: 2 }` on by
// default and treats a 429 *and a 529* as retryable for every HTTP method —
// POST and PATCH included (see Client.js `canRetry`).
//
// That is the one policy this repo cannot have. A 529 on `pages.create` does
// not say whether the page was created: the request may well have landed and
// the answer got lost on the way back. Retrying it is how one post becomes two
// Notion pages claiming one slug — the state the sync refuses to publish at
// all, and the wreckage the migration's entire resume protocol exists to
// avoid. Meanwhile the repo's own withMutationRetry was carefully retrying
// only a 429, under an attempt budget it could reason about, three layers up
// from a client quietly doing something else.
//
// So the SDK's retries are turned off at construction and every retry in this
// repo is one of ours. These drive a *real* Client — the class the scripts
// use, through the constructor they call — with the HTTP layer swapped out, so
// what is counted is attempts on the wire.

type FakeResponse = {
  ok: boolean;
  status: number;
  headers: unknown;
  text: () => Promise<string>;
};

const overloaded = (): FakeResponse => ({
  ok: false,
  status: 529,
  headers: new Headers(),
  text: async () =>
    JSON.stringify({ code: "service_overload", message: "overloaded" }),
});

const serverError = (): FakeResponse => ({
  ok: false,
  status: 500,
  headers: new Headers(),
  text: async () =>
    JSON.stringify({ code: "internal_server_error", message: "sorry" }),
});

const rateLimited = (): FakeResponse => ({
  ok: false,
  status: 429,
  headers: new Headers({ "retry-after": "0" }),
  text: async () =>
    JSON.stringify({ code: "rate_limited", message: "slow down" }),
});

// Counts what reaches the wire, and records the method each attempt used.
function countingFetch(answer: () => FakeResponse) {
  const attempts: string[] = [];
  const fetchImpl = async (
    _url: string,
    init?: { method?: string },
  ): Promise<FakeResponse> => {
    attempts.push((init?.method ?? "GET").toUpperCase());
    return answer();
  };
  return { attempts, fetchImpl };
}

const TOKEN = "secret_test-token";

describe("the client the scripts construct", () => {
  it("makes one attempt at a 529 POST, not three", async () => {
    const { attempts, fetchImpl } = countingFetch(overloaded);
    const client = createNotionClient(TOKEN, { fetch: fetchImpl });

    await expect(
      client.dataSources.query({ data_source_id: "ds-1" }),
    ).rejects.toMatchObject({ status: 529 });

    expect(attempts).toEqual(["POST"]);
  });

  it("makes one attempt at a 529 PATCH, which could have landed", async () => {
    const { attempts, fetchImpl } = countingFetch(overloaded);
    const client = createNotionClient(TOKEN, { fetch: fetchImpl });

    await expect(
      client.pages.update({ page_id: "page-1", properties: {} }),
    ).rejects.toMatchObject({ status: 529 });

    expect(attempts).toEqual(["PATCH"]);
  });

  it("makes one attempt at a 529 page create", async () => {
    const { attempts, fetchImpl } = countingFetch(overloaded);
    const client = createNotionClient(TOKEN, { fetch: fetchImpl });

    await expect(
      client.request({ path: "pages", method: "post", body: {} }),
    ).rejects.toMatchObject({ status: 529 });

    expect(attempts).toEqual(["POST"]);
  });

  it("makes one attempt at a 429, which the repo's own policy handles", async () => {
    const { attempts, fetchImpl } = countingFetch(rateLimited);
    const client = createNotionClient(TOKEN, { fetch: fetchImpl });

    await expect(
      client.pages.update({ page_id: "page-1", properties: {} }),
    ).rejects.toMatchObject({ status: 429 });

    expect(attempts).toEqual(["PATCH"]);
  });

  // GET is idempotent, so the SDK retries a 500 on one. The repo's read
  // wrappers already do that, with a budget and a capped wait they own.
  it("makes one attempt at a 500 GET", async () => {
    const { attempts, fetchImpl } = countingFetch(serverError);
    const client = createNotionClient(TOKEN, { fetch: fetchImpl });

    await expect(
      client.pages.retrieve({ page_id: "page-1" }),
    ).rejects.toMatchObject({ status: 500 });

    expect(attempts).toEqual(["GET"]);
  });

  it("makes one attempt at a 500 children list", async () => {
    const { attempts, fetchImpl } = countingFetch(serverError);
    const client = createNotionClient(TOKEN, { fetch: fetchImpl });

    await expect(
      client.blocks.children.list({ block_id: "page-1" }),
    ).rejects.toMatchObject({ status: 500 });

    expect(attempts).toEqual(["GET"]);
  });

  it("still sends the pinned API version and the token it was given", async () => {
    const headers: Array<Record<string, string>> = [];
    const client = createNotionClient(TOKEN, {
      fetch: async (_url: string, init?: { headers?: Record<string, string> }) => {
        headers.push(init?.headers ?? {});
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          text: async () => JSON.stringify({ object: "page", id: "page-1" }),
        };
      },
    });

    await client.pages.retrieve({ page_id: "page-1" });

    expect(headers[0]["Notion-Version"]).toBe("2026-03-11");
    expect(headers[0]["authorization"]).toBe(`Bearer ${TOKEN}`);
  });

  // The counter is only worth something if it could see a retry at all. A
  // stock client, built the way the SDK ships, retries the same 529 twice more.
  it("is a real difference — the SDK's own default retries the same call", async () => {
    const { attempts, fetchImpl } = countingFetch(overloaded);
    const stock = new Client({
      auth: TOKEN,
      fetch: fetchImpl,
      // Only so the test does not sit through the SDK's back-off; the number of
      // attempts is the default one.
      retry: { initialRetryDelayMs: 0, maxRetryDelayMs: 0 },
    });

    await expect(
      stock.dataSources.query({ data_source_id: "ds-1" }),
    ).rejects.toMatchObject({ status: 529 });

    expect(attempts).toEqual(["POST", "POST", "POST"]);
  });
});

// With the SDK silent, every repeated request in the repo is one of these two,
// and they keep the split they were written for.
describe("the repo's own retry policy, now that it is the only one", () => {
  const sleep = async () => {};

  const failing = (status: number) => {
    let calls = 0;
    const operation = async () => {
      calls += 1;
      throw Object.assign(new Error(`status ${status}`), { status });
    };
    return { operation, count: () => calls };
  };

  it.each([429, 500, 502, 503, 504, 529])(
    "retries a read that met a %i, under its attempt budget",
    async (status) => {
      const { operation, count } = failing(status);

      await expect(
        withReadRetry(operation, { sleep }),
      ).rejects.toThrow(String(status));

      expect(count()).toBe(4);
    },
  );

  it("still gives up on a read that will not become a database", async () => {
    const { operation, count } = failing(404);

    await expect(withReadRetry(operation, { sleep })).rejects.toThrow("404");

    expect(count()).toBe(1);
  });

  it("retries a mutation only on the status that promises nothing happened", async () => {
    const limited = failing(429);
    await expect(
      withMutationRetry(limited.operation, { sleep }),
    ).rejects.toThrow("429");
    expect(limited.count()).toBe(4);

    for (const status of [500, 502, 503, 504, 529]) {
      const other = failing(status);
      await expect(
        withMutationRetry(other.operation, { sleep }),
      ).rejects.toThrow(String(status));
      expect(other.count()).toBe(1);
    }
  });

  // The ambiguity protocol in one line: a write that may have landed is never
  // sent twice, so the migration's create/append/publish sequence cannot
  // produce a second page claiming a slug.
  it("never repeats a create, an append or a publish it is unsure about", async () => {
    const sent: string[] = [];
    const write = (what: string) =>
      withMutationRetry(
        async () => {
          sent.push(what);
          throw Object.assign(new Error("overloaded"), { status: 529 });
        },
        { sleep },
      );

    await expect(write("create")).rejects.toThrow();
    await expect(write("append")).rejects.toThrow();
    await expect(write("publish")).rejects.toThrow();

    expect(sent).toEqual(["create", "append", "publish"]);
  });
});

describe("a read wrapped around a real client", () => {
  // The repo's own wrapper is the only layer that repeats anything now, so this
  // is what a 529 on a children list costs: four attempts, then the failure.
  it("is the layer that repeats a 529, and it stops at its budget", async () => {
    const { attempts, fetchImpl } = countingFetch(overloaded);
    const client = createNotionClient(TOKEN, { fetch: fetchImpl });

    vi.useFakeTimers();
    try {
      // The outcome is captured before the clock moves: awaiting only after
      // advancing the timers leaves a rejection unhandled for as long as the
      // advance takes, which Vitest fails the run over.
      const settled = withReadRetry(() =>
        client.blocks.children.list({ block_id: "page-1" }),
      ).then(
        (value) => () => value,
        (error: unknown) => () => {
          throw error;
        },
      );
      await vi.advanceTimersByTimeAsync(10 * 60_000);

      expect(await settled).toThrow();
    } finally {
      vi.useRealTimers();
    }

    expect(attempts).toEqual(["GET", "GET", "GET", "GET"]);
  });
});
