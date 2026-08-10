// Notion's SDK sets an error's `headers` from the fetch Response, so it is a
// `Headers` instance rather than a plain object. Index access on Headers always
// yields undefined, which silently defeats any Retry-After handling — read it
// through get() when that exists, and fall back to a case-insensitive scan.
export function readHeader(
  headers: unknown,
  name: string,
): string | undefined {
  if (typeof headers !== "object" || headers === null) return undefined;

  const get = (headers as { get?: unknown }).get;
  if (typeof get === "function") {
    const value = (get as (key: string) => unknown).call(headers, name);
    return typeof value === "string" ? value : undefined;
  }

  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted && typeof value === "string") return value;
  }
  return undefined;
}

// Never wait longer than this for one retry, so a bogus or hostile Retry-After
// can't hold a scheduled sync open for hours.
export const MAX_RETRY_WAIT_MS = 60_000;

export function retryAfterMs(headers: unknown, attempt: number): number {
  const seconds = Number(readHeader(headers, "retry-after"));
  const wait =
    Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : attempt * 1000;
  return Math.min(wait, MAX_RETRY_WAIT_MS);
}
