/**
 * Process-local read-through cache for the anonymous public feed.
 *
 * The feed is identical for every signed-out visitor, so without this every
 * page view runs the same handful of queries against Postgres. Under a traffic
 * spike that is the first thing to fall over, well before hosting or bandwidth
 * become a concern.
 *
 * Three properties matter here, and all three are load-bearing:
 *
 *   - **TTL** collapses a burst of identical requests into one query.
 *   - **stale-while-revalidate** means an expiring entry never makes a reader
 *     wait: the stale value is served immediately and the refresh happens
 *     behind it. A slow database shows up as slightly older vote counts rather
 *     than a slow page.
 *   - **single-flight** is what actually protects the database. Without it,
 *     every request arriving during the refresh window starts its own query;
 *     at a few hundred requests per second an expiring key is a stampede.
 *
 * This lives in module scope, so each server instance keeps its own copy and
 * the cache is dropped on redeploy. That is intentional — it needs no external
 * store, and correctness never depends on a hit. A CDN in front of the app
 * (see the Cache-Control headers on these responses) absorbs the bulk of the
 * traffic; this is the second line of defence for whatever reaches the origin.
 */

export type CachePolicy = {
  /** How long a value is served without any refetch. */
  ttlMs: number;
  /** How long past the TTL a stale value may be served while refreshing. */
  staleMs: number;
};

/** Feed and topic reads: 30s fresh, then up to 5min stale while revalidating. */
export const PUBLIC_READ: CachePolicy = { ttlMs: 30_000, staleMs: 300_000 };

/**
 * Vote tallies polled by open topic pages. Short TTL so the numbers still move,
 * but the database cost is one query per topic per window no matter how many
 * readers have the page open — which is the whole point of polling a cached
 * endpoint rather than giving every reader a live subscription.
 */
export const COUNTS_READ: CachePolicy = { ttlMs: 10_000, staleMs: 60_000 };

/** Categories and tags change rarely and are tiny — hold them much longer. */
export const TAXONOMY_READ: CachePolicy = { ttlMs: 300_000, staleMs: 900_000 };

/**
 * The matching header for a CDN sitting in front of the app.
 *
 * `max-age=0, must-revalidate` keeps the value out of private browser caches —
 * a reader who votes should see their own page update on the next navigation —
 * while `s-maxage` lets shared caches serve it from the edge.
 */
export function publicCacheControl(policy: CachePolicy): string {
  const sMaxAge = Math.floor(policy.ttlMs / 1000);
  const swr = Math.floor(policy.staleMs / 1000);
  return `public, max-age=0, must-revalidate, s-maxage=${sMaxAge}, stale-while-revalidate=${swr}`;
}

type Entry<T> = { value: T; freshUntil: number; staleUntil: number };

/**
 * Bounded so that per-topic keys cannot grow without limit: a site with tens of
 * thousands of topics would otherwise pin every one it has ever served.
 */
const MAX_ENTRIES = 500;

const store = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export async function cached<T>(
  key: string,
  policy: CachePolicy,
  load: () => Promise<T>,
): Promise<T> {
  const hit = store.get(key) as Entry<T> | undefined;
  const now = Date.now();

  if (hit && now < hit.freshUntil) return hit.value;

  if (hit && now < hit.staleUntil) {
    // Serve what we have and refresh behind it. A failed refresh keeps the
    // stale value in place until staleUntil rather than surfacing the error.
    void revalidate(key, policy, load).catch(() => {});
    return hit.value;
  }

  return revalidate(key, policy, load);
}

function revalidate<T>(key: string, policy: CachePolicy, load: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const pending = load()
    .then((value) => {
      const at = Date.now();
      // Re-insert rather than overwrite so Map iteration order tracks recency.
      store.delete(key);
      store.set(key, {
        value,
        freshUntil: at + policy.ttlMs,
        staleUntil: at + policy.ttlMs + policy.staleMs,
      });
      evictOverflow();
      return value;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, pending);
  return pending;
}

function evictOverflow() {
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next();
    if (oldest.done) return;
    store.delete(oldest.value);
  }
}

/** Drops cached reads after a write so curators see their own edits at once. */
export function invalidatePublicReads() {
  store.clear();
}
