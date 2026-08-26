/**
 * Turning a reader's search box into safe database filters.
 *
 * Search runs against `topics.search_text`, a denormalised column carrying the
 * title, blurb, both choices, the category name and every tag name (see the
 * 20260826120000 migration). It is matched with ILIKE against a pg_trgm index
 * rather than full-text search, because `to_tsvector` cannot segment Thai —
 * Thai is written without spaces between words, so tsvector would treat a
 * whole phrase as one token and match almost nothing.
 */

/**
 * Word-by-word rather than whole-string, so "food thai" finds a debate that
 * says them in the other order. Matches what the browser used to do in
 * matchesText().
 */
const MAX_WORDS = 6;

/**
 * ILIKE treats `%` and `_` as wildcards, and `\` as the escape character. A
 * reader typing any of them means the literal character, so escape all three —
 * otherwise a stray `%` quietly turns their search into a match-anything.
 */
export function escapeLikeLiteral(word: string): string {
  return word.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/**
 * The words a search resolves to, already escaped and capped.
 *
 * Capped because each word becomes its own ILIKE filter on the request, and
 * the number of them should not be the reader's to choose. Empty for a blank
 * search, which the caller reads as "no text filter".
 */
export function searchTerms(query: string | undefined | null): string[] {
  if (!query) return [];
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, MAX_WORDS)
    .map((word) => `%${escapeLikeLiteral(word)}%`);
}

/** The column each feed ordering pages on. */
export type FeedOrderColumn = "trending_score" | "total_votes" | "published_at";

/** One position in a keyset-paginated feed. */
export type FeedCursor = { value: string; id: string };

/**
 * The PostgREST `.or()` filter continuing past a cursor: strictly past it on
 * the sort column, or level with it and past it on id.
 *
 * Every feed ordering is descending, so "past" is `lt` throughout. The id is a
 * tiebreak, not an ordering of its own: two topics can share a trending score
 * or a vote count, and a page boundary landing inside such a tie would skip or
 * repeat a row without it.
 */
export function feedPageFilter(column: FeedOrderColumn, cursor: FeedCursor | null): string | null {
  if (!cursor) return null;
  return `${column}.lt.${cursor.value},and(${column}.eq.${cursor.value},id.lt.${cursor.id})`;
}

/**
 * The cursor for the page after `rows`, or null once the feed is exhausted.
 * A short page is the last one: the query asked for a full page and the
 * database had fewer rows left to give it.
 */
export function nextFeedCursor(
  rows: readonly Record<string, unknown>[],
  column: FeedOrderColumn,
  pageSize: number,
): FeedCursor | null {
  if (rows.length < pageSize) return null;
  const last = rows[rows.length - 1];
  if (!last) return null;
  const value = last[column];
  const id = last["id"];
  // A null sort value cannot seed a `lt` comparison — stop rather than serve a
  // filter that would silently match nothing.
  if (value === null || value === undefined || typeof id !== "string") return null;
  return { value: String(value), id };
}
