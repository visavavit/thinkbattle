import { useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type NotificationKind = "reply" | "like" | "dislike" | "topic_published";

export type NotificationRow = {
  id: string;
  kind: NotificationKind;
  topic_id: string;
  comment_id: string | null;
  parent_comment_id: string | null;
  read_at: string | null;
  created_at: string;
  actor_id: string | null;
  actor_name: string | null;
  topic_title: string | null;
  subject_body: string | null;
  context_body: string | null;
};

const COLUMNS =
  "id, kind, topic_id, comment_id, parent_comment_id, read_at, created_at, actor_id, actor_name, topic_title, subject_body, context_body";

/** The bell only ever shows a recent window; the badge counts everything. */
const PAGE_SIZE = 30;

const listKey = (userId: string) => ["notifications", userId] as const;
const unreadKey = (userId: string) => ["notifications-unread", userId] as const;

/**
 * Inbox for replies, reactions on your takes, and your suggestions going live.
 *
 * Rows arrive over realtime, which carries the raw table row rather than the
 * joined shape the list renders, so an event refetches instead of patching the
 * cache — debounced, because a bot batch can land a dozen reactions at once.
 */
export function useNotifications(user: User | null) {
  const queryClient = useQueryClient();
  const userId = user?.id ?? null;

  const listQuery = useQuery({
    queryKey: listKey(userId ?? "anon"),
    enabled: Boolean(userId),
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_feed")
        .select(COLUMNS)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);
      if (error) throw error;
      return (data ?? []) as NotificationRow[];
    },
  });

  const unreadQuery = useQuery({
    queryKey: unreadKey(userId ?? "anon"),
    enabled: Boolean(userId),
    staleTime: 30_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId!)
        .is("read_at", null);
      if (error) throw error;
      return count ?? 0;
    },
  });

  useEffect(() => {
    if (!userId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const refresh = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        void queryClient.invalidateQueries({ queryKey: listKey(userId) });
        void queryClient.invalidateQueries({ queryKey: unreadKey(userId) });
      }, 400);
    };

    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        refresh,
      )
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  const markRead = useCallback(
    async (ids: string[]) => {
      if (!userId || ids.length === 0) return;
      const stamp = new Date().toISOString();

      queryClient.setQueryData<NotificationRow[]>(listKey(userId), (prev) =>
        prev?.map((row) =>
          ids.includes(row.id) && !row.read_at ? { ...row, read_at: stamp } : row,
        ),
      );
      queryClient.setQueryData<number>(unreadKey(userId), (prev) =>
        Math.max(0, (prev ?? 0) - ids.length),
      );

      const { error } = await supabase
        .from("notifications")
        .update({ read_at: stamp })
        .in("id", ids)
        .is("read_at", null);

      if (error) {
        void queryClient.invalidateQueries({ queryKey: listKey(userId) });
        void queryClient.invalidateQueries({ queryKey: unreadKey(userId) });
      }
    },
    [userId, queryClient],
  );

  const markAllRead = useCallback(async () => {
    if (!userId) return;
    const stamp = new Date().toISOString();

    queryClient.setQueryData<NotificationRow[]>(listKey(userId), (prev) =>
      prev?.map((row) => (row.read_at ? row : { ...row, read_at: stamp })),
    );
    queryClient.setQueryData<number>(unreadKey(userId), 0);

    const { error } = await supabase
      .from("notifications")
      .update({ read_at: stamp })
      .eq("user_id", userId)
      .is("read_at", null);

    if (error) {
      void queryClient.invalidateQueries({ queryKey: listKey(userId) });
      void queryClient.invalidateQueries({ queryKey: unreadKey(userId) });
    }
  }, [userId, queryClient]);

  return {
    items: listQuery.data ?? [],
    unread: unreadQuery.data ?? 0,
    loading: listQuery.isLoading,
    markRead,
    markAllRead,
  };
}
