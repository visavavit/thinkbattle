import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { cached, publicCacheControl, COUNTS_READ, PUBLIC_READ, TAXONOMY_READ } from "./cache";

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
  wild_takes_count: number;
  is_featured: boolean;
  created_at: string;
  published_at: string | null;
};

function publicClient() {
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
        return fetch(input, { ...init, headers: h });
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

async function fetchFeedRows(order: FeedOrder, category?: string): Promise<TopicCard[]> {
  const supabase = publicClient();
  let query = supabase.from("topic_cards").select("*").eq("status", "published").limit(60);

  if (category) query = query.eq("category_slug", category);

  if (order === "top") query = query.order("total_votes", { ascending: false });
  else if (order === "newest") query = query.order("published_at", { ascending: false });
  else query = query.order("trending_score", { ascending: false });

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as TopicCard[];
}

export const getFeed = createServerFn({ method: "GET" })
  .inputValidator(
    (input: {
      tab?: FeedTab | undefined;
      category?: string | undefined;
      tag?: string | undefined;
    }) => input ?? {},
  )
  .handler(async ({ data }) => {
    setResponseHeader("cache-control", publicCacheControl(PUBLIC_READ));

    const tab = data.tab ?? "trending";
    const order = feedOrder(tab);

    // Only the query is cached. Tag and neck-and-neck narrowing runs per call
    // against the cached rows — it is pure array work, and keeping it outside
    // means every tag under a category shares one database read.
    const rows = await cached(`feed:${order}:${data.category ?? "all"}`, PUBLIC_READ, () =>
      fetchFeedRows(order, data.category),
    );

    let topics = rows;
    if (data.tag) topics = topics.filter((t) => (t.tags ?? []).includes(data.tag!));
    if (tab === "neck") {
      topics = topics
        .filter((t) => t.total_votes > 0 && t.pct_a >= 45 && t.pct_a <= 55)
        .sort((a, b) => Math.abs(50 - a.pct_a) - Math.abs(50 - b.pct_a));
    }
    return topics;
  });

async function fetchHeadliners(): Promise<TopicCard[]> {
  const supabase = publicClient();

  // admin pins always win; otherwise fall back to the closest fight
  const { data: pinned } = await supabase
    .from("topic_cards")
    .select("*")
    .eq("status", "published")
    .eq("is_featured", true)
    .order("total_votes", { ascending: false })
    .limit(8);
  if (pinned && pinned.length > 0) return pinned as unknown as TopicCard[];

  const { data, error } = await supabase
    .from("topic_cards")
    .select("*")
    .eq("status", "published")
    .order("total_votes", { ascending: false })
    .limit(30);
  if (error) throw new Error(error.message);
  const topics = (data ?? []) as unknown as TopicCard[];
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

async function fetchTopic(id: string): Promise<TopicCard | null> {
  const supabase = publicClient();
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

async function fetchTopicCounts(id: string): Promise<TopicCounts> {
  const supabase = publicClient();
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
 */
export const getTopicCounts = createServerFn({ method: "GET" })
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    setResponseHeader("cache-control", publicCacheControl(COUNTS_READ));
    return cached(`counts:${data.id}`, COUNTS_READ, () => fetchTopicCounts(data.id));
  });

async function fetchTaxonomy() {
  const supabase = publicClient();
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
