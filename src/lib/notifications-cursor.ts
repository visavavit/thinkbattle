/**
 * Keyset pagination cursor for the full notifications feed (the
 * "/notifications" page — the bell dropdown itself just shows a fixed recent
 * window, see useNotifications.tsx).
 *
 * Ordered `created_at desc, id desc`, same tiebreak reasoning as
 * comments-cursor.ts: the synthetic-audience worker backdates a reaction's or
 * reply's `created_at` to its planned `run_at`, so two notifications can share
 * an instant. Without the id tiebreak a page boundary inside that tie can skip
 * or repeat a row.
 */
export type NotificationsCursor = { createdAt: string; id: string };

/**
 * The PostgREST `.or()` filter that continues past a cursor. Mirrors
 * `commentsPageFilter` — see comments-cursor.ts for why `createdAt` must be
 * passed through verbatim rather than re-serialised through `Date`.
 */
export function notificationsPageFilter(cursor: NotificationsCursor | null): string | null {
  if (!cursor) return null;
  return `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`;
}

/**
 * The cursor for the page after `rows` (already the current page, sorted
 * created_at desc then id desc), or null once there is nothing more to fetch.
 */
export function nextNotificationsCursor(
  rows: readonly { created_at: string; id: string }[],
  pageSize: number,
): NotificationsCursor | null {
  if (rows.length < pageSize) return null;
  const last = rows[rows.length - 1];
  if (!last) return null;
  return { createdAt: last.created_at, id: last.id };
}
