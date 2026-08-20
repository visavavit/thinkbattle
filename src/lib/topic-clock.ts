/**
 * Everything the UI needs to know about a topic's deadline.
 *
 * A topic with `closes_at` null runs indefinitely. Otherwise the deadline is
 * compared against the reader's own clock rather than a flag computed on the
 * server: feed and topic reads are cached for up to five minutes, so a stored
 * `is_closed` would leave a debate accepting votes after it had expired — and
 * the database guard would then reject them. The guard stays the authority;
 * this is what keeps the page from offering an action it knows is over.
 */

import { useEffect, useState } from "react";

/** Within this window the page counts down instead of showing a plain date. */
const SOON_MS = 48 * 60 * 60 * 1000;

export type TopicClock = {
  /** null when the topic never expires. */
  closesAt: Date | null;
  /** past its deadline: results only, no voting, comments or reactions. */
  isClosed: boolean;
  /** still open, but inside the countdown window. */
  isClosingSoon: boolean;
  /** milliseconds left, or null when there is no deadline. */
  msLeft: number | null;
  /** false until the browser has taken over; see useTopicClock. */
  mounted: boolean;
};

const NEVER: TopicClock = {
  closesAt: null,
  isClosed: false,
  isClosingSoon: false,
  msLeft: null,
  mounted: true,
};

export function readClock(closesAt: string | null | undefined, now = Date.now()): TopicClock {
  if (!closesAt) return NEVER;
  const date = new Date(closesAt);
  // an unparseable value must not silently close a live debate
  if (Number.isNaN(date.getTime())) return NEVER;
  const msLeft = date.getTime() - now;
  return {
    closesAt: date,
    isClosed: msLeft <= 0,
    isClosingSoon: msLeft > 0 && msLeft <= SOON_MS,
    msLeft,
    mounted: true,
  };
}

/**
 * How often a countdown should tick to stay honest without re-rendering the
 * page every second for a deadline that is days away.
 */
export function tickInterval(msLeft: number | null): number | null {
  if (msLeft === null || msLeft <= 0) return null;
  if (msLeft <= 60_000) return 1_000;
  if (msLeft <= 60 * 60_000) return 30_000;
  return 60_000;
}

export type Countdown =
  { unit: "days" | "hours" | "minutes" | "seconds"; n: number } | { unit: "over"; n: 0 };

/** Breaks the remaining time into the single largest unit worth showing. */
export function countdown(msLeft: number | null): Countdown | null {
  if (msLeft === null) return null;
  if (msLeft <= 0) return { unit: "over", n: 0 };
  const seconds = Math.ceil(msLeft / 1000);
  if (seconds < 60) return { unit: "seconds", n: seconds };
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return { unit: "minutes", n: minutes };
  const hours = Math.ceil(minutes / 60);
  if (hours < 24) return { unit: "hours", n: hours };
  return { unit: "days", n: Math.ceil(hours / 24) };
}

/**
 * Live view of a topic's deadline. Re-renders as the countdown moves, and
 * — the point of it — flips `isClosed` on its own the moment the deadline
 * passes, so a reader sitting on an open page watches the debate close rather
 * than finding out by having a vote rejected.
 *
 * `mounted` is false through SSR and the hydrating render. The open/closed
 * booleans are safe either side of that line — server and browser clocks agree
 * on which side of a deadline they are on, bar the second it lands — but the
 * rendered countdown and the formatted date are not: they differ by the clock
 * skew and by the time zone. Anything that prints a time waits for `mounted`.
 */
export function useTopicClock(closesAt: string | null | undefined): TopicClock {
  const [now, setNow] = useState<number | null>(null);

  const clock = readClock(closesAt, now ?? Date.now());

  useEffect(() => {
    setNow(Date.now());
  }, [closesAt]);

  useEffect(() => {
    const every = tickInterval(clock.msLeft);
    if (every === null) return;
    // never sleep past the deadline itself: the tick that lands on it has to
    // be the one that reports the debate closed
    const wait = Math.max(0, Math.min(every, clock.msLeft! + 1));
    const timer = setTimeout(() => setNow(Date.now()), wait);
    return () => clearTimeout(timer);
  }, [clock.msLeft]);

  return { ...clock, mounted: now !== null };
}
