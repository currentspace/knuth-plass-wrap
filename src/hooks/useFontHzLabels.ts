import { use } from "react";

const cache = new Map<string, Promise<Map<number, string>>>();

function fetchHzLabels(
  loadFn: (idx: number) => Promise<{ wdthRange: { min: number; max: number } | null }>,
  count: number,
): Promise<Map<number, string>> {
  const key = String(count);
  let p = cache.get(key);
  if (p) return p;
  p = Promise.allSettled(
    Array.from({ length: count }, (_, i) =>
      loadFn(i).then((r) => [i, r.wdthRange] as const),
    ),
  ).then((results) => {
    const m = new Map<number, string>();
    for (const r of results) {
      if (r.status === "fulfilled") {
        const [idx, range] = r.value;
        if (range) m.set(idx, ` · Hz ${range.min}\u2013${range.max}`);
      }
    }
    return m;
  });
  cache.set(key, p);
  return p;
}

/**
 * Eagerly resolves wdth-range data for every font and returns a map
 * from font index to a short suffix string like " · Hz 87–113".
 * Suspends until the promises settle.
 */
export function useFontHzLabels(
  loadFn: (idx: number) => Promise<{ wdthRange: { min: number; max: number } | null }>,
  count: number,
): Map<number, string> {
  return use(fetchHzLabels(loadFn, count));
}
