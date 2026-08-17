import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Clock, Flag, Flame, Star, ThumbsDown, ThumbsUp, Lock, EyeOff, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useBanStatus, useIsAdmin } from "@/hooks/useAuth";
import { describeError } from "@/lib/admin";
import type { TopicCard } from "@/lib/public.functions";
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
};

const SORTS: { key: SortKey; label: string; icon: typeof Star }[] = [
  { key: "top", label: "Top Liked", icon: Star },
  { key: "wild", label: "Wild Takes", icon: Flame },
  { key: "newest", label: "Newest", icon: Clock },
];

export function Discussion({ topic, user }: { topic: TopicCard; user: User | null }) {
  const queryClient = useQueryClient();
  const isAdmin = useIsAdmin(user);
  const { isBanned, reason: banReason } = useBanStatus(user);
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

  const commentsQuery = useQuery({
    queryKey: ["comments", topic.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comments")
        .select("*")
        .eq("topic_id", topic.id)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      const rows = (data ?? []) as CommentRow[];
      const ids = [...new Set(rows.map((r) => r.user_id))];
      const authors = new Map<string, string>();
      if (ids.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, username")
          .in("id", ids);
        for (const p of profiles ?? []) authors.set(p.id, p.username);
      }
      return { rows, authors };
    },
  });

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

  useEffect(() => {
    const channel = supabase
      .channel(`topic-${topic.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "comments", filter: `topic_id=eq.${topic.id}` },
        () => queryClient.invalidateQueries({ queryKey: ["comments", topic.id] }),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "topics", filter: `id=eq.${topic.id}` },
        (payload) => {
          const next = payload.new as { votes_a: number; votes_b: number };
          setVotesA(next.votes_a);
          setVotesB(next.votes_b);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [topic.id, queryClient]);

  const total = votesA + votesB;
  const pctA = total === 0 ? 50 : Math.round((100 * votesA) / total);

  const applyVote = useCallback(
    async (choice: Side) => {
      if (!user) return;
      if (isBanned) {
        toast.error("Your account is suspended — voting is disabled.");
        return;
      }
      const previous = myVote;
      if (previous === choice) return;
      setMyVote(choice);
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
        toast.error("Vote failed. Try again.");
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["comment-author-sides", topic.id] });
      if (previous && previous !== choice) {
        toast.success("Side switched — your earlier takes stay up, marked as changed their mind.");
        queryClient.invalidateQueries({ queryKey: ["comments", topic.id] });
      }
    },
    [user, isBanned, myVote, topic.id, topic.votes_a, topic.votes_b, queryClient],
  );

  // switching sides is not reversible for the reader's own history, so it is
  // always confirmed rather than fired straight off the vote button
  const [pendingSide, setPendingSide] = useState<Side | null>(null);

  const castVote = useCallback(
    (choice: Side) => {
      if (!user) return;
      if (myVote && myVote !== choice) {
        setPendingSide(choice);
        return;
      }
      void applyVote(choice);
    },
    [user, myVote, applyVote],
  );


  const react = useCallback(
    async (commentId: string, value: 1 | -1) => {
      if (!user) {
        toast.error("Sign in to like or dislike.");
        return;
      }
      if (isBanned) {
        toast.error("Your account is suspended — reactions are disabled.");
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
    [user, isBanned, reactionsQuery.data, queryClient, topic.id],
  );

  const authors = commentsQuery.data?.authors ?? new Map<string, string>();
  const authorSides = authorSidesQuery.data ?? {};

  const [rowsA, rowsB] = useMemo(() => {
    const all = commentsQuery.data?.rows ?? [];
    return [all.filter((r) => r.side === "a"), all.filter((r) => r.side === "b")];
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
          <p className="font-bold text-destructive">Your account is suspended.</p>
          <p className="mt-1 text-muted-foreground">
            You can still read every debate, but voting, commenting and reacting are disabled.
            {banReason ? ` Reason: ${banReason}` : ""}
          </p>
        </div>
      ) : null}

      <section className="arena-panel p-5">
        <SplitBar pctA={pctA} labelA={topic.choice_a} labelB={topic.choice_b} size="lg" />
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
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
        <p className="mt-4 text-center text-sm text-muted-foreground">
          {total} total votes
          {user
            ? myVote
              ? " — you can switch sides any time"
              : " — pick a side to unlock the comments"
            : " — "}
          {!user ? (
            <Link to="/auth" className="font-bold text-primary underline">
              sign in to vote
            </Link>
          ) : null}
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
          title={`Why ${topic.choice_a}?`}
          rows={rowsA}
          authors={authors}
          myVote={myVote}
          user={user}
          topicId={topic.id}
          reactions={reactionsQuery.data ?? {}}
          onReact={react}
          isAdmin={isAdmin}
          isBanned={isBanned}
          isActive={activeSide === "a"}
        />
        <CommentColumn
          side="b"
          title={`Why ${topic.choice_b}?`}
          rows={rowsB}
          authors={authors}
          myVote={myVote}
          user={user}
          topicId={topic.id}
          reactions={reactionsQuery.data ?? {}}
          onReact={react}
          isAdmin={isAdmin}
          isBanned={isBanned}
          isActive={activeSide === "b"}
        />
      </div>
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
  return (
    <div
      role="group"
      aria-label="Show one side's takes at a time"
      className="sticky top-14 z-30 -mx-4 border-b border-border bg-background/95 px-4 py-2 backdrop-blur lg:hidden"
    >
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
        Showing {activeSide === "a" ? labelA : labelB}
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
  const border = side === "a" ? "border-side-a" : "border-side-b";
  const idle = side === "a" ? "text-side-a" : "text-side-b";
  const selected =
    side === "a" ? "bg-side-a text-side-a-foreground" : "bg-side-b text-side-b-foreground";
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex min-w-0 items-center justify-center gap-2 rounded-md border-2 px-3 py-2 text-sm font-bold transition-colors ${border} ${
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
  const base = side === "a" ? "border-side-a text-side-a" : "border-side-b text-side-b";
  const activeCls =
    side === "a" ? "bg-side-a text-side-a-foreground" : "bg-side-b text-side-b-foreground";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-md border-2 px-4 py-4 font-display text-xl transition-all disabled:cursor-not-allowed disabled:opacity-50 ${base} ${
        active ? activeCls : "hover:-translate-y-0.5"
      }`}
    >
      {label}
    </button>
  );
}

function CommentColumn({
  side,
  title,
  rows,
  authors,
  myVote,
  user,
  topicId,
  reactions,
  onReact,
  isAdmin,
  isBanned,
  isActive,
}: {
  side: Side;
  title: string;
  rows: CommentRow[];
  authors: Map<string, string>;
  myVote: Side | null;
  user: User | null;
  topicId: string;
  reactions: Record<string, number>;
  onReact: (id: string, value: 1 | -1) => void;
  isAdmin: boolean;
  isBanned: boolean;
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

  const accent = side === "a" ? "border-side-a" : "border-side-b";
  const canComment = myVote === side && !isBanned;

  async function submit() {
    const text = body.trim();
    if (text.length < 2 || !user) return;
    if (text.length > 2000) {
      toast.error("That take is too long (2000 characters max).");
      return;
    }
    setPosting(true);
    const { error } = await supabase
      .from("comments")
      .insert({ topic_id: topicId, user_id: user.id, side, body: text.slice(0, 2000) });
    setPosting(false);
    if (error) {
      toast.error(describeError(error, "Could not post that take."));
      return;
    }
    setBody("");
    toast.success("Take posted 🔥");
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
        {SORTS.map(({ key, label, icon: Icon }) => (
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
            {label}
          </button>
        ))}
      </div>

      {canComment ? (
        <div className="space-y-2">
          <Textarea
            value={body}
            maxLength={1000}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Defend your side..."
            className="bg-background"
          />
          <Button onClick={submit} disabled={posting || body.trim().length < 2} className="w-full">
            Post your take
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-sm border border-dashed border-border p-3 text-sm text-muted-foreground">
          <Lock className="h-4 w-4" />
          {isBanned
            ? "Your account is suspended — you can read but not post."
            : user
              ? myVote
                ? "You voted for the other side — this column is read-only."
                : "Vote above to unlock this column."
              : "Sign in and vote to join this column."}
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
          return (
          <li
            key={row.id}
            className={`rounded-sm border p-3 ${
              row.is_hidden
                ? "border-dashed border-destructive/50 bg-destructive/5"
                : highlighted
                  ? "border-primary/70 bg-accent/40"
                  : "border-border"
            }`}
          >
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="font-bold text-foreground">
                {authors.get(row.user_id) ?? "anonymous"}
              </span>
              {row.is_hidden ? (
                <span className="font-medium text-destructive">
                  Hidden by a moderator
                  {row.hidden_reason ? ` — ${row.hidden_reason}` : ""}
                </span>
              ) : highlighted ? (
                <span className="font-medium text-muted-foreground">
                  {sort === "wild" ? "Wild take" : "Top take"}
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
              />
              <ReactionButton
                active={reactions[row.id] === -1}
                count={row.dislikes_count}
                onClick={() => onReact(row.id, -1)}
                icon={<ThumbsDown className="h-3.5 w-3.5" />}
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
                    authorName={authors.get(row.user_id) ?? "anonymous"}
                  />
                ) : null}
              </span>
            </div>
          </li>
          );
        })}

        {sorted.length === 0 ? (
          <li className="py-6 text-center text-sm text-muted-foreground">
            No takes here yet. Be the first.
          </li>
        ) : null}
      </ul>
    </section>
  );
}

/** Lets any signed-in member push a comment into the admin moderation queue. */
function ReportButton({ commentId }: { commentId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);

  async function submit() {
    const text = reason.trim();
    if (text.length < 3) {
      toast.error("Tell the moderators what's wrong with it.");
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
          ? "You already reported this one."
          : describeError(error, "Could not send that report"),
      );
      return;
    }
    toast.success("Reported — a moderator will take a look.");
    setReason("");
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Report to moderators"
        aria-label="Report this comment"
        className="rounded-sm border border-transparent p-1 text-muted-foreground transition-colors hover:border-border hover:text-destructive"
      >
        <Flag className="h-3.5 w-3.5" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report this comment</DialogTitle>
            <DialogDescription>
              Moderators see the comment, who wrote it and your reason.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={reason}
            maxLength={300}
            placeholder="Harassment, spam, off-topic…"
            onChange={(e) => setReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={sending}>
              Send report
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
  const [busy, setBusy] = useState(false);

  async function run(action: "hide" | "unhide" | "delete") {
    if (action === "delete" && !confirm(`Delete ${authorName}'s comment permanently?`)) return;
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
      toast.error(describeError(error, "Moderation failed"));
      return;
    }
    toast.success(
      action === "delete" ? "Comment deleted" : action === "hide" ? "Comment hidden" : "Restored",
    );
    queryClient.invalidateQueries({ queryKey: ["comments", topicId] });
  }

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => run(comment.is_hidden ? "unhide" : "hide")}
        title={comment.is_hidden ? "Restore this comment" : "Hide from the public"}
        aria-label={comment.is_hidden ? "Restore this comment" : "Hide this comment"}
        className="rounded-sm border border-transparent p-1 text-muted-foreground transition-colors hover:border-border hover:text-foreground"
      >
        <EyeOff className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => run("delete")}
        title="Delete permanently"
        aria-label="Delete this comment"
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
}: {
  active: boolean;
  count: number;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-xs font-bold transition-colors ${
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
