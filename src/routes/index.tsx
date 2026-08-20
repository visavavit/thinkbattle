import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQuery, queryOptions, keepPreviousData } from "@tanstack/react-query";
import { Flame, Scale, Star, Clock } from "lucide-react";
import { z } from "zod";
import { getFeed, getHeadliners, type FeedTab } from "@/lib/public.functions";
import { TopicCardItem } from "@/components/TopicCardItem";
import { coverSrcSet } from "@/lib/images";
import { SplitBar } from "@/components/SplitBar";
import { translate as tr, useT, type TranslationKey } from "@/lib/i18n";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";


/** The default tab stays absent from the URL. Spelling it out would make
 *  validateSearch return a search object the bare "/" does not have, and the
 *  router would answer every visit to the home page with a redirect to
 *  "/?tab=trending" — a wasted round trip on the most common entry point.
 *  An unreadable value falls back the same way a missing one does. */
const searchSchema = z.object({
  tab: z.enum(["trending", "neck", "top", "newest"]).optional().catch(undefined),
});

const DEFAULT_TAB: FeedTab = "trending";

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
  loaderDeps: ({ search }) => ({ tab: search.tab ?? DEFAULT_TAB }),
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
      { title: tr("meta.home.title") },
      { name: "description", content: tr("meta.home.description") },
      { property: "og:title", content: tr("meta.home.title") },
      { property: "og:description", content: tr("meta.home.description") },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

const TABS: { key: FeedTab; labelKey: TranslationKey; icon: typeof Flame }[] = [
  { key: "trending", labelKey: "tab.trending", icon: Flame },
  { key: "neck", labelKey: "tab.neck", icon: Scale },
  { key: "top", labelKey: "tab.top", icon: Star },
  { key: "newest", labelKey: "tab.newest", icon: Clock },
];

function Home() {
  const { tab = DEFAULT_TAB } = Route.useSearch();
  const t = useT();
  const { data: topics = [] } = useQuery(feedQuery(tab));
  const { data: headliners = [] } = useSuspenseQuery(headlinerQuery);

  return (
    <div className="mx-auto max-w-6xl space-y-10 px-4 py-8">
      <section className="text-center">
        <h1 className="font-display text-4xl leading-tight sm:text-5xl">
          {t("home.heroLead")}
        </h1>
        <p className="mx-auto mt-3 max-w-3xl text-muted-foreground">{t("home.heroSub")}</p>
      </section>

      {headliners.length > 0 ? (
        <Carousel opts={{ loop: headliners.length > 1, align: "start" }} className="relative">
          <CarouselContent>
            {headliners.map((headliner, slideIndex) => (
              <CarouselItem key={headliner.id}>
                <section className="arena-panel relative overflow-hidden p-6">
                  <span className="absolute top-0 right-0 bg-primary px-3 py-1 text-xs font-medium tracking-wide text-primary-foreground">
                    {t("home.headliner")}
                  </span>
                  {headliner.cover_image_url ? (
                    // Hidden from assistive tech: the title link right below points at
                    // the same topic with the same text, so exposing both would only
                    // add a duplicate stop.
                    <Link
                      to="/topic/$id"
                      params={{ id: headliner.id }}
                      aria-hidden
                      tabIndex={-1}
                      className="mb-5 block"
                    >
                      <img
                        src={headliner.cover_image_url}
                        srcSet={coverSrcSet(headliner.cover_image_url)}
                        sizes="(min-width: 1024px) 1024px, 100vw"
                        alt={headliner.title}
                        // only the first slide is visible on load — the rest are
                        // off-screen and must not compete with it for bandwidth
                        fetchPriority={slideIndex === 0 ? "high" : "low"}
                        loading={slideIndex === 0 ? "eager" : "lazy"}
                        decoding="async"
                        width={1200}
                        height={675}
                        className="aspect-[21/9] w-full rounded-md object-cover transition-opacity hover:opacity-90"
                      />
                    </Link>
                  ) : null}
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {headliner.category_emoji} {headliner.category_name} ·{" "}
                    {t("vote.countMany", { n: headliner.total_votes })}
                  </p>
                  <h2 className="mt-2 text-3xl sm:text-4xl">
                    <Link
                      to="/topic/$id"
                      params={{ id: headliner.id }}
                      className="transition-colors hover:text-primary"
                    >
                      {headliner.title}
                    </Link>
                  </h2>
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
                    {t("home.castVote")}
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
        {TABS.map(({ key, labelKey, icon: Icon }) => (
          <Link
            key={key}
            to="/"
            search={{ tab: key === DEFAULT_TAB ? undefined : key }}
            resetScroll={false}
            preload="intent"
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === key
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
            {t(labelKey)}
          </Link>
        ))}
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {topics.map((topic) => (
          <TopicCardItem key={topic.id} topic={topic} />
        ))}
      </div>
      {topics.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">{t("home.emptyTab")}</p>
      ) : null}

    </div>
  );
}
