import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { AlertTriangle, EyeOff, Flame, Inbox, MessageSquare, Users, Vote } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { adminKeys, type ActivityPoint, type AdminStats } from "@/lib/admin";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";

function StatTile({
  label,
  value,
  sub,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: number | string;
  sub?: string;
  icon: typeof Vote;
  tone?: "default" | "alert";
}) {
  return (
    <div className="arena-panel p-4">
      <div className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        <Icon className={`h-3.5 w-3.5 ${tone === "alert" ? "text-destructive" : ""}`} />
        {label}
      </div>
      <p
        className={`mt-2 font-display text-3xl ${
          tone === "alert" && Number(value) > 0 ? "text-destructive" : ""
        }`}
      >
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

// Votes and comments differ by an order of magnitude, so they get one facet each
// rather than a second y-axis on a shared plot.
const FACETS = [
  {
    key: "vote_count" as const,
    title: "Votes cast",
    color: "var(--color-chart-1)",
    label: "Votes",
  },
  {
    key: "comment_count" as const,
    title: "Comments posted",
    color: "var(--color-chart-4)",
    label: "Comments",
  },
];

function ActivityFacet({ data, facet }: { data: ActivityPoint[]; facet: (typeof FACETS)[number] }) {
  const total = data.reduce((sum, point) => sum + Number(point[facet.key] ?? 0), 0);
  return (
    <div className="arena-panel p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-base font-semibold">{facet.title}</h3>
        <span className="text-xs text-muted-foreground">{total.toLocaleString()} in 14 days</span>
      </div>
      <ChartContainer
        config={{ [facet.key]: { label: facet.label, color: facet.color } }}
        className="mt-3 aspect-[3/1] w-full"
      >
        <AreaChart data={data} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
          <defs>
            <linearGradient id={`fill-${facet.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={facet.color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={facet.color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="2 4" />
          <XAxis
            dataKey="day"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={24}
            tickFormatter={(value: string) =>
              new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" })
            }
          />
          <YAxis tickLine={false} axisLine={false} width={34} allowDecimals={false} />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(value) =>
                  new Date(String(value)).toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })
                }
              />
            }
          />
          <Area
            type="monotone"
            dataKey={facet.key}
            name={facet.label}
            stroke={facet.color}
            strokeWidth={2}
            fill={`url(#fill-${facet.key})`}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2 }}
          />
        </AreaChart>
      </ChartContainer>
    </div>
  );
}

export function AdminOverview({ onJumpToReports }: { onJumpToReports: () => void }) {
  const stats = useQuery({
    queryKey: adminKeys.stats,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_dashboard_stats");
      if (error) throw error;
      return data as unknown as AdminStats;
    },
  });

  const activity = useQuery({
    queryKey: adminKeys.activity,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_activity_series", { _days: 14 });
      if (error) throw error;
      return data ?? [];
    },
  });

  const hottest = useQuery({
    queryKey: ["admin", "hottest"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("topic_cards")
        .select("id, title, total_votes, pct_a, choice_a, choice_b")
        .eq("status", "published")
        .order("total_votes", { ascending: false })
        .limit(40);
      if (error) throw error;
      return (data ?? [])
        .map((t) => ({ ...t, split: Math.abs(50 - Number(t.pct_a ?? 50)) }))
        .sort((a, b) => a.split - b.split || (b.total_votes ?? 0) - (a.total_votes ?? 0))
        .slice(0, 5);
    },
  });

  const s = stats.data;

  return (
    <div className="space-y-6">
      {stats.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : s ? (
        <>
          {s.reports_open > 0 ? (
            <button
              type="button"
              onClick={onJumpToReports}
              className="flex w-full items-center gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-left text-sm"
            >
              <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
              <span>
                <strong>
                  {s.reports_open} open report{s.reports_open === 1 ? "" : "s"}
                </strong>{" "}
                waiting on a decision.
              </span>
              <span className="ml-auto text-xs font-medium underline">Review now</span>
            </button>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Live topics"
              value={s.topics_published}
              sub={`${s.topics_rejected} unpublished`}
              icon={Flame}
            />
            <StatTile
              label="In the queue"
              value={s.topics_pending}
              sub="user suggestions"
              icon={Inbox}
              tone={s.topics_pending > 0 ? "alert" : "default"}
            />
            <StatTile
              label="Votes"
              value={s.votes_total}
              sub={`${s.votes_24h.toLocaleString()} in last 24h`}
              icon={Vote}
            />
            <StatTile
              label="Comments"
              value={s.comments_total}
              sub={`${s.comments_24h.toLocaleString()} in last 24h`}
              icon={MessageSquare}
            />
            <StatTile
              label="Open reports"
              value={s.reports_open}
              sub="flagged by users"
              icon={AlertTriangle}
              tone="alert"
            />
            <StatTile
              label="Hidden comments"
              value={s.comments_hidden}
              sub="removed from public view"
              icon={EyeOff}
            />
            <StatTile
              label="Members"
              value={s.users_total}
              sub={`${s.admins_total} admin${s.admins_total === 1 ? "" : "s"}`}
              icon={Users}
            />
            <StatTile
              label="Banned"
              value={s.users_banned}
              sub="write access revoked"
              icon={Users}
              tone={s.users_banned > 0 ? "alert" : "default"}
            />
          </div>
        </>
      ) : (
        <p className="text-sm text-destructive">Could not load stats.</p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {activity.isLoading
          ? FACETS.map((f) => <Skeleton key={f.key} className="h-52" />)
          : FACETS.map((facet) => (
              <ActivityFacet key={facet.key} facet={facet} data={activity.data ?? []} />
            ))}
      </div>

      <div className="arena-panel p-4">
        <h3 className="text-base font-semibold">Closest fights right now</h3>
        <p className="text-xs text-muted-foreground">
          Published topics sitting nearest a 50/50 split — the best headliner candidates.
        </p>
        <ul className="mt-3 space-y-2">
          {(hottest.data ?? []).map((t) => (
            <li key={t.id} className="flex items-center gap-3 text-sm">
              <span className="w-12 shrink-0 font-mono text-xs text-muted-foreground">
                {Number(t.pct_a ?? 50)}/{100 - Number(t.pct_a ?? 50)}
              </span>
              <span className="min-w-0 flex-1 truncate">{t.title}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {(t.total_votes ?? 0).toLocaleString()} votes
              </span>
            </li>
          ))}
          {(hottest.data ?? []).length === 0 && !hottest.isLoading ? (
            <li className="text-sm text-muted-foreground">No published topics yet.</li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}
