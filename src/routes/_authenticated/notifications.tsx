import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useNotificationsFeed } from "@/hooks/useNotifications";
import { NotificationItem } from "@/components/NotificationItem";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({
    meta: [{ title: "การแจ้งเตือน — ถกเถียง" }, { name: "robots", content: "noindex" }],
  }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const t = useT();
  const { user } = useAuth();
  const { items, loading, hasNextPage, isFetchingNextPage, fetchNextPage, markRead, markAllRead } =
    useNotificationsFeed(user);

  const unreadCount = items.filter((row) => !row.read_at).length;

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-8">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-bold tracking-tight">{t("notif.title")}</h1>
        {unreadCount > 0 ? (
          <button
            type="button"
            onClick={() => void markAllRead()}
            className="text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            {t("notif.markAllRead")}
          </button>
        ) : null}
      </header>

      <div className="overflow-hidden rounded-lg border border-border">
        {loading ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">
            {t("notif.loading")}
          </p>
        ) : items.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">{t("notif.empty")}</p>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((row) => (
              <NotificationItem key={row.id} row={row} onMarkRead={(id) => void markRead([id])} />
            ))}
          </ul>
        )}
      </div>

      {hasNextPage ? (
        <div className="flex justify-center">
          <Button
            variant="outline"
            disabled={isFetchingNextPage}
            onClick={() => void fetchNextPage()}
          >
            {isFetchingNextPage ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t("notif.loadMore")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
