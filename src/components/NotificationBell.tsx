import { useState } from "react";
import { Link } from "@tanstack/react-router";
import type { User } from "@supabase/supabase-js";
import { Bell } from "lucide-react";
import { useNotifications } from "@/hooks/useNotifications";
import { NotificationItem } from "@/components/NotificationItem";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

export function NotificationBell({ user }: { user: User | null }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const { items, unread, loading, markRead, markAllRead } = useNotifications(user);

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
              {items.map((row) => (
                <NotificationItem
                  key={row.id}
                  row={row}
                  onNavigate={() => setOpen(false)}
                  onMarkRead={(id) => void markRead([id])}
                />
              ))}
            </ul>
          )}
        </ScrollArea>

        <Link
          to="/notifications"
          onClick={() => setOpen(false)}
          className="block border-t border-border px-3 py-2 text-center text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          {t("notif.viewAll")}
        </Link>
      </PopoverContent>
    </Popover>
  );
}
