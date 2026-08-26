import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, setResponseHeader } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { cached, publicCacheControl, COUNTS_READ, PUBLIC_READ, TAXONOMY_READ } from "./cache";
import {
  feedPageFilter,
  nextFeedCursor,
  parseFeedCursor,
  searchTerms,
  type FeedCursor,
  type FeedOrderColumn,
} from "./feed-search";

export type TopicCard = {
  id: string;
  title: string;
  description: string | null;
  choice_a: string;
  choice_b: string;
  votes_a: number;
  votes_b: number;
  total_votes: number;
  pct_a: number;
  tags: string[];
  category_name: string | null;
  category_slug: string | null;
  category_emoji: string | null;
  cover_image_url: string | null;
  comments_count: number;
  is_featured: boolean;
  /** deadline for voting and comments; null when the topic never expires */
  closes_at: string | null;
  created_at: string;
  published_at: string | null;
};

/**
 * Anonymous read client.
 *
 * `edgeTtlSeconds` puts the REST GET in the colo's shared cache. The in-process
 * cache only helps a warm isolate, and low-traffic isolates are recycled
 * constantly — so a cold request otherwise pays a fresh TLS handshake to the
 * database region, which is where the occasional ~1s first byte came from.
 * The colo cache is shared across isolates, so that cost is paid once per TTL
 * per location instead of once per cold start.
 */
function publicClient(edgeTtlSeconds = 0) {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const url = process.env["SUPABASE_URL"]!;
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
          h.delete("Authorization");
        }
        h.set("apikey", key);
        const method = (init?.method ?? "GET").toUpperCase();
        const cacheable = edgeTtlSeconds > 0 && method === "GET";
        return fetch(input, {
          ...init,
          headers: h,
          ...(cacheable ? { cf: { cacheTtl: edgeTtlSeconds, cacheEverything: true } } : {}),
        } as RequestInit);
      },
    },
  });
}

export type FeedTab = "trending" | "neck" | "top" | "newest";

/**
 * Which database ordering backs a tab. "Neck-and-Neck" is the trending query
 * narrowed in JS, so the two tabs share one cache entry and one query.
 */
type FeedOrder = "trending" | "top" | "newest";

function feedOrder(tab: FeedTab): FeedOrder {
  return tab === "neck" ? "trending" : tab;
}

/** Which column each ordering sorts and pages on. */
const ORDER_COLUMN: Record<FeedOrder, FeedOrderColumn> = {
  trending: "trending_score",
  top: "total_votes",
  newest: "published_at",
};

/** The home feed shows one generous page and never pages. */
const FEED_LIMIT = 60;

/** Browse pages, so it takes a grid-friendly bite at a time. */
export const BROWSE_PAGE_SIZE = 24;

export type FeedPage = { rows: TopicCard[]; next: FeedCursor | null };

type FeedArgs = {
  order: FeedOrder;
  category?: string | undefined;
  terms: string[];
  cursor: FeedCursor | null;
  limit: number;
};

async function fetchFeedPage({
  order,
  category,
  terms,
  cursor,
  limit,
}: FeedArgs): Promise<FeedPage> {
  const supabase = publicClient(30);
  const column = ORDER_COLUMN[order];

  let query = supabase.from("topic_cards").select("*").eq("status", "published");

  if (category) query = query.eq("category_slug", category);

  // Every word has to land somewhere in search_text — chained filters AND
  // together, which is the same "all words match" rule the browser applied.
  for (const term of terms) query = query.ilike("search_text", term);

  const filter = feedPageFilter(column, cursor);
  if (filter) query = query.or(filter);

  const { data, error } = await query
    .order(column, { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as TopicCard[];
  return { rows, next: nextFeedCursor(rows, column, limit) };
}

export const getFeed = createServerFn({ method: "GET" })
  .inputValidator(
    (input: {
      tab?: FeedTab | undefined;
      category?: string | undefined;
      q?: string | undefined;
      cursor?: FeedCursor | null | undefined;
      limit?: number | undefined;
    }) => input ?? {},
  )
  .handler(async ({ data }): Promise<FeedPage> => {
    const tab = data.tab ?? "trending";
    const order = feedOrder(tab);
    const terms = searchTerms(data.q);
    // The client echoes the cursor back, so it is untrusted even though the
    // server issued it; anything not shaped like a value we minted is dropped
    // rather than spliced into a filter string.
    const cursor = parseFeedCursor(data.cursor);
    // Two allowed page sizes, not a number the caller picks: this is a public
    // endpoint, and an arbitrary limit is an invitation to ask for all of it.
    const limit = data.limit === BROWSE_PAGE_SIZE ? BROWSE_PAGE_SIZE : FEED_LIMIT;

    const args: FeedArgs = { order, category: data.category, terms, cursor, limit };

    // A search term is reader-supplied and unbounded, so caching per term
    // would let anyone mint cache entries until the 500-entry store evicted
    // the genuinely hot feed keys. Searches and deeper pages go straight to
    // the database; the shared first page — which is the bulk of the traffic
    // — keeps both cache layers.
    if (terms.length > 0 || cursor) {
      setResponseHeader("cache-control", "public, max-age=0, must-revalidate");
      return fetchFeedPage(args);
    }

    setResponseHeader("cache-control", publicCacheControl(PUBLIC_READ));

    // Only the query is cached. Neck-and-neck narrowing runs per call against
    // the cached rows — it is pure array work, and keeping it outside means
    // both tabs that share an ordering also share one database read.
    const page = await cached(`feed:${order}:${data.category ?? "all"}:${limit}`, PUBLIC_READ, () =>
      fetchFeedPage(args),
    );

    if (tab !== "neck") return page;
    return {
      rows: page.rows
        .filter((t) => t.total_votes > 0 && t.pct_a >= 45 && t.pct_a <= 55)
        .sort((a, b) => Math.abs(50 - a.pct_a) - Math.abs(50 - b.pct_a)),
      // Neck-and-neck narrows one page in JS, so there is no honest cursor to
      // continue from — it is a home-feed tab, and the home feed never pages.
      next: null,
    };
  });

/**
 * The hero invites a vote, so an expired debate has no business there. Applied
 * to admin pins too: a pin outranks the automatic pick, not the deadline.
 *
 * Filtered here rather than in SQL because these rows are cached for minutes
 * at a time — a topic that expires mid-window has to drop out on read.
 */
function stillOpen(topic: TopicCard): boolean {
  return !topic.closes_at || new Date(topic.closes_at).getTime() > Date.now();
}

async function fetchHeadliners(): Promise<TopicCard[]> {
  const supabase = publicClient(30);

  // admin pins always win; otherwise fall back to the closest fight
  const { data: pinned } = await supabase
    .from("topic_cards")
    .select("*")
    .eq("status", "published")
    .eq("is_featured", true)
    .order("total_votes", { ascending: false })
    .limit(8);
  const openPins = ((pinned ?? []) as unknown as TopicCard[]).filter(stillOpen);
  if (openPins.length > 0) return openPins;

  const { data, error } = await supabase
    .from("topic_cards")
    .select("*")
    .eq("status", "published")
    .order("total_votes", { ascending: false })
    .limit(30);
  if (error) throw new Error(error.message);
  const topics = ((data ?? []) as unknown as TopicCard[]).filter(stillOpen);
  if (topics.length === 0) return [];
  const closest = [...topics].sort(
    (a, b) => Math.abs(50 - a.pct_a) - Math.abs(50 - b.pct_a) || b.total_votes - a.total_votes,
  );
  return closest.slice(0, 1);
}

export const getHeadliners = createServerFn({ method: "GET" }).handler(async () => {
  setResponseHeader("cache-control", publicCacheControl(PUBLIC_READ));
  return cached("headliners", PUBLIC_READ, fetchHeadliners);
});

/** Feature switches every visitor sees the same answer to. */
export type SiteFlags = { guest_voting: boolean };

const FLAGS_OFF: SiteFlags = { guest_voting: false };

async function fetchSiteFlags(): Promise<SiteFlags> {
  const supabase = publicClient(30);
  // site_flags() is a definer function that enumerates the public keys in
  // code. app_settings itself stays unreadable — it holds bot_tick_secret,
  // and a read policy broad enough to expose a flag is one mistake away from
  // exposing that.
  const { data, error } = await supabase.rpc("site_flags");
  if (error) throw new Error(error.message);
  const flags = data as unknown as Partial<SiteFlags> | null;
  return { guest_voting: flags?.guest_voting === true };
}

/**
 * The flag is global and identical for everyone, so it is safe to bake into
 * the shared document — which is the point: the browser makes no extra request
 * for it. The cost is that a toggle takes up to the process TTL plus the
 * document cache to propagate, about a minute. The admin panel says so, and
 * cast_guest_vote re-checks server-side so a stale page cannot act on it.
 */
export const getSiteFlags = createServerFn({ method: "GET" }).handler(async () => {
  setResponseHeader("cache-control", publicCacheControl(PUBLIC_READ));
  try {
    return await cached("site-flags", PUBLIC_READ, fetchSiteFlags);
  } catch {
    // A feature switch is not worth failing a page render over, and off is
    // the safe direction to fail in.
    return FLAGS_OFF;
  }
});

async function fetchTopic(id: string): Promise<TopicCard | null> {
  const supabase = publicClient(30);
  const { data: row, error } = await supabase
    .from("topic_cards")
    .select("*")
    .eq("id", id)
    .eq("status", "published")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (row as unknown as TopicCard | null) ?? null;
}

export const getTopic = createServerFn({ method: "GET" })
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    setResponseHeader("cache-control", publicCacheControl(PUBLIC_READ));
    return cached(`topic:${data.id}`, PUBLIC_READ, () => fetchTopic(data.id));
  });

export type TopicCounts = { votes_a: number; votes_b: number };

async function fetchTopicCounts(id: string, edgeTtlSeconds = 0): Promise<TopicCounts> {
  const supabase = publicClient(edgeTtlSeconds);
  const { data, error } = await supabase
    .from("topics")
    .select("votes_a, votes_b")
    .eq("id", id)
    .eq("status", "published")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return { votes_a: data?.votes_a ?? 0, votes_b: data?.votes_b ?? 0 };
}

/**
 * Just the tallies, for topic pages to poll. Deliberately narrow: this is the
 * one read that open pages repeat, so it stays a two-column lookup rather than
 * a full card.
 *
 * A signed-in reader skips every cache layer. The document itself is shared
 * (CDN `s-maxage` plus this process's own copy), so after a refresh the markup
 * can still carry pre-vote numbers — and while a synthetic audience campaign is
 * delivering, the tally moves every few seconds. Readers who can actually vote
 * therefore get the live figure straight from the database; anonymous traffic,
 * which is the bulk of it, keeps the cached path.
 */
export const getTopicCounts = createServerFn({ method: "GET" })
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const signedIn = Boolean(getRequestHeader("authorization"));
    if (signedIn) {
      setResponseHeader("cache-control", "private, no-store");
      return fetchTopicCounts(data.id);
    }
    setResponseHeader("cache-control", publicCacheControl(COUNTS_READ));
    return cached(`counts:${data.id}`, COUNTS_READ, () => fetchTopicCounts(data.id, 5));
  });

async function fetchTaxonomy() {
  const supabase = publicClient(300);
  const [cats, tags] = await Promise.all([
    supabase.from("categories").select("id, name, slug, emoji").order("name"),
    supabase.from("tags").select("id, name, slug").order("name"),
  ]);
  return {
    categories: cats.data ?? [],
    tags: tags.data ?? [],
  };
}

export const getTaxonomy = createServerFn({ method: "GET" }).handler(async () => {
  // The long TTL applies to this process's own copy, not to the page. /browse
  // loads the taxonomy alongside the feed, and whichever handler sets the
  // header last wins — so advertising 5 minutes here would quietly cache the
  // feed on that page for 5 minutes too. The shared window stays the feed's.
  setResponseHeader("cache-control", publicCacheControl(PUBLIC_READ));
  return cached("taxonomy", TAXONOMY_READ, fetchTaxonomy);
});
