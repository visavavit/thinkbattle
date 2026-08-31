import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  useSuspenseQuery,
  useInfiniteQuery,
  queryOptions,
  infiniteQueryOptions,
} from "@tanstack/react-query";
import { Clock, Flame, Hourglass, Layers, Lock, Scale, Search, Star, Vote, X } from "lucide-react";
import { z } from "zod";
import {
  BROWSE_PAGE_SIZE,
  getFeed,
  getTaxonomy,
  type FeedPage,
  type FeedTab,
  type TopicCard,
} from "@/lib/public.functions";
import type { FeedCursor } from "@/lib/feed-search";
import { TopicCardItem } from "@/components/TopicCardItem";
import { BrowseSkeleton, CardGridSkeleton } from "@/components/RouteSkeletons";
import { readClock } from "@/lib/topic-clock";
import { seoTags } from "@/lib/site";
import { translate as tr, useT, type TranslationKey } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const SORTS = ["top", "trending", "newest", "neck"] as const;
const STATUSES = ["open", "soon", "closed"] as const;

type Status = (typeof STATUSES)[number];

/** The default ordering stays out of the URL so a bare /browse is canonical. */
const DEFAULT_SORT: FeedTab = "top";
const ANY_STATUS = "any";

/** Every filter falls back rather than throwing: a hand-edited or stale URL
 *  should degrade to a wider view, never to an error page. */
const searchSchema = z.object({
  category: z.string().optional().catch(undefined),
  q: z.string().optional().catch(undefined),
  sort: z.enum(SORTS).optional().catch(undefined),
  status: z.enum(STATUSES).optional().catch(undefined),
});

type BrowseSearch = z.infer<typeof searchSchema>;

type FilterOption = { value: string; labelKey: TranslationKey; icon: typeof Flame };

const SORT_OPTIONS: FilterOption[] = [
  { value: "top", labelKey: "tab.top", icon: Star },
  { value: "trending", labelKey: "tab.trending", icon: Flame },
  { value: "newest", labelKey: "tab.newest", icon: Clock },
  { value: "neck", labelKey: "tab.neck", icon: Scale },
];

const STATUS_OPTIONS: FilterOption[] = [
  { value: ANY_STATUS, labelKey: "browse.statusAny", icon: Layers },
  { value: "open", labelKey: "browse.statusOpen", icon: Vote },
  { value: "soon", labelKey: "browse.statusSoon", icon: Hourglass },
  { value: "closed", labelKey: "browse.statusClosed", icon: Lock },
];

const taxonomyQuery = queryOptions({
  queryKey: ["taxonomy-public"],
  queryFn: () => getTaxonomy(),
});

/**
 * Sort, category and the search text all reach the server, and the results
 * page. Search used to run in the browser over whatever the feed had already
 * loaded, which capped the whole catalogue at 60 topics: past that the rest
 * silently stopped existing and search could not find what was never fetched.
 *
 * Status stays client-side, deliberately. Deadline state is read from the
 * reader's own clock (see matchesStatus below) because rows are cached for
 * minutes at a time, so a topic that expires mid-window has to move between
 * "open" and "closed" on read rather than at query time.
 */
const browseQuery = (sort: FeedTab, category: string | undefined, q: string | undefined) =>
  infiniteQueryOptions({
    queryKey: ["browse", sort, category ?? "all", q ?? ""],
    initialPageParam: null as FeedCursor | null,
    getNextPageParam: (last: FeedPage) => last.next,
    queryFn: ({ pageParam }) =>
      getFeed({
        data: { tab: sort, category, q, cursor: pageParam, limit: BROWSE_PAGE_SIZE },
      }),
    staleTime: 60_000,
  });

export const Route = createFileRoute("/browse")({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({
    sort: search.sort ?? DEFAULT_SORT,
    category: search.category,
    q: search.q,
  }),
  loader: async ({ context, deps }) => {
    // The feed is awaited on the server so the HTML ships with cards in it, but
    // a client navigation must not sit on a blank screen waiting for rows: the
    // page frame renders straight away and the grid fills in behind a skeleton.
    const feed = context.queryClient.ensureInfiniteQueryData(
      browseQuery(deps.sort, deps.category, deps.q),
    );
    if (typeof window === "undefined") await feed;
    else void feed.catch(() => {});
    await context.queryClient.ensureQueryData(taxonomyQuery);
  },
  head: () => {
    // Filters live in the query string; the canonical target is the bare page.
    const seo = seoTags("/browse");
    return {
      meta: [
        { title: tr("meta.browse.title") },
        { name: "description", content: tr("meta.browse.description") },
        { property: "og:title", content: tr("meta.browse.title") },
        { property: "og:description", content: tr("meta.browse.description") },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
        ...seo.meta,
      ],
      links: seo.links,
    };
  },
  component: BrowsePage,
  pendingComponent: BrowseSkeleton,
});

/**
 * Deadline state is read from the reader's own clock, the same way the cards
 * read it — the rows are cached for minutes at a time, so a topic that expires
 * mid-window has to move between "open" and "closed" on read. A topic with no
 * deadline is always open and never closing soon.
 */
function matchesStatus(topic: TopicCard, status: Status | undefined): boolean {
  if (!status) return true;
  const clock = readClock(topic.closes_at);
  if (status === "closed") return clock.isClosed;
  if (status === "soon") return clock.isClosingSoon;
  return !clock.isClosed;
}

/** How long the box sits still before the query lands in the URL. */
const SEARCH_DEBOUNCE_MS = 300;

function BrowsePage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/browse" });
  const t = useT();
  const sort = search.sort ?? DEFAULT_SORT;

  const { data: taxonomy } = useSuspenseQuery(taxonomyQuery);
  const {
    data: feed,
    isPending: feedPending,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteQuery(browseQuery(sort, search.category, search.q));
  const rows = useMemo(() => (feed?.pages ?? []).flatMap((page) => page.rows), [feed?.pages]);

  // The box is typed into far faster than the URL should change, so it keeps
  // its own state and syncs both ways: down when the URL moves without it
  // (back button, "clear filters", a shared link), up on a debounce.
  const urlQuery = search.q ?? "";
  const [queryText, setQueryText] = useState(urlQuery);
  const syncedQuery = useRef(urlQuery);

  useEffect(() => {
    if (urlQuery === syncedQuery.current) return; // our own write coming back
    syncedQuery.current = urlQuery;
    setQueryText(urlQuery);
  }, [urlQuery]);

  useEffect(() => {
    const next = queryText.trim();
    if (next === syncedQuery.current) return;
    const timer = setTimeout(() => {
      syncedQuery.current = next;
      // replace, not push: a search should be one entry in history, not one
      // per keystroke
      navigate({
        search: (prev: BrowseSearch) => ({ ...prev, q: next || undefined }),
        replace: true,
        resetScroll: false,
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [queryText, navigate]);

  // Text matching now happens in the database. Status still narrows what came
  // back, because it depends on the reader's clock rather than the query.
  const topics = useMemo(
    () => rows.filter((topic) => matchesStatus(topic, search.status)),
    [rows, search.status],
  );

  const setFilter = (patch: Partial<BrowseSearch>) =>
    navigate({ search: (prev: BrowseSearch) => ({ ...prev, ...patch }), resetScroll: false });

  const hasFilters = Boolean(search.category || search.status || queryText.trim());

  const clearFilters = () => {
    syncedQuery.current = "";
    setQueryText("");
    navigate({
      search: (prev: BrowseSearch) => (prev.sort ? { sort: prev.sort } : {}),
      resetScroll: false,
    });
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-4xl">{t("browse.title")}</h1>
        <p className="text-muted-foreground">{t("browse.subtitle")}</p>
      </header>

      <section className="arena-panel space-y-4 p-4 sm:p-5">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_11rem]">
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              // type="search" would add a second, unstyled clear button in
              // WebKit next to the one below
              type="text"
              value={queryText}
              onChange={(event) => setQueryText(event.target.value)}
              placeholder={t("browse.searchPlaceholder")}
              aria-label={t("browse.searchLabel")}
              className="pr-9 pl-9"
            />
            {queryText ? (
              <button
                type="button"
                onClick={() => setQueryText("")}
                aria-label={t("browse.clearSearch")}
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-1 text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          <FilterSelect
            label={t("browse.statusLabel")}
            options={STATUS_OPTIONS}
            value={search.status ?? ANY_STATUS}
            onChange={(value) =>
              setFilter({ status: value === ANY_STATUS ? undefined : (value as Status) })
            }
          />
        </div>

        <div role="group" aria-label={t("browse.categoryLabel")} className="flex flex-wrap gap-2">
          <FilterChip
            active={!search.category}
            label={t("browse.allCategories")}
            onClick={() => setFilter({ category: undefined })}
          />
          {taxonomy.categories.map((category) => (
            <FilterChip
              key={category.id}
              active={search.category === category.slug}
              label={`${category.emoji} ${category.name}`}
              onClick={() => setFilter({ category: category.slug })}
            />
          ))}
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p aria-live="polite" className="text-sm text-muted-foreground">
          {feedPending
            ? t("browse.loading")
            : t(topics.length === 1 ? "browse.resultOne" : "browse.resultMany", {
                n: topics.length,
              })}
        </p>
        <div className="flex items-center gap-3">
          <div className="w-44">
            <FilterSelect
              label={t("browse.sortLabel")}
              options={SORT_OPTIONS}
              value={sort}
              onChange={(value) =>
                setFilter({ sort: value === DEFAULT_SORT ? undefined : (value as FeedTab) })
              }
            />
          </div>
          {/* the empty state carries its own reset, so this one would only be a
              second copy of the same button */}
          {hasFilters && topics.length > 0 ? (
            <ClearFiltersButton label={t("browse.clearAll")} onClick={clearFilters} />
          ) : null}
        </div>
      </div>

      {feedPending ? (
        <CardGridSkeleton count={6} />
      ) : topics.length > 0 ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {topics.map((topic) => (
            <TopicCardItem key={topic.id} topic={topic} />
          ))}
        </div>
      ) : (
        <div className="space-y-3 py-12 text-center">
          {/* The status filter narrows what came back rather than what was
              asked for, so a page can be emptied by it while the catalogue
              still has more to give. Say so, instead of claiming there is
              nothing — the Load more below is the way out. */}
          <p className="text-lg">
            {hasNextPage ? t("browse.moreBeyondFilter") : t("browse.empty")}
          </p>
          {hasNextPage ? null : (
            <p className="text-sm text-muted-foreground">{t("browse.emptyHint")}</p>
          )}
          {hasFilters ? (
            <div className="flex justify-center pt-1">
              <ClearFiltersButton label={t("browse.clearAll")} onClick={clearFilters} />
            </div>
          ) : null}
        </div>
      )}

      {!feedPending && hasNextPage ? (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            disabled={isFetchingNextPage}
            onClick={() => void fetchNextPage()}
          >
            {isFetchingNextPage ? t("browse.loading") : t("browse.loadMore")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * A labelled dropdown that reads correctly before hydration. `SelectValue` is
 * given explicit children rather than left to Radix: the text it would show on
 * its own is portaled out of the selected `SelectItem`, and the items only
 * exist once the browser has mounted the content — so server-rendered markup
 * would otherwise ship an empty trigger that fills in on hydration.
 */
function FilterSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: FilterOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useT();
  const selected = options.find((option) => option.value === value) ?? options[0]!;
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label}>
        <SelectValue>
          <OptionLabel icon={selected.icon} text={t(selected.labelKey)} />
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map(({ value: optionValue, labelKey, icon }) => (
          <SelectItem key={optionValue} value={optionValue}>
            <OptionLabel icon={icon} text={t(labelKey)} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function OptionLabel({ icon: Icon, text }: { icon: typeof Flame; text: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      {text}
    </span>
  );
}

function ClearFiltersButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      <X className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </button>
  );
}

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}
