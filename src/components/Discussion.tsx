import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "@tanstack/react-router";
import {
  Check,
  Clock,
  Flag,
  Flame,
  MessagesSquare,
  Star,
  ThumbsDown,
  ThumbsUp,
  Lock,
  EyeOff,
  Trash2,
  Reply,
} from "lucide-react";
import { toast } from "sonner";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useBanStatus, useIsAdmin } from "@/hooks/useAuth";
import { describeError } from "@/lib/admin";
import { useI18n, useT, type TranslationKey } from "@/lib/i18n";
import { getTopicCounts, type TopicCard } from "@/lib/public.functions";
import { useTopicClock } from "@/lib/topic-clock";
import { ClosingNotice, DeadlineLine } from "./TopicDeadline";
import { SplitBar } from "./SplitBar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Side = "a" | "b";
type SortKey = "top" | "wild" | "newest";

type CommentRow = {
  id: string;
  topic_id: string;
  user_id: string;
  side: string;
  body: string;
  likes_count: number;
  dislikes_count: number;
  controversy_score: number;
  is_hidden: boolean;
  hidden_reason: string | null;
  created_at: string;
  parent_id: string | null;
};

/** What the ["comments", topicId, limit] query holds. */
type CommentsCache = {
  rows: CommentRow[];
  authors: Map<string, string>;
  /** true when the server had a full page left, so there is more to load */
  hasMore: boolean;
};

/**
 * How many top-level takes a page of the discussion loads. Replies are fetched
 * for the parents on screen, so this bounds the payload without ever splitting
 * a take from its answers.
 */
const COMMENT_PAGE_SIZE = 50;


const SORTS: { key: SortKey; labelKey: TranslationKey; icon: typeof Star }[] = [
  { key: "top", labelKey: "sort.top", icon: Star },
  { key: "wild", labelKey: "sort.wild", icon: Flame },
  { key: "newest", labelKey: "sort.newest", icon: Clock },
];

export function Discussion({ topic, user }: { topic: TopicCard; user: User | null }) {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const isAdmin = useIsAdmin(user);
  const { isBanned, reason: banReason } = useBanStatus(user);
  // flips on its own the moment the deadline passes, so a reader who has had
  // the page open since before it closed stops being offered the vote buttons
  const clock = useTopicClock(topic.closes_at);
  const isClosed = clock.isClosed;
  const [votesA, setVotesA] = useState(topic.votes_a);
  const [votesB, setVotesB] = useState(topic.votes_b);
  const [myVote, setMyVote] = useState<Side | null>(null);
  // which column is on screen below lg, where only one fits at a time
  const [activeSide, setActiveSide] = useState<Side>("a");
  const columnsRef = useRef<HTMLDivElement>(null);

  const selectSide = useCallback((side: Side) => {
    setActiveSide(side);
    // both columns share one document scroll, so swapping a long column for a
    // short one can strand the reader past the end of the new list
    const el = columnsRef.current;
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: "start" });
  }, []);

  useEffect(() => {
    setVotesA(topic.votes_a);
    setVotesB(topic.votes_b);
  }, [topic.votes_a, topic.votes_b]);

  // open on the side the reader voted for — it's the only one they can post in
  useEffect(() => {
    if (myVote) setActiveSide(myVote);
  }, [myVote]);

  useEffect(() => {
    if (!user) {
      setMyVote(null);
      return;
    }
    let active = true;
    supabase
      .from("votes")
      .select("choice")
      .eq("topic_id", topic.id)
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (active) setMyVote((data?.choice as Side | undefined) ?? null);
      });
    return () => {
      active = false;
    };
  }, [user, topic.id]);

  // A viral topic can hold thousands of takes; the discussion loads a page at a
  // time rather than the whole thread on every mount.
  const [limit, setLimit] = useState(COMMENT_PAGE_SIZE);
  useEffect(() => {
    setLimit(COMMENT_PAGE_SIZE);
  }, [topic.id]);

  const commentsKey = useMemo(() => ["comments", topic.id, limit] as const, [topic.id, limit]);

  const commentsQuery = useQuery<CommentsCache>({
    queryKey: commentsKey,
    // keeps the current page on screen while a longer one loads
    placeholderData: keepPreviousData,
    queryFn: async () => {
      // Top-level takes are the paged unit. Replies are then fetched for
      // exactly those parents, so a reply can never load without its parent.
      const { data: tops, error } = await supabase
        .from("comments")
        .select("*")
        .eq("topic_id", topic.id)
        .is("parent_id", null)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      const topRows = (tops ?? []) as CommentRow[];

      let replyRows: CommentRow[] = [];
      if (topRows.length > 0) {
        const { data: replies, error: replyError } = await supabase
          .from("comments")
          .select("*")
          .eq("topic_id", topic.id)
          .in(
            "parent_id",
            topRows.map((r) => r.id),
          );
        if (replyError) throw replyError;
        replyRows = (replies ?? []) as CommentRow[];
      }

      const rows = [...topRows, ...replyRows];
      const ids = [...new Set(rows.map((r) => r.user_id))];
      const authors = new Map<string, string>();
      if (ids.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, username")
          .in("id", ids);
        for (const p of profiles ?? []) authors.set(p.id, p.username);
      }
      return { rows, authors, hasMore: topRows.length === limit };
    },
  });

  // A notification links straight at a take: /topic/$id#comment-<uuid>. The
  // target can sit past the loaded page, or in the column that is collapsed on
  // mobile, so resolve both before scrolling.
  const { hash } = useLocation();
  const targetId = hash?.startsWith("comment-") ? hash.slice("comment-".length) : null;
  const expandedFor = useRef<{ id: string; times: number } | null>(null);
  const revealedFor = useRef<string | null>(null);

  useEffect(() => {
    const rows = commentsQuery.data?.rows;
    if (!targetId || !rows) return;

    const target = rows.find((r) => r.id === targetId);
    if (!target) {
      // older than the page we hold — reach back for it, but not forever
      if (!commentsQuery.data?.hasMore) return;
      const seen = expandedFor.current;
      const times = seen?.id === targetId ? seen.times : 0;
      if (times >= 3) return;
      expandedFor.current = { id: targetId, times: times + 1 };
      setLimit((n) => n + COMMENT_PAGE_SIZE * 2);
      return;
    }

    // jump once per link: a take posted live while reading must not yank the
    // page back to the notification target
    if (revealedFor.current === targetId) return;
    revealedFor.current = targetId;

    // a reply lives under its parent, which is what decides the column
    const parent = target.parent_id ? rows.find((r) => r.id === target.parent_id) : target;
    if (parent) setActiveSide(parent.side as Side);

    // the column may need a paint to un-hide before it can be scrolled to
    let tries = 8;
    let timer: ReturnType<typeof setTimeout>;
    const reveal = () => {
      const el = document.getElementById(`comment-${targetId}`);
      if (!el || el.offsetParent === null) {
        if (tries-- > 0) timer = setTimeout(reveal, 60);
        return;
      }
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.classList.add("ring-2", "ring-primary");
      timer = setTimeout(() => el.classList.remove("ring-2", "ring-primary"), 2500);
    };
    timer = setTimeout(reveal, 0);
    return () => clearTimeout(timer);
  }, [targetId, commentsQuery.data]);

  // who has since voted for the other side — powers the "Changed their mind" badge
  const authorSidesQuery = useQuery({
    queryKey: ["comment-author-sides", topic.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("topic_comment_authors", {
        _topic_id: topic.id,
      });
      if (error) throw error;
      const map: Record<string, Side> = {};
      for (const row of data ?? []) map[row.user_id] = row.choice as Side;
      return map;
    },
  });

  const reactionsQuery = useQuery({

    queryKey: ["reactions", topic.id, user?.id ?? "anon"],
    enabled: Boolean(user),
    queryFn: async () => {
      const ids = (commentsQuery.data?.rows ?? []).map((r) => r.id);
      if (ids.length === 0) return {} as Record<string, number>;
      const { data } = await supabase
        .from("comment_reactions")
        .select("comment_id, value")
        .eq("user_id", user!.id)
        .in("comment_id", ids);
      const map: Record<string, number> = {};
      for (const r of data ?? []) map[r.comment_id] = r.value;
      return map;
    },
  });

  // Vote tallies are polled from a short-lived cached endpoint rather than
  // pushed over a subscription: that costs one database read per topic per
  // window no matter how many readers have the page open.
  const lastLocalVoteAt = useRef(0);
  const countsQuery = useQuery({
    queryKey: ["topic-counts", topic.id],
    queryFn: () => getTopicCounts({ data: { id: topic.id } }),
    initialData: { votes_a: topic.votes_a, votes_b: topic.votes_b },
    // The rendered document is shared and may have been cached for a while, so
    // treat its tally as already stale: one fetch on mount corrects it before
    // the reader has time to read the numbers off the bar.
    initialDataUpdatedAt: 0,
    // nothing can move the tally on a closed debate, so stop asking
    refetchInterval: isClosed ? false : 15_000,
    refetchIntervalInBackground: false,
    staleTime: 10_000,
  });


  useEffect(() => {
    const counts = countsQuery.data;
    if (!counts) return;
    // That endpoint is cached, so for a few seconds after the reader votes it
    // can still be serving pre-vote numbers. Leave the optimistic figures in
    // place until the cache has certainly turned over — otherwise the reader
    // watches their own vote bounce back off the tally.
    if (Date.now() - lastLocalVoteAt.current < 30_000) return;
    setVotesA(counts.votes_a);
    setVotesB(counts.votes_b);
  }, [countsQuery.data]);

  // The realtime channel writes into whichever page is currently loaded. Held
  // in a ref so paging through the thread does not tear down the socket.
  const commentsKeyRef = useRef(commentsKey);
  useEffect(() => {
    commentsKeyRef.current = commentsKey;
  }, [commentsKey]);

  // Only signed-in readers hold a socket. Anonymous scanners are the bulk of
  // the traffic at scale, and giving each one a subscription — which then made
  // every one of them re-download the entire thread on every new comment — is
  // what turns a popular topic into an outage.
  useEffect(() => {
    if (!user) return;

    const missingAuthors = new Set<string>();
    let authorTimer: ReturnType<typeof setTimeout> | undefined;
    let sidesTimer: ReturnType<typeof setTimeout> | undefined;

    // A pushed row carries no author name. Collect the unknown ids and resolve
    // them in one batched lookup instead of refetching the thread for a name.
    const flushAuthors = () => {
      authorTimer = undefined;
      const ids = [...missingAuthors];
      missingAuthors.clear();
      if (ids.length === 0) return;
      void supabase
        .from("profiles")
        .select("id, username")
        .in("id", ids)
        .then(({ data }) => {
          if (!data || data.length === 0) return;
          queryClient.setQueryData<CommentsCache>(commentsKeyRef.current, (prev) => {
            if (!prev) return prev;
            const authors = new Map(prev.authors);
            for (const row of data) authors.set(row.id, row.username);
            return { ...prev, authors };
          });
        });
    };

    const noteAuthor = (id: string) => {
      const cache = queryClient.getQueryData<CommentsCache>(commentsKeyRef.current);
      if (cache?.authors.has(id)) return;
      missingAuthors.add(id);
      authorTimer ??= setTimeout(flushAuthors, 500);
    };

    // The changed-their-mind badge is the one thing here that still needs a
    // round trip, so it is debounced well past the rate a busy thread fires.
    const scheduleSides = () => {
      if (sidesTimer) return;
      sidesTimer = setTimeout(() => {
        sidesTimer = undefined;
        void queryClient.invalidateQueries({ queryKey: ["comment-author-sides", topic.id] });
      }, 5_000);
    };

    const channel = supabase
      .channel(`topic-${topic.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "comments", filter: `topic_id=eq.${topic.id}` },
        (payload) => {
          const newRow = payload.new as unknown as CommentRow | null;
          const oldRow = payload.old as unknown as { id?: string } | null;

          // The event already carries the row, so apply it straight to the
          // cache. Invalidating instead is what caused the stampede.
          queryClient.setQueryData<CommentsCache>(commentsKeyRef.current, (prev) => {
            if (!prev) return prev;

            if (payload.eventType === "DELETE") {
              if (!oldRow?.id) return prev;
              return { ...prev, rows: prev.rows.filter((r) => r.id !== oldRow.id) };
            }

            if (!newRow?.id) return prev;
            const index = prev.rows.findIndex((r) => r.id === newRow.id);
            if (index === -1) {
              return { ...prev, rows: [newRow, ...prev.rows] };
            }
            const rows = [...prev.rows];
            rows[index] = newRow;
            return { ...prev, rows };
          });

          if (payload.eventType === "INSERT" && newRow?.user_id) {
            noteAuthor(newRow.user_id);
            scheduleSides();
          }
        },
      )
      .subscribe();

    return () => {
      if (authorTimer) clearTimeout(authorTimer);
      if (sidesTimer) clearTimeout(sidesTimer);
      supabase.removeChannel(channel);
    };
  }, [user, topic.id, queryClient]);

  const total = votesA + votesB;
  const pctA = total === 0 ? 50 : Math.round((100 * votesA) / total);

  const applyVote = useCallback(
    async (choice: Side) => {
      if (!user) return;
      if (isClosed) {
        toast.error(t("vote.closed"));
        return;
      }
      if (isBanned) {
        toast.error(t("vote.suspendedVote"));
        return;
      }
      const previous = myVote;
      if (previous === choice) return;
      setMyVote(choice);
      // marks the optimistic tally as newer than anything the cached counts
      // endpoint can currently be serving
      lastLocalVoteAt.current = Date.now();
      setVotesA((v) => v + (choice === "a" ? 1 : 0) - (previous === "a" ? 1 : 0));
      setVotesB((v) => v + (choice === "b" ? 1 : 0) - (previous === "b" ? 1 : 0));

      const { error } = await supabase
        .from("votes")
        .upsert(
          { topic_id: topic.id, user_id: user.id, choice },
          { onConflict: "topic_id,user_id" },
        );
      if (error) {
        setMyVote(previous);
        setVotesA(topic.votes_a);
        setVotesB(topic.votes_b);
        toast.error(t("vote.failed"));
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["comment-author-sides", topic.id] });
      if (previous && previous !== choice) {
        toast.success(t("vote.switched"));
        queryClient.invalidateQueries({ queryKey: ["comments", topic.id] });
      }
    },
    [user, isClosed, isBanned, myVote, topic.id, topic.votes_a, topic.votes_b, queryClient, t],
  );

  // switching sides is not reversible for the reader's own history, so it is
  // always confirmed rather than fired straight off the vote button
  const [pendingSide, setPendingSide] = useState<Side | null>(null);

  const castVote = useCallback(
    (choice: Side) => {
      if (!user || isClosed) return;
      if (myVote && myVote !== choice) {
        setPendingSide(choice);
        return;
      }
      void applyVote(choice);
    },
    [user, isClosed, myVote, applyVote],
  );


  const react = useCallback(
    async (commentId: string, value: 1 | -1) => {
      if (!user) {
        toast.error(t("vote.signInToReact"));
        return;
      }
      if (isClosed) {
        toast.error(t("vote.closedReact"));
        return;
      }
      if (isBanned) {
        toast.error(t("vote.suspendedReact"));
        return;
      }
      const current = reactionsQuery.data?.[commentId];
      if (current === value) {
        await supabase
          .from("comment_reactions")
          .delete()
          .eq("comment_id", commentId)
          .eq("user_id", user.id);
      } else {
        await supabase
          .from("comment_reactions")
          .upsert(
            { comment_id: commentId, user_id: user.id, value },
            { onConflict: "comment_id,user_id" },
          );
      }
      queryClient.invalidateQueries({ queryKey: ["reactions", topic.id, user.id] });
      queryClient.invalidateQueries({ queryKey: ["comments", topic.id] });
    },
    [user, isClosed, isBanned, reactionsQuery.data, queryClient, topic.id, t],
  );

  const authors = commentsQuery.data?.authors ?? new Map<string, string>();
  const authorSides = authorSidesQuery.data ?? {};

  // replies live under their parent take, never in the ranked column lists
  const [rowsA, rowsB, repliesByParent] = useMemo(() => {
    const all = commentsQuery.data?.rows ?? [];
    const tops = all.filter((r) => !r.parent_id);
    const map: Record<string, CommentRow[]> = {};
    for (const r of all) {
      if (!r.parent_id) continue;
      (map[r.parent_id] ??= []).push(r);
    }
    for (const list of Object.values(map)) {
      list.sort((x, y) => x.created_at.localeCompare(y.created_at));
    }
    return [tops.filter((r) => r.side === "a"), tops.filter((r) => r.side === "b"), map];
  }, [commentsQuery.data?.rows]);


  const myOldTakes = useMemo(() => {
    if (!user || !myVote) return 0;
    return (commentsQuery.data?.rows ?? []).filter(
      (r) => r.user_id === user.id && r.side === myVote,
    ).length;
  }, [commentsQuery.data?.rows, user, myVote]);


  return (
    <div className="space-y-8">
      {isBanned ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="font-bold text-destructive">{t("ban.title")}</p>
          <p className="mt-1 text-muted-foreground">
            {t("ban.body")}
            {banReason ? t("ban.reason", { reason: banReason }) : ""}
          </p>
        </div>
      ) : null}

      <ClosingNotice clock={clock} />

      <section className="arena-panel p-5">
        <SplitBar
          pctA={pctA}
          countA={votesA}
          countB={votesB}
          labelA={topic.choice_a}
          labelB={topic.choice_b}
          myVote={myVote}
          size="lg"
        />
        {/* Below sm the vote buttons stack into the same shape as the comment
            side switcher further down, and both carry the same two side
            labels. This says which one of them casts the vote. */}
        {/* A closed debate keeps the split and the labels but drops the vote
            buttons entirely: the reader's own choice still shows on the bar
            above, and there is nothing left to press. */}
        <p className="mt-5 text-sm font-bold">
          {isClosed ? t("closing.final") : t("vote.pickHeading")}
        </p>
        {isClosed ? null : (
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <VoteButton
              side="a"
              label={topic.choice_a}
              active={myVote === "a"}
              disabled={!user}
              onClick={() => castVote("a")}
            />
            <VoteButton
              side="b"
              label={topic.choice_b}
              active={myVote === "b"}
              disabled={!user}
              onClick={() => castVote("b")}
            />
          </div>
        )}
        <p className="mt-4 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-sm text-muted-foreground">
          <span>
            {t("vote.totalVotes", { n: total })}
            {isClosed ? null : user ? (
              myVote ? (
                t("vote.canSwitch")
              ) : (
                t("vote.pickToUnlock")
              )
            ) : (
              <>
                {" — "}
                <Link to="/auth" className="font-bold text-primary underline">
                  {t("vote.signInToVote")}
                </Link>
              </>
            )}
          </span>
          <DeadlineLine clock={clock} />
        </p>
      </section>

      <SideSwitcher
        labelA={topic.choice_a}
        labelB={topic.choice_b}
        countA={rowsA.length}
        countB={rowsB.length}
        showCounts={commentsQuery.isSuccess}
        activeSide={activeSide}
        onSelect={selectSide}
      />

      {/* the sections are the grid items themselves: as direct children they
          stretch to equal height at lg, which a wrapper div would break */}
      <div ref={columnsRef} className="grid scroll-mt-28 gap-6 lg:grid-cols-2">
        <CommentColumn
          side="a"
          title={t("col.why", { label: topic.choice_a })}
          rows={rowsA}
          repliesByParent={repliesByParent}
          authors={authors}
          authorSides={authorSides}
          labelA={topic.choice_a}
          labelB={topic.choice_b}
          otherLabel={topic.choice_b}
          myVote={myVote}
          user={user}
          topicId={topic.id}
          reactions={reactionsQuery.data ?? {}}
          onReact={react}
          isAdmin={isAdmin}
          isBanned={isBanned}
          isClosed={isClosed}
          isActive={activeSide === "a"}
        />
        <CommentColumn
          side="b"
          title={t("col.why", { label: topic.choice_b })}
          rows={rowsB}
          repliesByParent={repliesByParent}
          authors={authors}
          authorSides={authorSides}
          labelA={topic.choice_a}
          labelB={topic.choice_b}
          otherLabel={topic.choice_a}
          myVote={myVote}
          user={user}
          topicId={topic.id}
          reactions={reactionsQuery.data ?? {}}
          onReact={react}
          isAdmin={isAdmin}
          isBanned={isBanned}
          isClosed={isClosed}
          isActive={activeSide === "b"}
        />

      </div>

      {commentsQuery.data?.hasMore ? (
        <div className="flex justify-center">
          <Button
            variant="outline"
            disabled={commentsQuery.isFetching}
            onClick={() => setLimit((n) => n + COMMENT_PAGE_SIZE)}
          >
            {commentsQuery.isFetching ? t("comment.loading") : t("comment.loadMore")}
          </Button>
        </div>
      ) : null}

      <Dialog open={pendingSide !== null} onOpenChange={(open) => !open && setPendingSide(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("switch.title", {
                label: pendingSide === "a" ? topic.choice_a : topic.choice_b,
              })}
            </DialogTitle>
            <DialogDescription>
              {t("switch.body")}
              {myOldTakes > 0
                ? t("switch.bodyWithTakes", {
                    n: myOldTakes,
                    label: myVote === "a" ? topic.choice_a : topic.choice_b,
                  })
                : t("switch.bodyNoTakes")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingSide(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => {
                const next = pendingSide;
                setPendingSide(null);
                if (next) void applyVote(next);
              }}
            >
              {t("switch.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


/**
 * Below lg only one column fits, so the other side would otherwise be buried
 * under a full comment list. This keeps both sides visible as a choice with
 * their counts, and collapses away entirely once both columns fit side by side.
 *
 * Deliberately not tab ARIA: at lg both panels show at once, which no tab
 * pattern allows, and this is the same DOM at every width. A pressed-toggle
 * pair is what is actually true here.
 */
function SideSwitcher({
  labelA,
  labelB,
  countA,
  countB,
  showCounts,
  activeSide,
  onSelect,
}: {
  labelA: string;
  labelB: string;
  countA: number;
  countB: number;
  showCounts: boolean;
  activeSide: Side;
  onSelect: (side: Side) => void;
}) {
  const t = useT();
  return (
    <div
      role="group"
      aria-label={t("col.showOneSide")}
      className="sticky top-14 z-30 -mx-4 border-b border-border bg-background/95 px-4 py-2 backdrop-blur lg:hidden"
    >
      {/* these pills carry the same two labels as the vote buttons above, so
          they say up front that they only pick which column you are reading */}
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <MessagesSquare className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {t("col.readingHeading")}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <SideSwitcherButton
          side="a"
          label={labelA}
          count={countA}
          showCount={showCounts}
          active={activeSide === "a"}
          onClick={() => onSelect("a")}
        />
        <SideSwitcherButton
          side="b"
          label={labelB}
          count={countB}
          showCount={showCounts}
          active={activeSide === "b"}
          onClick={() => onSelect("b")}
        />
      </div>
      {/* swapping display:none announces nothing on its own */}
      <p aria-live="polite" className="sr-only">
        {t("col.showing", { label: activeSide === "a" ? labelA : labelB })}
      </p>
    </div>
  );
}

function SideSwitcherButton({
  side,
  label,
  count,
  showCount,
  active,
  onClick,
}: {
  side: Side;
  label: string;
  count: number;
  showCount: boolean;
  active: boolean;
  onClick: () => void;
}) {
  const t = useT();
  const border = side === "a" ? "border-side-a" : "border-side-b";
  const idle = side === "a" ? "text-side-a" : "text-side-b";
  const selected =
    side === "a" ? "bg-side-a text-side-a-foreground" : "bg-side-b text-side-b-foreground";
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={t("col.readAria", { label })}
      onClick={onClick}
      className={`flex min-w-0 items-center justify-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${border} ${
        active ? selected : idle
      }`}
    >
      <span className="truncate">{label}</span>
      {/* counts arrive with the client-side comments query; rendering 0 first
          would make both pills flicker from 0 to their real value */}
      {showCount ? (
        <span
          className={`shrink-0 rounded-full px-1.5 py-0.5 text-xs font-medium tabular-nums ${
            active ? "bg-background/25" : "bg-muted text-muted-foreground"
          }`}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

function VoteButton({
  side,
  label,
  active,
  disabled,
  onClick,
}: {
  side: Side;
  label: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const t = useT();
  const base = side === "a" ? "border-side-a text-side-a" : "border-side-b text-side-b";
  const activeCls =
    side === "a" ? "bg-side-a text-side-a-foreground" : "bg-side-b text-side-b-foreground";
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={active}
      aria-label={t("vote.castAria", { label })}
      onClick={onClick}
      className={`flex min-w-0 items-center justify-center gap-2 rounded-md border-2 px-4 py-4 font-display text-xl transition-all disabled:cursor-not-allowed disabled:opacity-50 ${base} ${
        active ? activeCls : "hover:-translate-y-0.5"
      }`}
    >
      {active ? <Check className="h-5 w-5 shrink-0" /> : null}
      <span className="truncate">{label}</span>
    </button>
  );
}

function CommentColumn({
  side,
  title,
  rows,
  repliesByParent,
  authors,
  authorSides,
  labelA,
  labelB,
  otherLabel,
  myVote,
  user,
  topicId,
  reactions,
  onReact,
  isAdmin,
  isBanned,
  isClosed,
  isActive,
}: {
  side: Side;
  title: string;
  rows: CommentRow[];
  /** one level of replies, keyed by the take they answer */
  repliesByParent: Record<string, CommentRow[]>;
  authors: Map<string, string>;
  /** each commenter's current vote on this topic, for the changed-mind badge */
  authorSides: Record<string, Side>;
  labelA: string;
  labelB: string;
  otherLabel: string;
  myVote: Side | null;
  user: User | null;

  topicId: string;
  reactions: Record<string, number>;
  onReact: (id: string, value: 1 | -1) => void;
  isAdmin: boolean;
  isBanned: boolean;
  /** past its deadline: the takes below are an archive, not a conversation */
  isClosed: boolean;
  /** below lg only the active column is shown; both stay mounted either way */
  isActive: boolean;
}) {

  const [sort, setSort] = useState<SortKey>("top");
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  const queryClient = useQueryClient();

  const sorted = useMemo(() => {
    const copy = [...rows];
    if (sort === "top") {
      copy.sort(
        (a, b) =>
          b.likes_count - b.dislikes_count - (a.likes_count - a.dislikes_count) ||
          b.likes_count - a.likes_count,
      );
    } else if (sort === "wild") {
      copy.sort(
        (a, b) =>
          b.controversy_score - a.controversy_score ||
          b.likes_count + b.dislikes_count - (a.likes_count + a.dislikes_count),
      );
    } else {
      copy.sort((a, b) => b.created_at.localeCompare(a.created_at));
    }
    return copy;
  }, [rows, sort]);

  const t = useT();
  const tError = useI18n().tError;
  const accent = side === "a" ? "border-side-a" : "border-side-b";
  const canComment = myVote === side && !isBanned && !isClosed;

  async function submit() {
    const text = body.trim();
    if (text.length < 2 || !user) return;
    if (text.length > 2000) {
      toast.error(t("comment.tooLong"));
      return;
    }
    setPosting(true);
    const { error } = await supabase
      .from("comments")
      .insert({ topic_id: topicId, user_id: user.id, side, body: text.slice(0, 2000) });
    setPosting(false);
    if (error) {
      toast.error(tError(describeError(error, t("comment.failed"))));
      return;
    }
    setBody("");
    toast.success(t("comment.posted"));
    queryClient.invalidateQueries({ queryKey: ["comments", topicId] });
  }


  return (
    // `flex` is supplied by the display class below, never in the base string:
    // .flex and .hidden have equal specificity, so source order would decide.
    // min-w-0 stops one unbroken comment from widening both desktop columns.
    <section
      aria-labelledby={`side-${side}-heading`}
      className={`arena-panel min-w-0 flex-col gap-4 border-t-4 p-4 ${accent} ${
        isActive ? "flex" : "hidden lg:flex"
      }`}
    >
      <h2
        id={`side-${side}-heading`}
        className={`text-2xl ${side === "a" ? "text-side-a" : "text-side-b"}`}
      >
        {title}
      </h2>

      <div className="flex flex-wrap gap-2">
        {SORTS.map(({ key, labelKey, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setSort(key)}
            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              sort === key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {t(labelKey)}
          </button>
        ))}
      </div>

      {canComment ? (
        <div className="space-y-2">
          <Textarea
            value={body}
            maxLength={1000}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t("comment.placeholder")}
            className="bg-background"
          />
          <Button onClick={submit} disabled={posting || body.trim().length < 2} className="w-full">
            {t("comment.post")}
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-sm border border-dashed border-border p-3 text-sm text-muted-foreground">
          <Lock className="h-4 w-4" />
          {isClosed
            ? t("comment.lockedClosed")
            : isBanned
              ? t("comment.lockedBanned")
              : user
                ? myVote
                  ? t("comment.lockedOtherSide")
                  : t("comment.lockedVote")
                : t("comment.lockedSignIn")}
        </div>
      )}

      <ul className="space-y-3">
        {sorted.map((row, index) => {
          const netScore = (row.likes_count ?? 0) - (row.dislikes_count ?? 0);
          const controversy =
            (row.likes_count ?? 0) + (row.dislikes_count ?? 0) - Math.abs(netScore);
          const highlighted =
            index < 3 &&
            (sort === "top" ? netScore > 0 : sort === "wild" ? controversy > 0 : false);
          // the author argued this side, then voted for the other one
          const switched = Boolean(authorSides[row.user_id]) && authorSides[row.user_id] !== side;
          return (
          <li
            key={row.id}
            id={`comment-${row.id}`}
            className={`scroll-mt-24 rounded-sm border p-3 ${
              row.is_hidden
                ? "border-dashed border-destructive/50 bg-destructive/5"
                : highlighted
                  ? "border-primary/70 bg-accent/40"
                  : "border-border"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-foreground">
                  {authors.get(row.user_id) ?? t("comment.anonymous")}
                </span>
                {switched ? (
                  <span
                    title={t("comment.changedMindTitle", { label: otherLabel })}
                    className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                  >
                    {t("comment.changedMind")}
                  </span>
                ) : null}
              </span>
              {row.is_hidden ? (
                <span className="font-medium text-destructive">
                  {t("comment.hidden")}
                  {row.hidden_reason ? ` — ${row.hidden_reason}` : ""}
                </span>
              ) : highlighted ? (
                <span className="font-medium text-muted-foreground">
                  {sort === "wild" ? t("comment.wildTake") : t("comment.topTake")}
                </span>
              ) : null}
            </div>


            <p className="mt-2 text-sm leading-relaxed break-words text-foreground">{row.body}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <ReactionButton
                active={reactions[row.id] === 1}
                count={row.likes_count}
                onClick={() => onReact(row.id, 1)}
                icon={<ThumbsUp className="h-3.5 w-3.5" />}
                disabled={isClosed}
              />
              <ReactionButton
                active={reactions[row.id] === -1}
                count={row.dislikes_count}
                onClick={() => onReact(row.id, -1)}
                icon={<ThumbsDown className="h-3.5 w-3.5" />}
                disabled={isClosed}
              />
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Flame className="h-3.5 w-3.5" /> {row.controversy_score}
              </span>

              <span className="ml-auto flex items-center gap-1">
                {user && user.id !== row.user_id && !isBanned ? (
                  <ReportButton commentId={row.id} />
                ) : null}
                {isAdmin ? (
                  <ModeratorControls
                    comment={row}
                    topicId={topicId}
                    authorName={authors.get(row.user_id) ?? t("comment.anonymous")}
                  />
                ) : null}
              </span>
            </div>

            <ReplyThread
              parent={row}
              replies={repliesByParent[row.id] ?? []}
              authors={authors}
              labelA={labelA}
              labelB={labelB}
              myVote={myVote}
              user={user}
              topicId={topicId}
              reactions={reactions}
              onReact={onReact}
              isAdmin={isAdmin}
              isBanned={isBanned}
              isClosed={isClosed}
            />
          </li>

          );
        })}

        {sorted.length === 0 ? (
          <li className="py-6 text-center text-sm text-muted-foreground">
            {t("comment.empty")}
          </li>
        ) : null}
      </ul>
    </section>
  );
}

/**
 * One level of replies under a take. Anyone who voted on the topic can reply,
 * from either side, so each reply is tagged with its author's own side.
 * Replies never enter the Top/Wild ranking — they stay in posting order.
 */
function ReplyThread({
  parent,
  replies,
  authors,
  labelA,
  labelB,
  myVote,
  user,
  topicId,
  reactions,
  onReact,
  isAdmin,
  isBanned,
  isClosed,
}: {
  parent: CommentRow;
  replies: CommentRow[];
  authors: Map<string, string>;
  labelA: string;
  labelB: string;
  myVote: Side | null;
  user: User | null;
  topicId: string;
  reactions: Record<string, number>;
  onReact: (id: string, value: 1 | -1) => void;
  isAdmin: boolean;
  isBanned: boolean;
  isClosed: boolean;
}) {
  const queryClient = useQueryClient();
  const { t, tError } = useI18n();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  const canReply = Boolean(user) && myVote !== null && !isBanned && !isClosed && !parent.is_hidden;

  async function submit() {
    const text = body.trim();
    if (text.length < 2 || !user || !myVote) return;
    setPosting(true);
    const { error } = await supabase.from("comments").insert({
      topic_id: topicId,
      user_id: user.id,
      side: myVote,
      parent_id: parent.id,
      body: text.slice(0, 2000),
    });
    setPosting(false);
    if (error) {
      toast.error(tError(describeError(error, t("reply.failed"))));
      return;
    }
    setBody("");
    setOpen(false);
    toast.success(t("reply.posted"));
    queryClient.invalidateQueries({ queryKey: ["comments", topicId] });
  }

  return (
    <div className="mt-3 space-y-2 border-l-2 border-border pl-3">
      {replies.map((reply) => {
        const replySide = reply.side === "a" ? "a" : "b";
        return (
          <div
            key={reply.id}
            id={`comment-${reply.id}`}
            className="scroll-mt-24 rounded-sm bg-muted/40 p-2"
          >
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="font-bold text-foreground">
                {authors.get(reply.user_id) ?? t("comment.anonymous")}
              </span>
              <span
                className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                  replySide === "a" ? "border-side-a text-side-a" : "border-side-b text-side-b"
                }`}
              >
                {replySide === "a" ? labelA : labelB}
              </span>
              {reply.is_hidden ? (
                <span className="font-medium text-destructive">{t("comment.hidden")}</span>
              ) : null}
            </div>
            <p className="mt-1 text-sm leading-relaxed break-words text-foreground">{reply.body}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <ReactionButton
                active={reactions[reply.id] === 1}
                count={reply.likes_count}
                onClick={() => onReact(reply.id, 1)}
                icon={<ThumbsUp className="h-3 w-3" />}
                disabled={isClosed}
              />
              <ReactionButton
                active={reactions[reply.id] === -1}
                count={reply.dislikes_count}
                onClick={() => onReact(reply.id, -1)}
                icon={<ThumbsDown className="h-3 w-3" />}
                disabled={isClosed}
              />
              <span className="ml-auto flex items-center gap-1">
                {user && user.id !== reply.user_id && !isBanned ? (
                  <ReportButton commentId={reply.id} />
                ) : null}
                {isAdmin ? (
                  <ModeratorControls
                    comment={reply}
                    topicId={topicId}
                    authorName={authors.get(reply.user_id) ?? t("comment.anonymous")}
                  />
                ) : null}
              </span>
            </div>
          </div>
        );
      })}

      {canReply ? (
        open ? (
          <div className="space-y-2">
            <Textarea
              value={body}
              maxLength={1000}
              autoFocus
              onChange={(e) => setBody(e.target.value)}
              placeholder={t("reply.placeholder")}
              className="bg-background"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={submit} disabled={posting || body.trim().length < 2}>
                {t("reply.action")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
                {t("common.cancel")}
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <Reply className="h-3.5 w-3.5" /> {t("reply.action")}
          </button>
        )
      ) : null}
    </div>
  );
}



/** Lets any signed-in member push a comment into the admin moderation queue. */
function ReportButton({ commentId }: { commentId: string }) {
  const { t, tError } = useI18n();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);

  async function submit() {
    const text = reason.trim();
    if (text.length < 3) {
      toast.error(t("report.needReason"));
      return;
    }
    setSending(true);
    const { data: session } = await supabase.auth.getUser();
    const { error } = await supabase.from("comment_reports").insert({
      comment_id: commentId,
      reporter_id: session.user!.id,
      reason: text.slice(0, 300),
    });
    setSending(false);
    if (error) {
      toast.error(
        error.message.includes("duplicate")
          ? t("report.duplicate")
          : tError(describeError(error, t("report.failed"))),
      );
      return;
    }
    toast.success(t("report.sent"));
    setReason("");
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={t("report.tooltip")}
        aria-label={t("report.aria")}
        className="rounded-sm border border-transparent p-1 text-muted-foreground transition-colors hover:border-border hover:text-destructive"
      >
        <Flag className="h-3.5 w-3.5" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("report.title")}</DialogTitle>
            <DialogDescription>
              {t("report.body")}
            </DialogDescription>
          </DialogHeader>
          <Input
            value={reason}
            maxLength={300}
            placeholder={t("report.placeholder")}
            onChange={(e) => setReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={submit} disabled={sending}>
              {t("report.send")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Admin-only shortcuts so moderation can happen in context, not just in /admin. */
function ModeratorControls({
  comment,
  topicId,
  authorName,
}: {
  comment: CommentRow;
  topicId: string;
  authorName: string;
}) {
  const queryClient = useQueryClient();
  const { t, tError } = useI18n();
  const [busy, setBusy] = useState(false);

  async function run(action: "hide" | "unhide" | "delete") {
    if (action === "delete" && !confirm(t("mod.confirmDelete", { name: authorName }))) return;
    setBusy(true);
    const { data: session } = await supabase.auth.getUser();
    const actorId = session.user!.id;

    const { error } =
      action === "delete"
        ? await supabase.from("comments").delete().eq("id", comment.id)
        : await supabase
            .from("comments")
            .update({
              is_hidden: action === "hide",
              hidden_by: action === "hide" ? actorId : null,
              hidden_at: action === "hide" ? new Date().toISOString() : null,
              hidden_reason: null,
            })
            .eq("id", comment.id);

    if (!error) {
      await supabase.from("admin_audit_log").insert({
        actor_id: actorId,
        action: `comment.${action}`,
        entity_type: "comment",
        entity_id: comment.id,
        summary: comment.body.slice(0, 120),
      });
    }
    setBusy(false);

    if (error) {
      toast.error(tError(describeError(error, t("mod.failed"))));
      return;
    }
    toast.success(
      action === "delete" ? t("mod.deleted") : action === "hide" ? t("mod.hidden") : t("mod.restored"),
    );
    queryClient.invalidateQueries({ queryKey: ["comments", topicId] });
  }

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => run(comment.is_hidden ? "unhide" : "hide")}
        title={comment.is_hidden ? t("mod.restore") : t("mod.hide")}
        aria-label={comment.is_hidden ? t("mod.restore") : t("mod.hideAria")}
        className="rounded-sm border border-transparent p-1 text-muted-foreground transition-colors hover:border-border hover:text-foreground"
      >
        <EyeOff className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => run("delete")}
        title={t("mod.delete")}
        aria-label={t("mod.deleteAria")}
        className="rounded-sm border border-transparent p-1 text-muted-foreground transition-colors hover:border-border hover:text-destructive"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </>
  );
}

function ReactionButton({
  active,
  count,
  onClick,
  icon,
  disabled = false,
}: {
  active: boolean;
  count: number;
  onClick: () => void;
  icon: React.ReactNode;
  /** a closed debate keeps its scores on screen but stops taking new ones */
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-xs font-bold transition-colors disabled:cursor-default disabled:opacity-70 disabled:hover:bg-transparent ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border hover:bg-accent"
      }`}
    >
      {icon}
      {count}
    </button>
  );
}
