import { describe, it, expect } from "vitest";
import type { Client } from "@notionhq/client";
import {
  mapWithConcurrency,
  MAX_CONCURRENT_REQUESTS,
} from "@/lib/notion/pool";
import { fetchBlockTree } from "@/lib/notion/client";

// Tracks how many workers are in flight at once.
function tracker() {
  const state = { active: 0, maxActive: 0, started: 0 };
  return {
    state,
    async run<T>(work: () => Promise<T>): Promise<T> {
      state.started += 1;
      state.active += 1;
      state.maxActive = Math.max(state.maxActive, state.active);
      try {
        return await work();
      } finally {
        state.active -= 1;
      }
    },
  };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 1));

describe("mapWithConcurrency", () => {
  it("returns results in input order regardless of completion order", async () => {
    const items = [30, 5, 20, 1, 10];
    const results = await mapWithConcurrency(items, async (ms) => {
      await new Promise((resolve) => setTimeout(resolve, ms));
      return `done-${ms}`;
    });
    expect(results).toEqual(items.map((ms) => `done-${ms}`));
  });

  it("never runs more than the limit at once", async () => {
    const { state, run } = tracker();
    await mapWithConcurrency(
      Array.from({ length: 25 }, (_, i) => i),
      (index) => run(async () => (await tick(), index)),
      3,
    );
    expect(state.started).toBe(25);
    expect(state.maxActive).toBe(3);
  });

  it("actually uses the full budget", async () => {
    const { state, run } = tracker();
    await mapWithConcurrency(
      Array.from({ length: 10 }, (_, i) => i),
      (index) => run(async () => (await tick(), index)),
      MAX_CONCURRENT_REQUESTS,
    );
    expect(state.maxActive).toBe(MAX_CONCURRENT_REQUESTS);
  });

  it("passes the index to the worker", async () => {
    const seen: number[] = [];
    await mapWithConcurrency(["a", "b", "c"], async (_item, index) => {
      seen.push(index);
      return index;
    });
    expect(seen.sort()).toEqual([0, 1, 2]);
  });

  it("handles an empty list and a list shorter than the limit", async () => {
    expect(await mapWithConcurrency([], async (x) => x)).toEqual([]);
    const { state, run } = tracker();
    expect(
      await mapWithConcurrency([1, 2], (n) => run(async () => n * 2), 5),
    ).toEqual([2, 4]);
    expect(state.maxActive).toBe(2);
  });

  it("rejects with the first failure and stops queueing more work", async () => {
    const { state, run } = tracker();
    await expect(
      mapWithConcurrency(
        Array.from({ length: 30 }, (_, i) => i),
        (index) =>
          run(async () => {
            await tick();
            if (index === 1) throw new Error("boom");
            return index;
          }),
        2,
      ),
    ).rejects.toThrow("boom");

    // The two in-flight workers finish, but the remaining 26 never start.
    expect(state.started).toBeLessThanOrEqual(4);
  });

  it("refuses a nonsensical limit rather than running unbounded", async () => {
    for (const limit of [0, -1, 1.5, Number.NaN]) {
      await expect(
        mapWithConcurrency([1], async (n) => n, limit),
      ).rejects.toThrow(RangeError);
    }
  });
});

// Notion allows roughly 3 requests/second per integration. The sync fetched
// every page's block tree with Promise.all, so a 30-post blog opened 30
// concurrent walks and leaned entirely on 429 retries to survive.
describe("fetching block trees through the pool", () => {
  // Minimal stand-in for the Notion client: one child list per block, with a
  // counter for how many list calls overlap.
  function fakeClient() {
    const state = { active: 0, maxActive: 0, calls: 0 };
    const client = {
      blocks: {
        children: {
          list: async ({ block_id }: { block_id: string }) => {
            state.calls += 1;
            state.active += 1;
            state.maxActive = Math.max(state.maxActive, state.active);
            await tick();
            state.active -= 1;
            return {
              results: [
                {
                  object: "block",
                  id: `${block_id}-child`,
                  type: "paragraph",
                  has_children: false,
                  paragraph: { rich_text: [] },
                },
              ],
              has_more: false,
              next_cursor: null,
            };
          },
        },
      },
    };
    return { state, client: client as unknown as Client };
  }

  const pageIds = Array.from({ length: 12 }, (_, i) => `page-${i}`);

  it("keeps at most three requests in flight", async () => {
    const { state, client } = fakeClient();
    const trees = await mapWithConcurrency(pageIds, (id) =>
      fetchBlockTree(client, id),
    );

    expect(trees).toHaveLength(12);
    expect(state.calls).toBe(12);
    expect(state.maxActive).toBe(MAX_CONCURRENT_REQUESTS);
  });

  it("is a real bound — Promise.all over the same work is not", async () => {
    const { state, client } = fakeClient();
    await Promise.all(pageIds.map((id) => fetchBlockTree(client, id)));
    expect(state.maxActive).toBe(12);
  });

  it("still returns each page's blocks in page order", async () => {
    const { client } = fakeClient();
    const trees = await mapWithConcurrency(pageIds, (id) =>
      fetchBlockTree(client, id),
    );
    expect(trees.map((blocks) => blocks[0].id)).toEqual(
      pageIds.map((id) => `${id}-child`),
    );
  });
});
