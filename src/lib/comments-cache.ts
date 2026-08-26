import type { InfiniteData } from "@tanstack/react-query";

/**
 * Patch operations for a paged comment cache.
 *
 * The realtime channel delivers one row at a time and the cache is a list of
 * pages, so every write has to find the page a row already lives on rather
 * than assuming the first one. Kept here, generic over the row and page types,
 * so the page-walking is testable without dragging the whole discussion
 * component (and a Supabase client) into a test.
 */

type MinimalRow = { id: string };
type MinimalPage<R> = { rows: R[] };

/**
 * Replace a row wherever it already is, or add it to the newest page.
 *
 * An existing row must be replaced *in place*: moving it to the top would
 * make an edit or a reaction count reorder the thread under the reader.
 * A genuinely new row belongs on page 0, which is the newest end of a feed
 * ordered `created_at desc`.
 */
export function upsertRow<R extends MinimalRow, P extends MinimalPage<R>, C>(
  cache: InfiniteData<P, C>,
  row: R,
): InfiniteData<P, C> {
  for (let i = 0; i < cache.pages.length; i++) {
    const page = cache.pages[i];
    if (!page) continue;
    const index = page.rows.findIndex((r) => r.id === row.id);
    if (index === -1) continue;
    const rows = [...page.rows];
    rows[index] = row;
    const pages = [...cache.pages];
    // Spreading a generic widens to an intersection; the shape is unchanged.
    pages[i] = { ...page, rows } as P;
    return { ...cache, pages };
  }

  const first = cache.pages[0];
  // No pages at all means nothing has loaded yet — the fetch that is already
  // in flight will bring this row with it.
  if (!first) return cache;
  const pages = [...cache.pages];
  pages[0] = { ...first, rows: [row, ...first.rows] } as P;
  return { ...cache, pages };
}

/** Drop a row from whichever page holds it. */
export function removeRow<R extends MinimalRow, P extends MinimalPage<R>, C>(
  cache: InfiniteData<P, C>,
  id: string,
): InfiniteData<P, C> {
  let changed = false;
  const pages = cache.pages.map((page) => {
    if (!page.rows.some((r) => r.id === id)) return page;
    changed = true;
    return { ...page, rows: page.rows.filter((r) => r.id !== id) } as P;
  });
  // Returning the same object when nothing matched keeps React Query from
  // treating a no-op delete as a state change.
  return changed ? { ...cache, pages } : cache;
}

/** True when any page already holds this key — used to skip redundant lookups. */
export function pagesHave<P, C>(
  cache: InfiniteData<P, C> | undefined,
  has: (page: P) => boolean,
): boolean {
  return (cache?.pages ?? []).some(has);
}
