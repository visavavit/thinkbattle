import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { getTopic } from "@/lib/public.functions";
import { Discussion } from "@/components/Discussion";
import { useAuth } from "@/hooks/useAuth";
import { translate as tr, useT } from "@/lib/i18n";
import { coverSrcSet, COVER_SIZES } from "@/lib/images";

const topicQuery = (id: string) =>
  queryOptions({
    queryKey: ["topic", id],
    queryFn: () => getTopic({ data: { id } }),
  });

export const Route = createFileRoute("/topic/$id")({
  loader: async ({ context, params }) => {
    const topic = await context.queryClient.ensureQueryData(topicQuery(params.id));
    if (!topic) throw notFound();
    return { title: topic.title, choiceA: topic.choice_a, choiceB: topic.choice_b };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [{ title: tr("meta.topic.unavailable") }, { name: "robots", content: "noindex" }],
      };
    }
    const title = `${loaderData.title} — VS Arena`;
    const description = tr("meta.topic.description", { a: loaderData.choiceA, b: loaderData.choiceB });
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "article" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  errorComponent: () => <TopicFallback titleKey="topic.loadFailed" />,
  notFoundComponent: () => <TopicFallback titleKey="topic.notFound" />,
  component: TopicPage,
});

function TopicFallback({ titleKey }: { titleKey: "topic.loadFailed" | "topic.notFound" }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-20 text-center">
      <h1 className="text-3xl">{tr(titleKey)}</h1>
      <Link to="/" className="mt-4 inline-block font-bold text-primary underline">
        {tr("topic.backToFeed")}
      </Link>
    </div>
  );
}

function TopicPage() {
  const { id } = Route.useParams();
  const { data: topic } = useSuspenseQuery(topicQuery(id));
  const { user } = useAuth();
  const t = useT();

  if (!topic) return null;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <Link
        to="/"
        className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {t("nav.feed")}
      </Link>

      <div className="flex flex-wrap items-center gap-2">
        {topic.category_name ? (
          <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
            {topic.category_emoji} {topic.category_name}
          </span>
        ) : null}
        {(topic.tags ?? []).map((tag) => (
          <span
            key={tag}
            className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
          >
            #{tag}
          </span>
        ))}
      </div>

      <h1 className="text-4xl sm:text-5xl">{topic.title}</h1>
      {topic.cover_image_url ? (
        <img
          src={topic.cover_image_url}
          srcSet={coverSrcSet(topic.cover_image_url)}
          sizes="(min-width: 1024px) 1024px, 100vw"
          alt={topic.title}
          fetchPriority="high"
          decoding="async"
          width={1200}
          height={675}
          className="aspect-[21/9] w-full rounded-md object-cover"
        />
      ) : null}
      {topic.description ? <p className="text-muted-foreground">{topic.description}</p> : null}

      <Discussion topic={topic} user={user} />
    </div>
  );
}
