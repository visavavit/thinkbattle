import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

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
  comments_count: number;
  wild_takes_count: number;
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

export const getFeed = createServerFn({ method: "GET" })
  .inputValidator((input: { tab?: FeedTab; category?: string; tag?: string }) => input ?? {})
  .handler(async ({ data }) => {
    const supabase = publicClient();
    let query = supabase.from("topic_cards").select("*").eq("status", "published").limit(60);

    if (data.category) query = query.eq("category_slug", data.category);

    const tab = data.tab ?? "trending";
    if (tab === "top") query = query.order("total_votes", { ascending: false });
    else if (tab === "newest") query = query.order("published_at", { ascending: false });
    else query = query.order("trending_score", { ascending: false });

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    let topics = (rows ?? []) as unknown as TopicCard[];
    if (data.tag) topics = topics.filter((t) => (t.tags ?? []).includes(data.tag!));
    if (tab === "neck") {
      topics = topics
        .filter((t) => t.total_votes > 0 && t.pct_a >= 45 && t.pct_a <= 55)
        .sort((a, b) => Math.abs(50 - a.pct_a) - Math.abs(50 - b.pct_a));
    }
    return topics;
  });

export const getHeadliner = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = publicClient();
  const { data, error } = await supabase
    .from("topic_cards")
    .select("*")
    .eq("status", "published")
    .order("total_votes", { ascending: false })
    .limit(30);
  if (error) throw new Error(error.message);
  const topics = (data ?? []) as unknown as TopicCard[];
  if (topics.length === 0) return null;
  const closest = [...topics].sort(
    (a, b) => Math.abs(50 - a.pct_a) - Math.abs(50 - b.pct_a) || b.total_votes - a.total_votes,
  );
  return closest[0] ?? null;
});

export const getTopic = createServerFn({ method: "GET" })
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const supabase = publicClient();
    const { data: row, error } = await supabase
      .from("topic_cards")
      .select("*")
      .eq("id", data.id)
      .eq("status", "published")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (row as unknown as TopicCard | null) ?? null;
  });

export const getTaxonomy = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = publicClient();
  const [cats, tags] = await Promise.all([
    supabase.from("categories").select("id, name, slug, emoji").order("name"),
    supabase.from("tags").select("id, name, slug").order("name"),
  ]);
  return {
    categories: cats.data ?? [],
    tags: tags.data ?? [],
  };
});
