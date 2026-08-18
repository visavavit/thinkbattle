import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQuery, queryOptions, keepPreviousData } from "@tanstack/react-query";
import { Flame, Scale, Star, Clock } from "lucide-react";
import { z } from "zod";
import { getFeed, getHeadliners, type FeedTab } from "@/lib/public.functions";
import { TopicCardItem } from "@/components/TopicCardItem";
import { SplitBar } from "@/components/SplitBar";
import { translate as tr, useT, type TranslationKey } from "@/lib/i18n";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";


const searchSchema = z.object({
  tab: z.enum(["trending", "neck", "top", "newest"]).catch("trending"),
});

const feedQuery = (tab: FeedTab) =>
  queryOptions({
    queryKey: ["feed", tab],
    queryFn: () => getFeed({ data: { tab } }),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });

const headlinerQuery = queryOptions({
  queryKey: ["headliners"],
  queryFn: () => getHeadliners(),
});


export const Route = createFileRoute("/")({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ tab: search.tab }),
  loader: async ({ context, deps }) => {
    // A transient network blip must not blank the page: the component's own
    // queries refetch on the client, so warm the cache best-effort only.
    await Promise.allSettled([
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
  const { data: topics = [] } = useQuery(feedQuery(tab));
  const { data: headliners = [] } = useSuspenseQuery(headlinerQuery);

  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 py-8">
      <section className="text-center">
        <h1 className="font-display text-4xl leading-tight sm:text-5xl">
          Pick a side.<span className="text-side-b"> Defend it.</span>
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
          Vote on the debates people are actually having, then read the best arguments from both
          sides — side by side.
        </p>
      </section>

      {headliners.length > 0 ? (
        <Carousel opts={{ loop: headliners.length > 1, align: "start" }} className="relative">
          <CarouselContent>
            {headliners.map((headliner) => (
              <CarouselItem key={headliner.id}>
                <section className="arena-panel relative overflow-hidden p-6">
                  <span className="absolute top-0 right-0 bg-primary px-3 py-1 text-xs font-medium tracking-wide text-primary-foreground">
                    ⚡ The Headliner
                  </span>
                  {headliner.cover_image_url ? (
                    <img
                      src={headliner.cover_image_url}
                      alt={headliner.title}
                      width={1200}
                      height={675}
                      className="mb-5 aspect-[21/9] w-full rounded-md object-cover"
                    />
                  ) : null}
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {headliner.category_emoji} {headliner.category_name} · {headliner.total_votes}{" "}
                    votes
                  </p>
                  <h2 className="mt-2 text-3xl sm:text-4xl">{headliner.title}</h2>
                  <div className="mt-5">
                    <SplitBar
                      pctA={headliner.pct_a}
                      countA={headliner.votes_a}
                      countB={headliner.votes_b}
                      labelA={headliner.choice_a}
                      labelB={headliner.choice_b}
                      size="lg"
                    />
                  </div>
                  <Link
                    to="/topic/$id"
                    params={{ id: headliner.id }}
                    className="mt-5 inline-block rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                  >
                    Cast your vote
                  </Link>
                </section>
              </CarouselItem>
            ))}
          </CarouselContent>
          {headliners.length > 1 ? (
            <>
              <CarouselPrevious className="left-3" />
              <CarouselNext className="right-3" />
            </>
          ) : null}
        </Carousel>
      ) : null}


      <div className="flex flex-wrap gap-2">
        {TABS.map(({ key, label, icon: Icon }) => (
          <Link
            key={key}
            to="/"
            search={{ tab: key }}
            resetScroll={false}
            preload="intent"
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === key
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
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
