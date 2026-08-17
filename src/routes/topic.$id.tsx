import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { getTopic } from "@/lib/public.functions";
import { Discussion } from "@/components/Discussion";
import { useAuth } from "@/hooks/useAuth";

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
        meta: [{ title: "Debate unavailable — VS Arena" }, { name: "robots", content: "noindex" }],
      };
    }
    const title = `${loaderData.title} — VS Arena`;
    const description = `${loaderData.choiceA} vs ${loaderData.choiceB}. Vote, then defend your side in the split comment columns.`;
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
  errorComponent: () => (
    <div className="mx-auto max-w-2xl px-4 py-20 text-center">
      <h1 className="text-3xl">This debate didn't load</h1>
      <Link to="/" className="mt-4 inline-block font-bold text-primary underline">
        Back to the feed
      </Link>
    </div>
  ),
  notFoundComponent: () => (
    <div className="mx-auto max-w-2xl px-4 py-20 text-center">
      <h1 className="text-3xl">Debate not found</h1>
      <Link to="/" className="mt-4 inline-block font-bold text-primary underline">
        Back to the feed
      </Link>
    </div>
  ),
  component: TopicPage,
});

function TopicPage() {
  const { id } = Route.useParams();
  const { data: topic } = useSuspenseQuery(topicQuery(id));
  const { user } = useAuth();

  if (!topic) return null;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <Link
        to="/"
        className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Feed
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
      {topic.description ? <p className="text-muted-foreground">{topic.description}</p> : null}

      <Discussion topic={topic} user={user} />
    </div>
  );
}
