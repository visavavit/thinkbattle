/**
 * A device's own guest votes, mirrored in localStorage.
 *
 * This is a display hint, never the truth. The database is the record: the
 * unique index on (topic_id, guest_id) means a guest who clears this and
 * re-votes the same side just writes the same row again, and one who votes the
 * other side gets the correct A+1/B-1 delta back from the server.
 *
 * It exists so that reading a topic page costs a guest zero extra requests.
 * The alternative — asking the server "have I voted here?" on mount — would put
 * an uncacheable round trip on every anonymous page view, which is the exact
 * cost the whole caching design in public.functions.ts exists to avoid.
 */

export type GuestSide = "a" | "b";
export type GuestVotes = Record<string, GuestSide>;

const STORAGE_KEY = "toktiang.guestVotes";

/**
 * Bounded so a long-lived device cannot grow this without limit. Objects keep
 * string-key insertion order, so dropping from the front drops the least
 * recently voted.
 */
const MAX_TOPICS = 100;

function isSide(value: unknown): value is GuestSide {
  return value === "a" || value === "b";
}

/** Parse stored JSON, discarding anything that is not a topic-to-side map. */
export function parseGuestVotes(raw: string | null | undefined): GuestVotes {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const out: GuestVotes = {};
  for (const [topicId, side] of Object.entries(parsed as Record<string, unknown>)) {
    if (isSide(side)) out[topicId] = side;
  }
  return out;
}

/** Record a vote, re-inserting so the topic counts as most recent, and trim. */
export function withGuestVote(votes: GuestVotes, topicId: string, side: GuestSide): GuestVotes {
  const next: GuestVotes = {};
  for (const [id, value] of Object.entries(votes)) {
    if (id !== topicId) next[id] = value;
  }
  next[topicId] = side;

  const ids = Object.keys(next);
  if (ids.length <= MAX_TOPICS) return next;
  const trimmed: GuestVotes = {};
  for (const id of ids.slice(ids.length - MAX_TOPICS)) trimmed[id] = next[id]!;
  return trimmed;
}

/** Drop specific topics — used once a guest signs in and their votes are claimed. */
export function withoutGuestVotes(votes: GuestVotes, topicIds: readonly string[]): GuestVotes {
  const drop = new Set(topicIds);
  const next: GuestVotes = {};
  for (const [id, value] of Object.entries(votes)) {
    if (!drop.has(id)) next[id] = value;
  }
  return next;
}

// Every access is wrapped: a private window, disabled site data, or a full
// quota all throw rather than return empty, and none of them should be able to
// stop someone reading a debate.
function read(): GuestVotes {
  if (typeof window === "undefined") return {};
  try {
    return parseGuestVotes(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return {};
  }
}

function write(votes: GuestVotes): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(votes));
  } catch {
    /* the vote is already recorded server-side; this is only the mirror */
  }
}

/** This device's recorded side for one topic, if any. */
export function readGuestVote(topicId: string): GuestSide | null {
  return read()[topicId] ?? null;
}

/** Every topic this device has a recorded vote on. */
export function readGuestVoteTopics(): string[] {
  return Object.keys(read());
}

export function saveGuestVote(topicId: string, side: GuestSide): void {
  write(withGuestVote(read(), topicId, side));
}

export function forgetGuestVotes(topicIds: readonly string[]): void {
  write(withoutGuestVotes(read(), topicIds));
}
