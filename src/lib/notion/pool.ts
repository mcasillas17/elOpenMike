// Notion allows roughly 3 requests/second per integration. Fanning every page
// out with Promise.all opens as many concurrent walks as there are posts and
// relies on 429 retries to survive the burst — which costs a Retry-After wait
// per rejected request and grows worse with every post published. A fixed pool
// keeps the request rate flat instead.
export const MAX_CONCURRENT_REQUESTS = 3;

// Runs `worker` over every item with at most `limit` in flight, preserving
// input order in the results. The first rejection is propagated and no further
// items are started, so a failed run doesn't keep hammering the API.
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  worker: (item: T, index: number) => Promise<R>,
  limit: number = MAX_CONCURRENT_REQUESTS,
): Promise<R[]> {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError(`concurrency limit must be a positive integer (got ${limit})`);
  }

  const results = new Array<R>(items.length);
  let next = 0;
  let failed = false;

  const run = async (): Promise<void> => {
    while (!failed) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      try {
        results[index] = await worker(items[index], index);
      } catch (error: unknown) {
        failed = true;
        throw error;
      }
    }
  };

  // Promise.all attaches a handler to every runner, so a second failure is
  // observed rather than surfacing as an unhandled rejection.
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => run()),
  );
  return results;
}
