import { useState } from "react";
import { Link } from "@tanstack/react-router";
import type { User } from "@supabase/supabase-js";
import { Bell, CornerDownRight, Megaphone, ThumbsDown, ThumbsUp } from "lucide-react";
import {
  useNotifications,
  type NotificationKind,
  type NotificationRow,
} from "@/hooks/useNotifications";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

const ICONS: Record<NotificationKind, typeof Bell> = {
  reply: CornerDownRight,
  like: ThumbsUp,
  dislike: ThumbsDown,
  topic_published: Megaphone,
};

const TITLE_KEYS = {
  reply: "notif.reply",
  like: "notif.like",
  dislike: "notif.dislike",
  topic_published: "notif.topicPublished",
} as const;

function useRelativeTime() {
  const t = useT();
  return (iso: string) => {
    const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
    if (minutes < 1) return t("notif.justNow");
    if (minutes < 60) return t("notif.minutesAgo", { n: minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t("notif.hoursAgo", { n: hours });
    return t("notif.daysAgo", { n: Math.floor(hours / 24) });
  };
}

/**
 * The line under the headline: what was said. For a reply that is the reply
 * itself, for a reaction it is the take that got hit.
 */
function preview(row: NotificationRow) {
  if (row.kind === "topic_published") return row.topic_title;
  return row.subject_body;
}

export function NotificationBell({ user }: { user: User | null }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const { items, unread, loading, markRead, markAllRead } = useNotifications(user);
  const relative = useRelativeTime();

  if (!user) return null;

  const badge = unread > 99 ? "99+" : String(unread);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="relative px-2"
          aria-label={
            unread > 0
              ? `${t("notif.open")} — ${t("notif.unreadBadge", { n: unread })}`
              : t("notif.open")
          }
        >
          <Bell className="h-4 w-4" />
          {unread > 0 ? (
            <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-primary px-1 text-[10px] font-bold leading-4 text-primary-foreground">
              {badge}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 p-0 sm:w-96">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-sm font-semibold">{t("notif.title")}</span>
          {unread > 0 ? (
            <button
              type="button"
              onClick={() => void markAllRead()}
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              {t("notif.markAllRead")}
            </button>
          ) : null}
        </div>

        <ScrollArea className="max-h-96">
          {loading ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">…</p>
          ) : items.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              {t("notif.empty")}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((row) => {
                const Icon = ICONS[row.kind];
                const body = preview(row);
                return (
                  <li key={row.id}>
                    <Link
                      to="/topic/$id"
                      params={{ id: row.topic_id }}
                      {...(row.comment_id ? { hash: `comment-${row.comment_id}` } : {})}
                      onClick={() => {
                        setOpen(false);
                        if (!row.read_at) void markRead([row.id]);
                      }}
                      className={`flex gap-3 px-3 py-3 transition-colors hover:bg-accent/50 ${
                        row.read_at ? "" : "bg-accent/25"
                      }`}
                    >
                      <Icon
                        className={`mt-0.5 h-4 w-4 shrink-0 ${
                          row.kind === "dislike" ? "text-side-b" : "text-primary"
                        }`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-foreground">
                          {t(TITLE_KEYS[row.kind], {
                            actor: row.actor_name ?? t("notif.someone"),
                          })}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {body ?? t("notif.deleted")}
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                          {row.kind === "topic_published" ? null : (
                            <span className="min-w-0 truncate font-medium">{row.topic_title}</span>
                          )}
                          <span>{relative(row.created_at)}</span>
                        </span>
                      </span>
                      {row.read_at ? null : (
                        <span
                          aria-hidden
                          className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary"
                        />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
