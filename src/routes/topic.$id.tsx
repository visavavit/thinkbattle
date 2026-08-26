import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { getSiteFlags, getTopic, type SiteFlags } from "@/lib/public.functions";
import { Discussion } from "@/components/Discussion";
import { useAuth } from "@/hooks/useAuth";
import { translate as tr, useT } from "@/lib/i18n";
import { coverSrcSet } from "@/lib/images";
import { ClosingBadge } from "@/components/TopicDeadline";
import { seoTags } from "@/lib/site";
import { readClock } from "@/lib/topic-clock";

const topicQuery = (id: string) =>
  queryOptions({
    queryKey: ["topic", id],
    queryFn: () => getTopic({ data: { id } }),
  });

/**
 * Feature switches. Global and identical for every visitor, so this rides
 * along in the shared document and costs the browser no extra request — see
 * getSiteFlags. It is deliberately not per-device state: nothing that varies
 * by reader may enter the SSR path, or it lands in the shared edge cache.
 */
const siteFlagsQuery = queryOptions({
  queryKey: ["site-flags"],
  queryFn: () => getSiteFlags(),
  staleTime: 5 * 60_000,
});

const FLAGS_OFF: SiteFlags = { guest_voting: false, comment_images: false };

export const Route = createFileRoute("/topic/$id")({
  loader: async ({ context, params }) => {
    const [topic] = await Promise.all([
      context.queryClient.ensureQueryData(topicQuery(params.id)),
      context.queryClient.ensureQueryData(siteFlagsQuery),
    ]);
    if (!topic) throw notFound();
    return {
      id: topic.id,
      title: topic.title,
      choiceA: topic.choice_a,
      choiceB: topic.choice_b,
      cover: topic.cover_image_url,
      closesAt: topic.closes_at,
      votesA: topic.votes_a,
      votesB: topic.votes_b,
    };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [{ title: tr("meta.topic.unavailable") }, { name: "robots", content: "noindex" }],
      };
    }
    // Rendered HTML for an anonymous request is edge-cached briefly
    // (see server.ts), so a closed topic's frozen numbers are safe to bake
    // into the description — an open topic's live tallies are not: they
    // would mint scraper-cache entries carrying numbers already stale by the
    // time LINE or X actually fetch them. See stillOpen() in
    // public.functions.ts for the same reasoning applied to caching reads.
    const closed = readClock(loaderData.closesAt).isClosed;
    const total = loaderData.votesA + loaderData.votesB;
    const pctA = total === 0 ? 50 : Math.round((100 * loaderData.votesA) / total);

    const title = closed
      ? tr("meta.topic.resultTitle", { title: loaderData.title })
      : `${loaderData.title} — ถกเถียง`;
    const description = closed
      ? total === 0
        ? tr("meta.topic.resultDescriptionEmpty", { a: loaderData.choiceA, b: loaderData.choiceB })
        : tr("meta.topic.resultDescription", {
            a: loaderData.choiceA,
            aPct: pctA,
            b: loaderData.choiceB,
            bPct: 100 - pctA,
            n: total,
          })
      : tr("meta.topic.description", { a: loaderData.choiceA, b: loaderData.choiceB });
    // A debate's cover is its share card; topics without one fall back to the
    // site card so a share is never a bare text link. Closed or open, the
    // card image itself does not change — only the title/description above.
    const seo = seoTags(`/topic/${loaderData.id}`, loaderData.cover);
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "article" },
        { name: "twitter:card", content: "summary_large_image" },
        ...seo.meta,
      ],
      links: seo.links,
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
  const { data: flags = FLAGS_OFF } = useSuspenseQuery(siteFlagsQuery);
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
        <ClosingBadge closesAt={topic.closes_at} />
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

      <Discussion
        topic={topic}
        user={user}
        guestVoting={flags.guest_voting}
        commentImages={flags.comment_images}
      />
    </div>
  );
}
