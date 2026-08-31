import { useCallback, useEffect, useMemo } from "react";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  notificationsPageFilter,
  nextNotificationsCursor,
  type NotificationsCursor,
} from "@/lib/notifications-cursor";

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

/** The "/notifications" page pages through everything by keyset cursor. */
const FEED_PAGE_SIZE = 20;

type NotificationsFeedPage = { rows: NotificationRow[]; next: NotificationsCursor | null };

const listKey = (userId: string) => ["notifications", userId] as const;
const unreadKey = (userId: string) => ["notifications-unread", userId] as const;
const feedKey = (userId: string) => ["notifications-feed", userId] as const;

function stampMatching(
  rows: NotificationRow[],
  match: (row: NotificationRow) => boolean,
  stamp: string,
) {
  return rows.map((row) => (match(row) && !row.read_at ? { ...row, read_at: stamp } : row));
}

/**
 * Marks notifications read everywhere they can be on screen at once — the
 * bell's recent list and the full paged feed both hold their own React Query
 * cache, and a read made from either place must show up in the other without
 * waiting on the 30s staleTime.
 */
async function markNotificationsRead(
  queryClient: QueryClient,
  userId: string,
  target: string[] | "all",
) {
  const stamp = new Date().toISOString();
  const match = target === "all" ? () => true : (row: NotificationRow) => target.includes(row.id);

  queryClient.setQueryData<NotificationRow[]>(listKey(userId), (prev) =>
    prev ? stampMatching(prev, match, stamp) : prev,
  );
  queryClient.setQueryData<{ pages: NotificationsFeedPage[]; pageParams: unknown[] }>(
    feedKey(userId),
    (prev) =>
      prev && {
        ...prev,
        pages: prev.pages.map((page) => ({
          ...page,
          rows: stampMatching(page.rows, match, stamp),
        })),
      },
  );
  queryClient.setQueryData<number>(unreadKey(userId), (prev) =>
    target === "all" ? 0 : Math.max(0, (prev ?? 0) - target.length),
  );

  const query = supabase.from("notifications").update({ read_at: stamp }).is("read_at", null);
  const { error } =
    target === "all" ? await query.eq("user_id", userId) : await query.in("id", target);

  if (error) {
    void queryClient.invalidateQueries({ queryKey: listKey(userId) });
    void queryClient.invalidateQueries({ queryKey: feedKey(userId) });
    void queryClient.invalidateQueries({ queryKey: unreadKey(userId) });
  }
}

/**
 * Inbox for replies, reactions on your takes, and your suggestions going live.
 *
 * Rows arrive over realtime, which carries the raw table row rather than the
 * joined shape the list renders, so an event refetches instead of patching the
 * cache — debounced, because a bot batch can land a dozen reactions at once.
 * This is the only place that subscribes: `SiteHeader` mounts the bell (and
 * so this hook) on every route, including "/notifications", so the paged feed
 * hook below rides the same subscription instead of opening a second one.
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
        void queryClient.invalidateQueries({ queryKey: feedKey(userId) });
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
      await markNotificationsRead(queryClient, userId, ids);
    },
    [userId, queryClient],
  );

  const markAllRead = useCallback(async () => {
    if (!userId) return;
    await markNotificationsRead(queryClient, userId, "all");
  }, [userId, queryClient]);

  return {
    items: listQuery.data ?? [],
    unread: unreadQuery.data ?? 0,
    loading: listQuery.isLoading,
    markRead,
    markAllRead,
  };
}

/**
 * Everything, paged by keyset cursor — backs the full "/notifications" page.
 * Same ordering and tiebreak as the comments and browse feeds (see
 * notifications-cursor.ts): `created_at desc, id desc`.
 */
export function useNotificationsFeed(user: User | null) {
  const queryClient = useQueryClient();
  const userId = user?.id ?? null;

  const feedQuery = useInfiniteQuery({
    queryKey: feedKey(userId ?? "anon"),
    enabled: Boolean(userId),
    initialPageParam: null as NotificationsCursor | null,
    getNextPageParam: (last: NotificationsFeedPage) => last.next,
    queryFn: async ({ pageParam }: { pageParam: NotificationsCursor | null }) => {
      let query = supabase.from("notification_feed").select(COLUMNS);

      const filter = notificationsPageFilter(pageParam);
      if (filter) query = query.or(filter);

      const { data, error } = await query
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(FEED_PAGE_SIZE);
      if (error) throw error;
      const rows = (data ?? []) as NotificationRow[];
      return { rows, next: nextNotificationsCursor(rows, FEED_PAGE_SIZE) };
    },
  });

  const items = useMemo(
    () => (feedQuery.data?.pages ?? []).flatMap((page) => page.rows),
    [feedQuery.data?.pages],
  );

  const markRead = useCallback(
    async (ids: string[]) => {
      if (!userId || ids.length === 0) return;
      await markNotificationsRead(queryClient, userId, ids);
    },
    [userId, queryClient],
  );

  const markAllRead = useCallback(async () => {
    if (!userId) return;
    await markNotificationsRead(queryClient, userId, "all");
  }, [userId, queryClient]);

  return {
    items,
    loading: feedQuery.isLoading,
    hasNextPage: feedQuery.hasNextPage,
    isFetchingNextPage: feedQuery.isFetchingNextPage,
    fetchNextPage: feedQuery.fetchNextPage,
    markRead,
    markAllRead,
  };
}
