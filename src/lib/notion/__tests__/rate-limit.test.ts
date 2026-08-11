import { describe, expect, it } from "vitest";
import { createNotionClient } from "@/lib/notion/client";
import {
  MAX_REQUEST_PAUSE_MS,
  NOTION_REQUESTS_PER_SECOND,
  RATE_LIMIT_PAUSE_MS,
  RequestScheduler,
} from "@/lib/notion/rate-limit";
import { withMutationRetry, withReadRetry } from "@/lib/notion/retry";
import { mapWithConcurrency } from "@/lib/notion/pool";
import { TestClock } from "./fixtures/clock";

// Notion allows an integration roughly three requests a second, and answers a
// burst with a 429 carrying Retry-After. Everything in this repo was written
// as though that limit belonged to whoever happened to be calling: the sync's
// pool bounds *concurrency* at three, which is not a rate at all — three
// workers each finishing in 40ms is 75 requests a second — and the retry
// wrappers bound *one call's* repeats, so a rate limit reported to one worker
// was invisible to the other two, which carried on into the same wall.
//
// Neither is per-integration, and the limit is. So there is one scheduler per
// client, every request goes through it, and it enforces two things nothing
// else can:
//
//   * a rate. Requests leave at most one per interval, so a run's average is
//     under the limit however many workers there are and however fast the
//     answers come back — retries included, because a retry is a request.
//   * a pause. A 429 or a 529 read off *any* response stops every queued
//     worker until Retry-After says the integration may talk again, or, when
//     Notion sends no header, until a jittered exponential back-off does.
//
// The waiting is what makes it work and what makes it untestable against a
// real clock, so the clock, the sleep and the jitter are all arguments. See
// fixtures/clock.ts.

const scheduler = (clock: TestClock, over: Record<string, unknown> = {}) =>
  new RequestScheduler({
    now: clock.now,
    sleep: clock.sleep,
    random: () => 0.5,
    ...over,
  });

describe("the rate a run's requests leave at", () => {
  it("spaces them by the interval the limit implies", async () => {
    const clock = new TestClock();
    const paced = scheduler(clock);
    const at: number[] = [];

    await clock.settle(
      Promise.all(
        Array.from({ length: 10 }, () =>
          paced.run(async () => {
            at.push(clock.now());
          }),
        ),
      ),
    );

    expect(at).toHaveLength(10);
    for (let i = 1; i < at.length; i += 1) {
      expect(at[i] - at[i - 1]).toBeGreaterThanOrEqual(paced.intervalMs);
    }
  });

  it("never lets more than the limit through in any one second", async () => {
    const clock = new TestClock();
    const paced = scheduler(clock);
    const at: number[] = [];

    await clock.settle(
      Promise.all(
        Array.from({ length: 30 }, () =>
          paced.run(async () => {
            at.push(clock.now());
          }),
        ),
      ),
    );

    for (const start of at) {
      const inWindow = at.filter((when) => when >= start && when < start + 1000);
      expect(inWindow.length).toBeLessThanOrEqual(NOTION_REQUESTS_PER_SECOND);
    }
    // And the average over the whole run is under the limit too.
    const elapsed = at[at.length - 1] - at[0];
    expect((at.length - 1) / (elapsed / 1000)).toBeLessThanOrEqual(
      NOTION_REQUESTS_PER_SECOND,
    );
  });

  it("paces the workers of a pool against each other, not each on its own", async () => {
    const clock = new TestClock();
    const paced = scheduler(clock);
    const at: number[] = [];

    await clock.settle(
      mapWithConcurrency(
        Array.from({ length: 9 }, (_, i) => i),
        () =>
          paced.run(async () => {
            at.push(clock.now());
          }),
        3,
      ),
    );

    expect(at).toHaveLength(9);
    expect(at[at.length - 1] - at[0]).toBeGreaterThanOrEqual(
      paced.intervalMs * 8,
    );
  });

  it("hands the slots out in the order they were asked for", async () => {
    const clock = new TestClock();
    const paced = scheduler(clock);
    const order: number[] = [];

    await clock.settle(
      Promise.all(
        Array.from({ length: 12 }, (_, i) =>
          paced.run(async () => {
            order.push(i);
          }),
        ),
      ),
    );

    expect(order).toEqual([...Array(12).keys()]);
  });

  it("leaves nothing waiting behind it", async () => {
    const clock = new TestClock();
    const paced = scheduler(clock);

    await clock.settle(
      Promise.all(Array.from({ length: 5 }, () => paced.run(async () => {}))),
    );

    expect(paced.waiting).toBe(0);
    expect(clock.pending).toBe(0);
  });

  it("keeps the slot of a request that failed, because it still went out", async () => {
    const clock = new TestClock();
    const paced = scheduler(clock);
    const at: number[] = [];

    await clock.settle(
      Promise.all(
        Array.from({ length: 3 }, () =>
          paced
            .run(async () => {
              at.push(clock.now());
              throw new Error("nope");
            })
            .catch(() => {}),
        ),
      ),
    );

    expect(at[1] - at[0]).toBeGreaterThanOrEqual(paced.intervalMs);
    expect(at[2] - at[1]).toBeGreaterThanOrEqual(paced.intervalMs);
  });
});

describe("a rate limit one worker meets", () => {
  it("stops every other worker until Retry-After says otherwise", async () => {
    const clock = new TestClock();
    const paced = scheduler(clock);
    const at: number[] = [];

    await clock.settle(
      Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          paced.run(async () => {
            at.push(clock.now());
            if (i === 0) {
              paced.observe(429, new Headers({ "retry-after": "5" }));
            }
          }),
        ),
      ),
    );

    // The first request went out; every one after it waited out the pause.
    expect(at[0]).toBe(0);
    for (const when of at.slice(1)) expect(when).toBeGreaterThanOrEqual(5000);
  });

  it("stops them for a 529 as well, which is the same request refused", async () => {
    const clock = new TestClock();
    const paced = scheduler(clock);
    const at: number[] = [];

    await clock.settle(
      Promise.all(
        Array.from({ length: 3 }, (_, i) =>
          paced.run(async () => {
            at.push(clock.now());
            if (i === 0) paced.observe(529, new Headers({ "retry-after": "2" }));
          }),
        ),
      ),
    );

    expect(at[1]).toBeGreaterThanOrEqual(2000);
  });

  it("backs off exponentially, with jitter, when Notion sends no header", async () => {
    const clock = new TestClock();
    const paced = scheduler(clock, { random: () => 0.5 });
    const waits: number[] = [];

    for (let round = 0; round < 4; round += 1) {
      paced.observe(529, new Headers());
      waits.push(paced.pausedFor);
      // Waited out, so the next round is measured from a standing start.
      await clock.settle(paced.run(async () => {}));
    }

    // 1s, 2s, 4s, 8s ceilings, half of each plus the injected half-jitter.
    expect(waits).toEqual([750, 1500, 3000, 6000]);
  });

  it("takes the jitter from the random it was handed, and only from there", async () => {
    const clock = new TestClock();
    const low = scheduler(clock, { random: () => 0 });
    const high = scheduler(clock, { random: () => 1 });

    low.observe(429, new Headers());
    high.observe(429, new Headers());

    expect(low.pausedFor).toBe(RATE_LIMIT_PAUSE_MS / 2);
    expect(high.pausedFor).toBe(RATE_LIMIT_PAUSE_MS);
  });

  it("never waits longer than the cap, whatever it is told", async () => {
    const clock = new TestClock();
    const paced = scheduler(clock, { random: () => 1 });

    paced.observe(429, new Headers({ "retry-after": "86400" }));
    expect(paced.pausedFor).toBe(MAX_REQUEST_PAUSE_MS);

    const escalating = scheduler(clock, { random: () => 1 });
    for (let round = 0; round < 20; round += 1) {
      escalating.observe(529, new Headers());
    }
    expect(escalating.pausedFor).toBeLessThanOrEqual(MAX_REQUEST_PAUSE_MS);
  });

  it("starts the back-off over once the integration is being answered again", async () => {
    const clock = new TestClock();
    const paced = scheduler(clock, { random: () => 0.5 });

    paced.observe(529, new Headers());
    paced.observe(529, new Headers());
    expect(paced.pausedFor).toBe(1500);

    // The pause is waited out and the next request is answered normally: the
    // run of refusals is over, so the next one starts at the first step again.
    await clock.settle(paced.run(async () => {}));
    paced.observe(200, new Headers());
    expect(paced.pausedFor).toBe(0);

    paced.observe(529, new Headers());
    expect(paced.pausedFor).toBe(750);
  });

  it("keeps the longest pause it has been given, not the latest", async () => {
    const clock = new TestClock();
    const paced = scheduler(clock);

    paced.observe(429, new Headers({ "retry-after": "10" }));
    paced.observe(429, new Headers({ "retry-after": "1" }));

    expect(paced.pausedFor).toBe(10_000);
  });
});

describe("the retries that go through it", () => {
  // A retry is a request. It waits its turn like any other, so a run that is
  // being rate limited cannot answer the limit by sending more.
  it("costs a read its attempt budget and no more", async () => {
    const clock = new TestClock();
    const paced = scheduler(clock);
    let attempts = 0;

    const rateLimited = () =>
      Object.assign(new Error("rate limited"), {
        status: 429,
        headers: new Headers({ "retry-after": "1" }),
      });

    const outcome = clock.settle(
      withReadRetry(
        () =>
          paced.run(async () => {
            attempts += 1;
            paced.observe(429, new Headers({ "retry-after": "1" }));
            throw rateLimited();
          }),
        { sleep: clock.sleep },
      ),
    );

    await expect(outcome).rejects.toThrow("rate limited");
    expect(attempts).toBe(4);
  });

  // The pause and the caller's own back-off are the same Retry-After, started
  // at the same moment, so they overlap rather than add up.
  it("waits the Retry-After once, not once per layer", async () => {
    const clock = new TestClock();
    const paced = scheduler(clock);
    let attempts = 0;

    await clock.settle(
      withReadRetry(
        () =>
          paced.run(async () => {
            attempts += 1;
            if (attempts === 1) {
              paced.observe(429, new Headers({ "retry-after": "2" }));
              throw Object.assign(new Error("rate limited"), {
                status: 429,
                headers: new Headers({ "retry-after": "2" }),
              });
            }
            return "ok";
          }),
        { sleep: clock.sleep },
      ),
    );

    expect(attempts).toBe(2);
    expect(clock.now()).toBe(2000);
  });

  it("paces a mutation without changing what a mutation retries", async () => {
    const clock = new TestClock();
    const paced = scheduler(clock);
    const at: number[] = [];

    const overloaded = clock.settle(
      withMutationRetry(
        () =>
          paced.run(async () => {
            at.push(clock.now());
            throw Object.assign(new Error("overloaded"), { status: 529 });
          }),
        { sleep: clock.sleep },
      ),
    );

    await expect(overloaded).rejects.toThrow("overloaded");
    // 529 is never repeated on a write — but the one attempt still went
    // through the scheduler.
    expect(at).toEqual([0]);

    const limited = clock.settle(
      withMutationRetry(
        () =>
          paced.run(async () => {
            at.push(clock.now());
            throw Object.assign(new Error("rate limited"), {
              status: 429,
              headers: new Headers({ "retry-after": "0" }),
            });
          }),
        { sleep: clock.sleep },
      ),
    );

    await expect(limited).rejects.toThrow("rate limited");
    expect(at).toHaveLength(5);
    for (let i = 2; i < at.length; i += 1) {
      expect(at[i] - at[i - 1]).toBeGreaterThanOrEqual(paced.intervalMs);
    }
  });
});

// The scheduler is only worth anything if it is the one the scripts get.
describe("the client the scripts construct", () => {
  const ok = () => ({
    ok: true,
    status: 200,
    headers: new Headers(),
    text: async () => JSON.stringify({ object: "page", id: "page-1" }),
  });

  const limited = () => ({
    ok: false,
    status: 429,
    headers: new Headers({ "retry-after": "4" }),
    text: async () =>
      JSON.stringify({ code: "rate_limited", message: "slow down" }),
  });

  it("paces every request it makes, whatever the caller is doing", async () => {
    const clock = new TestClock();
    const paced = scheduler(clock);
    const at: number[] = [];
    const client = createNotionClient("secret_t", {
      scheduler: paced,
      fetch: async () => {
        at.push(clock.now());
        return ok();
      },
    });

    await clock.settle(
      Promise.all([
        client.pages.retrieve({ page_id: "page-1" }),
        client.pages.retrieve({ page_id: "page-2" }),
        client.pages.retrieve({ page_id: "page-3" }),
      ]),
    );

    expect(at).toHaveLength(3);
    expect(at[1] - at[0]).toBeGreaterThanOrEqual(paced.intervalMs);
    expect(at[2] - at[1]).toBeGreaterThanOrEqual(paced.intervalMs);
  });

  it("reads a 429 off the wire and pauses everything queued behind it", async () => {
    const clock = new TestClock();
    const paced = scheduler(clock);
    const at: number[] = [];
    let first = true;
    const client = createNotionClient("secret_t", {
      scheduler: paced,
      fetch: async () => {
        at.push(clock.now());
        if (first) {
          first = false;
          return limited();
        }
        return ok();
      },
    });

    await clock.settle(
      Promise.all([
        client.pages.retrieve({ page_id: "page-1" }).catch(() => {}),
        client.pages.retrieve({ page_id: "page-2" }),
      ]),
    );

    expect(at[0]).toBe(0);
    expect(at[1]).toBeGreaterThanOrEqual(4000);
  });

  it("still sends each request exactly once, with the SDK's retries off", async () => {
    const clock = new TestClock();
    const paced = scheduler(clock);
    const methods: string[] = [];
    const client = createNotionClient("secret_t", {
      scheduler: paced,
      fetch: async (_url: string, init?: { method?: string }) => {
        methods.push((init?.method ?? "GET").toUpperCase());
        return limited();
      },
    });

    await clock.settle(
      client.pages.update({ page_id: "page-1", properties: {} }).catch(() => {}),
    );

    expect(methods).toEqual(["PATCH"]);
  });

  it("gives every client its own scheduler when it is not handed one", () => {
    const one = createNotionClient("secret_t");
    const two = createNotionClient("secret_t");

    expect(one).not.toBe(two);
  });
});

// A scheduler that cannot wait cannot pace, and a queue nothing will ever
// release is a run that hangs rather than fails.
describe("a scheduler whose own wait fails", () => {
  it("refuses everything queued rather than letting the burst through", async () => {
    const clock = new TestClock();
    const broken = new RequestScheduler({
      now: clock.now,
      sleep: async () => {
        throw new Error("the clock stopped");
      },
      random: () => 0.5,
    });
    const sent: number[] = [];

    const outcomes = await Promise.allSettled(
      Array.from({ length: 4 }, (_, i) =>
        broken.run(async () => {
          sent.push(i);
        }),
      ),
    );

    // The first slot is free; nothing after it could be paced, so nothing
    // after it went out.
    expect(sent).toEqual([0]);
    expect(outcomes.slice(1).map((outcome) => outcome.status)).toEqual([
      "rejected",
      "rejected",
      "rejected",
    ]);
    expect(broken.waiting).toBe(0);
  });
});
