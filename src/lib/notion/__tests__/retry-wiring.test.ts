import { describe, it, expect, vi, afterEach } from "vitest";
import type { Client } from "@notionhq/client";
import {
  fetchBlockTree,
  queryPages,
  retrieveDataSourceSchema,
  retrievePage,
} from "@/lib/notion/client";
import { listDataSources } from "@/lib/notion/data-source";
import { createMigrationExecutor } from "@/lib/notion/migrate-executor";
import type { DataSourceSchema } from "@/lib/notion/properties";

// The policy is only worth anything where the requests are actually made, so
// this drives the production functions the scripts call rather than the retry
// helper on its own. A read that gives up on the first 503 turns one bad minute
// of Notion's day into "the whole blog is unreadable" — which is what `--check`
// reports to CI — and a mutation that repeats one is how a single post becomes
// two Notion pages claiming one slug.
//
// Timers are faked because the retry waits are real seconds; nothing here
// changes the code's own backoff.

const serverError = (status: number) =>
  Object.assign(new Error(`Notion is having a moment (${status})`), { status });

const schema: DataSourceSchema = {
  Name: { type: "title" },
  Slug: { type: "rich_text" },
  Excerpt: { type: "rich_text" },
  Tags: { type: "multi_select" },
  Status: {
    type: "status",
    status: { options: [{ name: "Draft" }, { name: "Published" }] },
  },
  Published: { type: "date" },
};

// Runs `work` with the clock under control, so the code's own waits pass
// without the test waiting for them.
//
// The outcome is captured before the clock moves. Awaiting the work only after
// advancing the timers leaves a rejection unhandled for as long as the advance
// takes, and Vitest fails the whole run over one — correctly, since a rejection
// nobody is holding is exactly what a missed `await` looks like.
async function withoutWaiting<T>(work: () => Promise<T>): Promise<T> {
  vi.useFakeTimers();
  try {
    const settled = work().then(
      (value) => () => value,
      (error: unknown) => () => {
        throw error;
      },
    );
    // Long enough to cover every backoff the budget allows.
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    return (await settled)();
  } finally {
    vi.useRealTimers();
  }
}

afterEach(() => {
  vi.useRealTimers();
});

const emptyQuery = {
  results: [],
  has_more: false,
  next_cursor: null,
  request_status: { type: "complete" as const },
};

describe("a query that hits a transient 5xx", () => {
  it("retries the POST and returns the rows it eventually gets", async () => {
    let calls = 0;
    const client = {
      dataSources: {
        query: async () => {
          calls += 1;
          if (calls <= 2) throw serverError(503);
          return {
            ...emptyQuery,
            results: [
              {
                object: "page",
                id: "page-1",
                last_edited_time: "2026-05-20T00:00:00.000Z",
                properties: {},
              },
            ],
          };
        },
      },
    } as unknown as Client;

    const pages = await withoutWaiting(() => queryPages(client, "ds-1"));

    expect(calls).toBe(3);
    expect(pages.map((page) => page.id)).toEqual(["page-1"]);
  });

  it("gives up after the attempt budget rather than looping", async () => {
    let calls = 0;
    const client = {
      dataSources: {
        query: async () => {
          calls += 1;
          throw serverError(503);
        },
      },
    } as unknown as Client;

    await expect(
      withoutWaiting(() => queryPages(client, "ds-1")),
    ).rejects.toThrow(/503/);
    expect(calls).toBe(4);
  });

  it.each([500, 502, 503, 504])("retries a %i", async (status) => {
    let calls = 0;
    const client = {
      dataSources: {
        query: async () => {
          calls += 1;
          if (calls === 1) throw serverError(status);
          return emptyQuery;
        },
      },
    } as unknown as Client;

    await withoutWaiting(() => queryPages(client, "ds-1"));
    expect(calls).toBe(2);
  });

  it("does not retry a 404, which will not become a database", async () => {
    let calls = 0;
    const client = {
      dataSources: {
        query: async () => {
          calls += 1;
          throw serverError(404);
        },
      },
    } as unknown as Client;

    await expect(queryPages(client, "ds-1")).rejects.toThrow(/404/);
    expect(calls).toBe(1);
  });
});

describe("the other reads a run depends on", () => {
  it("retries a page retrieve", async () => {
    let calls = 0;
    const client = {
      pages: {
        retrieve: async () => {
          calls += 1;
          if (calls === 1) throw serverError(502);
          return {
            object: "page",
            id: "page-1",
            last_edited_time: "2026-05-20T00:00:00.000Z",
            properties: {},
          };
        },
      },
    } as unknown as Client;

    await withoutWaiting(() => retrievePage(client, "page-1"));
    expect(calls).toBe(2);
  });

  it("retries a children list", async () => {
    let calls = 0;
    const client = {
      blocks: {
        children: {
          list: async () => {
            calls += 1;
            if (calls === 1) throw serverError(500);
            return { results: [], has_more: false, next_cursor: null };
          },
        },
      },
    } as unknown as Client;

    await withoutWaiting(() => fetchBlockTree(client, "page-1"));
    expect(calls).toBe(2);
  });

  it("retries a data source schema read", async () => {
    let calls = 0;
    const client = {
      request: async () => {
        calls += 1;
        if (calls === 1) throw serverError(504);
        return { properties: { Name: { type: "title" } } };
      },
    } as unknown as Client;

    await withoutWaiting(() => retrieveDataSourceSchema(client, "ds-1"));
    expect(calls).toBe(2);
  });

  it("retries a database read", async () => {
    let calls = 0;
    const client = {
      databases: {
        retrieve: async () => {
          calls += 1;
          if (calls === 1) throw serverError(503);
          return { data_sources: [{ id: "ds-1", name: "Blog" }] };
        },
      },
    } as unknown as Client;

    const sources = await withoutWaiting(() => listDataSources(client, "db-1"));

    expect(calls).toBe(2);
    expect(sources).toEqual([{ id: "ds-1", name: "Blog" }]);
  });
});

// The executor is the migration's whole half of the API, and it is what the
// script wires up, so these are the very calls a real run makes.
describe("a mutation that hits a transient 5xx", () => {
  const page = {
    parent: { type: "data_source_id" as const, data_source_id: "ds-1" },
    properties: {},
    children: [],
  };

  function countingClient(status: number) {
    const calls = { create: 0, append: 0, update: 0 };
    const client = {
      request: async () => {
        calls.create += 1;
        throw serverError(status);
      },
      pages: {
        update: async () => {
          calls.update += 1;
          throw serverError(status);
        },
      },
      blocks: {
        children: {
          append: async () => {
            calls.append += 1;
            throw serverError(status);
          },
        },
      },
    } as unknown as Client;

    return { calls, executor: createMigrationExecutor(client, "ds-1", schema) };
  }

  it.each([500, 502, 503, 504])(
    "fails a create, an append and a promotion at once on a %i",
    async (status) => {
      const { calls, executor } = countingClient(status);

      await expect(executor.createPage(page)).rejects.toThrow(String(status));
      await expect(executor.appendChildren("page-1", [])).rejects.toThrow(
        String(status),
      );
      await expect(executor.publishPage("page-1")).rejects.toThrow(
        String(status),
      );

      expect(calls).toEqual({ create: 1, append: 1, update: 1 });
    },
  );

  it("waits and retries a 429, which says the request never landed", async () => {
    let calls = 0;
    const client = {
      request: async () => {
        calls += 1;
        if (calls === 1) {
          throw Object.assign(new Error("rate limited"), {
            status: 429,
            headers: new Headers({ "retry-after": "1" }),
          });
        }
        return { id: "page-9" };
      },
    } as unknown as Client;

    const executor = createMigrationExecutor(client, "ds-1", schema);
    const id = await withoutWaiting(() => executor.createPage(page));

    expect(calls).toBe(2);
    expect(id).toBe("page-9");
  });

  // The reads the executor makes are reads like any other, whichever object
  // they hang off.
  it("still retries the reads the executor makes", async () => {
    let queries = 0;
    const client = {
      dataSources: {
        query: async () => {
          queries += 1;
          if (queries === 1) throw serverError(503);
          return emptyQuery;
        },
      },
    } as unknown as Client;

    const executor = createMigrationExecutor(client, "ds-1", schema);
    await withoutWaiting(() => executor.claimants("a-post"));

    expect(queries).toBe(2);
  });
});
