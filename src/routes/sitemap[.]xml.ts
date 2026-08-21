import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { SITE_URL } from "@/lib/site";

type Row = { id: string; published_at: string | null; created_at: string };

const STATIC_PATHS = ["/", "/browse", "/about", "/terms", "/privacy"];

function entry(loc: string, lastmod?: string | null, priority = "0.6") {
  return [
    "  <url>",
    `    <loc>${loc}</loc>`,
    lastmod ? `    <lastmod>${new Date(lastmod).toISOString()}</lastmod>` : "",
    `    <priority>${priority}</priority>`,
    "  </url>",
  ]
    .filter(Boolean)
    .join("\n");
}

async function publishedTopics(): Promise<Row[]> {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return [];
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_")) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
  const { data } = await supabase
    .from("topics")
    .select("id, published_at, created_at")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(5000);
  return (data ?? []) as Row[];
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const topics = await publishedTopics();
        const body = [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
          ...STATIC_PATHS.map((p) => entry(`${SITE_URL}${p}`, null, p === "/" ? "1.0" : "0.5")),
          ...topics.map((t) =>
            entry(`${SITE_URL}/topic/${t.id}`, t.published_at ?? t.created_at, "0.8"),
          ),
          "</urlset>",
        ].join("\n");

        return new Response(body, {
          headers: {
            "content-type": "application/xml; charset=utf-8",
            "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
          },
        });
      },
    },
  },
});
