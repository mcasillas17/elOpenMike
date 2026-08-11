// A clock a test owns outright: nothing here waits on the real one.
//
// The rate limiter is made of waiting — a third of a second between requests, a
// minute of back-off after a 429 — and a test that proved any of it against
// `setTimeout` would either take that long or prove nothing. So the scheduler
// takes its `now`, its `sleep` and its `random` as arguments, and this is what
// a test hands it: a clock that only ever moves when everything that could run
// has run, and moves exactly to the next thing waiting on it.
export class TestClock {
  private time = 0;
  private waiters: Array<{ at: number; wake: () => void; seq: number }> = [];
  private seq = 0;

  readonly now = (): number => this.time;

  readonly sleep = (ms: number): Promise<void> =>
    new Promise<void>((resolve) => {
      this.seq += 1;
      this.waiters.push({ at: this.time + Math.max(ms, 0), wake: resolve, seq: this.seq });
    });

  get pending(): number {
    return this.waiters.length;
  }

  // Runs `work` to completion. Between steps every microtask and every already
  // resolved promise is allowed to settle; only when nothing at all can proceed
  // does the clock jump — and then to the earliest deadline anything is waiting
  // on, never past it.
  async settle<T>(work: Promise<T>): Promise<T> {
    let finished = false;
    const outcome = work.then(
      (value) => {
        finished = true;
        return () => value;
      },
      (error: unknown) => {
        finished = true;
        return () => {
          throw error;
        };
      },
    );

    for (;;) {
      await drainMicrotasks();
      if (finished || this.waiters.length === 0) break;

      const earliest = Math.min(...this.waiters.map((waiter) => waiter.at));
      this.time = Math.max(this.time, earliest);
      const due = this.waiters
        .filter((waiter) => waiter.at <= this.time)
        .sort((a, b) => a.seq - b.seq);
      this.waiters = this.waiters.filter((waiter) => waiter.at > this.time);
      for (const waiter of due) waiter.wake();
    }

    return (await outcome)();
  }
}

// Real macrotasks, so a chain of promises has somewhere to finish. A handful of
// turns is enough for the depth anything here reaches, and each one is a `0`
// timeout rather than a wait.
async function drainMicrotasks(): Promise<void> {
  for (let turn = 0; turn < 8; turn += 1) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}
