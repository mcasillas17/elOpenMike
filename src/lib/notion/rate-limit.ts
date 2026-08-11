import {
  MAX_RETRY_WAIT_MS,
  RATE_LIMIT_STATUS,
  SERVICE_OVERLOADED_STATUS,
  retryAfterHeaderMs,
} from "./retry";

// Notion's rate limit belongs to the integration, and nothing in this repo used
// to be able to say so.
//
// The sync bounds its fan-out at three (pool.ts), which is a bound on
// *concurrency* rather than on a rate: three workers whose requests each come
// back in 40ms is seventy-five requests a second, and the pool is perfectly
// happy about it. The retry wrappers bound what *one call* repeats, which means
// a 429 answered to one worker was invisible to the other two — they carried on
// into the same wall, collected their own 429s, and each waited out its own
// Retry-After while the others kept knocking.
//
// So the limit is enforced where it actually lives: once per client, in front
// of the HTTP layer, so every request the SDK makes goes through it — a query,
// a page retrieve, a children list, a create, an append, a promotion, and every
// retry of any of them, because a retry is a request.
//
// Two things are enforced, and neither can be done from a call site:
//
//   * a rate. Slots are handed out one per interval, in the order they were
//     asked for, so the run's average stays under the limit however many
//     workers there are and however fast Notion answers.
//   * a pause. A 429 or a 529 read off any response stops every queued worker
//     until Retry-After says the integration may talk again — or, when Notion
//     sends no header, until a jittered exponential back-off does.
//
// The waiting is the whole mechanism, so the clock, the sleep and the jitter
// are arguments rather than globals: a test owns all three and proves the
// timing without spending it. See __tests__/fixtures/clock.ts.

// Notion documents "an average of three requests per second" per integration.
export const NOTION_REQUESTS_PER_SECOND = 3;

// What one pause costs when Notion refuses without saying how long to wait.
// Doubled per consecutive refusal, jittered, and capped.
export const RATE_LIMIT_PAUSE_MS = 1_000;

// The same ceiling every wait in this repo is under: long enough to ride out a
// genuine rate limit, short enough that a bogus or hostile Retry-After cannot
// hold a scheduled sync open for hours.
export const MAX_REQUEST_PAUSE_MS = MAX_RETRY_WAIT_MS;

export type RequestSchedulerOptions = {
  requestsPerSecond?: number;
  // The first back-off, doubled per consecutive refusal Notion does not put a
  // Retry-After on.
  pauseMs?: number;
  maxPauseMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  // Where the jitter comes from. Injected so a test can pin a wait to a number
  // rather than to a range.
  random?: () => number;
};

const realSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export class RequestScheduler {
  // How long one slot is worth. Rounded up, so the average is under the limit
  // rather than exactly on it.
  readonly intervalMs: number;

  private readonly pauseMs: number;
  private readonly maxPauseMs: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;

  // Waiting callers, oldest first. A queue rather than a set, because the order
  // requests were asked in is the order a run's pages come back in, and a
  // scheduler that reordered them would make the logs and the diff depend on
  // which promise happened to settle first.
  private readonly queue: Array<{
    release: () => void;
    refuse: (error: unknown) => void;
  }> = [];
  private pumping = false;
  // The earliest moment the next request may leave.
  private readyAt = 0;
  // The moment the whole integration may talk again.
  private resumeAt = 0;
  // How many refusals in a row Notion has answered without a Retry-After.
  private refusals = 0;

  constructor({
    requestsPerSecond = NOTION_REQUESTS_PER_SECOND,
    pauseMs = RATE_LIMIT_PAUSE_MS,
    maxPauseMs = MAX_REQUEST_PAUSE_MS,
    // Read through a call rather than captured: `Date.now` is a property of a
    // global a test is entitled to replace, and a scheduler holding the
    // original would keep its own clock while everything around it moved.
    now = () => Date.now(),
    sleep = realSleep,
    random = Math.random,
  }: RequestSchedulerOptions = {}) {
    if (!Number.isFinite(requestsPerSecond) || requestsPerSecond <= 0) {
      throw new RangeError(
        `requests per second must be a positive number (got ${requestsPerSecond})`,
      );
    }
    this.intervalMs = Math.ceil(1000 / requestsPerSecond);
    this.pauseMs = pauseMs;
    this.maxPauseMs = maxPauseMs;
    this.now = now;
    this.sleep = sleep;
    this.random = random;
  }

  // How many callers are waiting for a slot. Zero once a run is over: the pump
  // only ever sleeps while something is queued, so nothing is left holding a
  // timer after the last request goes out.
  get waiting(): number {
    return this.queue.length;
  }

  // How long the current pause has left to run, from now. Zero when the
  // integration is free to talk.
  get pausedFor(): number {
    return Math.max(this.resumeAt - this.now(), 0);
  }

  // Runs `operation` in a slot of its own. The slot is spent whether the
  // operation succeeds or fails, because either way the request went out.
  async run<T>(operation: () => Promise<T>): Promise<T> {
    await this.slot();
    return operation();
  }

  // What a response says about whether the integration may keep talking. Called
  // for every response, so a run that is being answered normally does not carry
  // an escalating back-off from ten minutes ago.
  observe(status: number, headers?: unknown): void {
    if (status !== RATE_LIMIT_STATUS && status !== SERVICE_OVERLOADED_STATUS) {
      this.refusals = 0;
      return;
    }

    const told = retryAfterHeaderMs(headers);
    // Notion said how long: that is the answer, and the back-off is left where
    // it is — a run of refusals the server is pacing itself is not a run this
    // side needs to escalate against.
    this.pauseFor(told ?? this.backoff());
  }

  // Holds every queued request until `ms` from now. The longest pause wins: two
  // workers refused at once are two answers about one integration, and the
  // later, shorter one does not undo the earlier, longer one.
  pauseFor(ms: number): void {
    const bounded = Math.min(Math.max(ms, 0), this.maxPauseMs);
    this.resumeAt = Math.max(this.resumeAt, this.now() + bounded);
  }

  private backoff(): number {
    this.refusals += 1;
    const ceiling = Math.min(
      this.pauseMs * 2 ** (this.refusals - 1),
      this.maxPauseMs,
    );
    // Half the ceiling, plus up to half again: enough spread that two workers
    // released together do not come back together, without ever waiting less
    // than a token amount or more than the ceiling.
    return Math.round(ceiling / 2 + this.random() * (ceiling / 2));
  }

  private slot(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.queue.push({ release: resolve, refuse: reject });
      void this.pump();
    });
  }

  // One pump per scheduler, so the interval is a property of the client rather
  // than of whoever happened to call first.
  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (this.queue.length > 0) {
        const now = this.now();
        const wait = Math.max(this.readyAt - now, this.resumeAt - now, 0);
        if (wait > 0) {
          await this.sleep(wait);
          // Re-read both: a worker already in flight can have been refused
          // while this was asleep, and that pause is the one that now applies.
          continue;
        }
        const next = this.queue.shift();
        // Measured from the moment the wait was found to be over, which is the
        // moment this request goes out. Reading the clock a second time here
        // would say the same thing and put a step between taking a waiter off
        // the queue and releasing it.
        this.readyAt = now + this.intervalMs;
        next?.release();
      }
    } catch (error: unknown) {
      // The wait itself failed, which is the one thing this cannot recover
      // from: a scheduler that cannot wait cannot pace, and releasing the queue
      // anyway would send the burst it exists to prevent. Everything waiting is
      // refused with the reason, rather than left holding a promise that will
      // never settle.
      for (const waiter of this.queue.splice(0)) waiter.refuse(error);
    } finally {
      this.pumping = false;
    }
  }
}
