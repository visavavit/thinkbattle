import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { getFeed, getTaxonomy } from "@/lib/public.functions";
import { TopicCardItem } from "@/components/TopicCardItem";

const searchSchema = z.object({
  category: z.string().optional(),
  tag: z.string().optional(),
});

const taxonomyQuery = queryOptions({
  queryKey: ["taxonomy-public"],
  queryFn: () => getTaxonomy(),
});

const browseQuery = (category?: string, tag?: string) =>
  queryOptions({
    queryKey: ["browse", category ?? "all", tag ?? "all"],
    queryFn: () => getFeed({ data: { tab: "top", category, tag } }),
  });

export const Route = createFileRoute("/browse")({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(taxonomyQuery),
      context.queryClient.ensureQueryData(browseQuery(deps.category, deps.tag)),
    ]);
  },
  head: () => ({
    meta: [
      { title: "Browse Debates by Category — VS Arena" },
      {
        name: "description",
        content: "Filter binary debates by category and tag: tech, food, pop culture, life, sports.",
      },
      { property: "og:title", content: "Browse Debates by Category — VS Arena" },
      { property: "og:description", content: "Filter binary debates by category and tag." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BrowsePage,
});

function BrowsePage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/browse" });
  const { data: taxonomy } = useSuspenseQuery(taxonomyQuery);
  const { data: topics } = useSuspenseQuery(browseQuery(search.category, search.tag));

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-8">
      <h1 className="text-4xl">Browse the arena</h1>

      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <FilterChip
            active={!search.category}
            label="All categories"
            onClick={() => navigate({ search: { ...search, category: undefined } })}
          />
          {taxonomy.categories.map((c) => (
            <FilterChip
              key={c.id}
              active={search.category === c.slug}
              label={`${c.emoji} ${c.name}`}
              onClick={() => navigate({ search: { ...search, category: c.slug } })}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <FilterChip
            active={!search.tag}
            label="All tags"
            onClick={() => navigate({ search: { ...search, tag: undefined } })}
          />
          {taxonomy.tags.map((t) => (
            <FilterChip
              key={t.id}
              active={search.tag === t.name}
              label={`#${t.name}`}
              onClick={() => navigate({ search: { ...search, tag: t.name } })}
            />
          ))}
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {topics.map((topic) => (
          <TopicCardItem key={topic.id} topic={topic} />
        ))}
      </div>
      {topics.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">No debates match these filters.</p>
      ) : null}
    </div>
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
      className={`rounded-sm border-2 px-3 py-1 text-sm font-bold ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}
