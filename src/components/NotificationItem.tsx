import { Link } from "@tanstack/react-router";
import { CornerDownRight, Megaphone, ThumbsDown, ThumbsUp, type LucideIcon } from "lucide-react";
import type { NotificationKind, NotificationRow } from "@/hooks/useNotifications";
import { useT } from "@/lib/i18n";

const ICONS: Record<NotificationKind, LucideIcon> = {
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

export function useRelativeTime() {
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
export function notificationPreview(row: NotificationRow) {
  if (row.kind === "topic_published") return row.topic_title;
  return row.subject_body;
}

/**
 * One row, shared by the bell's dropdown and the full "/notifications" page
 * so the icon/title/preview logic and the read-state click behavior live in
 * exactly one place.
 */
export function NotificationItem({
  row,
  onNavigate,
  onMarkRead,
}: {
  row: NotificationRow;
  onNavigate?: () => void;
  onMarkRead: (id: string) => void;
}) {
  const t = useT();
  const relative = useRelativeTime();
  const Icon = ICONS[row.kind];
  const body = notificationPreview(row);

  return (
    <li>
      <Link
        to="/topic/$id"
        params={{ id: row.topic_id }}
        {...(row.comment_id ? { hash: `comment-${row.comment_id}` } : {})}
        onClick={() => {
          onNavigate?.();
          if (!row.read_at) onMarkRead(row.id);
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
            {t(TITLE_KEYS[row.kind], { actor: row.actor_name ?? t("notif.someone") })}
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
          <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
        )}
      </Link>
    </li>
  );
}
