/**
 * Keyset pagination cursor for the top-level comment feed.
 *
 * Ordered `created_at desc, id desc`. `id` is a pure tiebreak — a comment's
 * UUID carries no meaning as an order — needed because two comments can
 * share a `created_at`: the synthetic-audience worker backdates a comment's
 * `created_at` to its planned `run_at` (see bots.worker.server.ts), and nothing
 * stops two planned actions from landing on the same instant. Without a
 * tiebreak, a page boundary that falls in the middle of a tie can skip or
 * repeat a row.
 */
export type CommentsCursor = { createdAt: string; id: string };

/**
 * The PostgREST `.or()` filter that continues past a cursor: everything
 * strictly older than the cursor, or exactly as old but with a strictly
 * smaller id (Postgres compares `uuid` by its raw bytes, so this reproduces
 * whatever total order `order by created_at desc, id desc` already produced).
 * Returns null for the first page, where there is nothing to filter past.
 *
 * `createdAt` must be the raw string PostgREST returned, passed through
 * verbatim. Do NOT re-serialise it through `Date` on the way in: Postgres
 * `timestamptz` keeps microseconds and `toISOString()` truncates to
 * milliseconds, so a rounded cursor silently skips every row inside the
 * truncated interval. The `+00:00` offset in that raw string is safe here —
 * supabase-js percent-encodes the `+` as `%2B` when it builds the query
 * string, so it never decodes back to a space.
 */
export function commentsPageFilter(cursor: CommentsCursor | null): string | null {
  if (!cursor) return null;
  return `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`;
}

/**
 * The cursor for the page after `topRows` (already the current page, sorted
 * created_at desc then id desc), or null once there is nothing more to fetch.
 *
 * A page shorter than `pageSize` is the last one — the query asked for a full
 * page and Postgres had fewer rows left to give it.
 */
export function nextCommentsCursor(
  topRows: readonly { created_at: string; id: string }[],
  pageSize: number,
): CommentsCursor | null {
  if (topRows.length < pageSize) return null;
  const last = topRows[topRows.length - 1];
  if (!last) return null;
  return { createdAt: last.created_at, id: last.id };
}
