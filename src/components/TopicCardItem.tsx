import { Link } from "@tanstack/react-router";
import { Flame, MessageSquare, Users } from "lucide-react";
import type { TopicCard } from "@/lib/public.functions";
import { SplitBar } from "./SplitBar";

export function TopicCardItem({ topic }: { topic: TopicCard }) {
  return (
    <Link
      to="/topic/$id"
      params={{ id: topic.id }}
      className="arena-panel group flex flex-col overflow-hidden transition-shadow hover:shadow-md"
    >
      {topic.cover_image_url ? (
        <img
          src={topic.cover_image_url}
          alt={topic.title}
          loading="lazy"
          width={1200}
          height={675}
          className="aspect-[16/9] w-full object-cover"
        />
      ) : null}

      <div className="flex flex-1 flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        {topic.category_name ? (
          <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
            {topic.category_emoji} {topic.category_name}
          </span>
        ) : null}
        {(topic.tags ?? []).slice(0, 3).map((tag) => (
          <span
            key={tag}
            className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
          >
            #{tag}
          </span>
        ))}
      </div>

      <h3 className="text-xl leading-tight group-hover:text-primary">{topic.title}</h3>

      <SplitBar
        pctA={topic.pct_a}
        countA={topic.votes_a}
        countB={topic.votes_b}
        labelA={topic.choice_a}
        labelB={topic.choice_b}
      />

      <div className="mt-auto flex items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Users className="h-3.5 w-3.5" /> {topic.total_votes} votes
        </span>
        <span className="inline-flex items-center gap-1">
          <MessageSquare className="h-3.5 w-3.5" /> {topic.comments_count}
        </span>
        <span className="inline-flex items-center gap-1 text-side-b">
          <Flame className="h-3.5 w-3.5" /> {topic.wild_takes_count} wild
        </span>
      </div>
      </div>
    </Link>
  );
}
