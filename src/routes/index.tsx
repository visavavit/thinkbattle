import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { Flame, Scale, Star, Clock } from "lucide-react";
import { z } from "zod";
import { getFeed, getHeadliner, type FeedTab } from "@/lib/public.functions";
import { TopicCardItem } from "@/components/TopicCardItem";
import { SplitBar } from "@/components/SplitBar";

const searchSchema = z.object({
  tab: z.enum(["trending", "neck", "top", "newest"]).catch("trending"),
});

const feedQuery = (tab: FeedTab) =>
  queryOptions({
    queryKey: ["feed", tab],
    queryFn: () => getFeed({ data: { tab } }),
  });

const headlinerQuery = queryOptions({
  queryKey: ["headliner"],
  queryFn: () => getHeadliner(),
});

export const Route = createFileRoute("/")({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ tab: search.tab }),
  loader: async ({ context, deps }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(feedQuery(deps.tab)),
      context.queryClient.ensureQueryData(headlinerQuery),
    ]);
  },
  head: () => ({
    meta: [
      { title: "VS Arena — Pick a Side, Defend It" },
      {
        name: "description",
        content:
          "Binary debates with bifurcated comment columns and a Wild Takes ranking that surfaces the most controversial arguments on both sides.",
      },
      { property: "og:title", content: "VS Arena — Pick a Side, Defend It" },
      {
        property: "og:description",
        content: "Vote on 2-choice showdowns and fight it out in split comment columns.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

const TABS: { key: FeedTab; label: string; icon: typeof Flame }[] = [
  { key: "trending", label: "Trending", icon: Flame },
  { key: "neck", label: "Neck-and-Neck", icon: Scale },
  { key: "top", label: "Top Voted", icon: Star },
  { key: "newest", label: "Newest", icon: Clock },
];

function Home() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: "/" });
  const { data: topics } = useSuspenseQuery(feedQuery(tab));
  const { data: headliner } = useSuspenseQuery(headlinerQuery);

  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 py-8">
      <section className="text-center">
        <h1 className="font-display text-5xl leading-none sm:text-7xl">
          Pick a side.<span className="text-side-b"> Defend it.</span>
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
          Two choices. Two comment columns. One Wild Takes leaderboard for the most roasted opinions
          on the internet.
        </p>
      </section>

      {headliner ? (
        <section className="arena-panel relative overflow-hidden p-6">
          <span className="absolute top-0 right-0 bg-primary px-3 py-1 font-display text-sm text-primary-foreground">
            ⚡ The Headliner
          </span>
          <p className="text-xs font-bold text-muted-foreground uppercase">
            {headliner.category_emoji} {headliner.category_name} · {headliner.total_votes} votes
          </p>
          <h2 className="mt-2 text-3xl sm:text-4xl">{headliner.title}</h2>
          <div className="mt-5 max-w-2xl">
            <SplitBar
              pctA={headliner.pct_a}
              labelA={headliner.choice_a}
              labelB={headliner.choice_b}
              size="lg"
            />
          </div>
          <Link
            to="/topic/$id"
            params={{ id: headliner.id }}
            className="mt-5 inline-block rounded-sm bg-primary px-5 py-2 font-display text-lg text-primary-foreground"
          >
            Cast your vote
          </Link>
        </section>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => navigate({ search: { tab: key } })}
            className={`inline-flex items-center gap-2 rounded-sm border-2 px-4 py-2 text-sm font-bold uppercase transition-colors ${
              tab === key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {topics.map((topic) => (
          <TopicCardItem key={topic.id} topic={topic} />
        ))}
      </div>
      {topics.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">
          Nothing in this tab yet — try another filter.
        </p>
      ) : null}
    </div>
  );
}
