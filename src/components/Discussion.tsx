import { useCallback, useEffect, useMemo, useState } from "react";
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

  useEffect(() => {
    setVotesA(topic.votes_a);
    setVotesB(topic.votes_b);
  }, [topic.votes_a, topic.votes_b]);

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

  const castVote = useCallback(
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
      if (previous && previous !== choice) {
        toast.success("Vote switched — your old comments moved out of that column.");
        queryClient.invalidateQueries({ queryKey: ["comments", topic.id] });
      }
    },
    [user, isBanned, myVote, topic.id, topic.votes_a, topic.votes_b, queryClient],
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

  const rows = commentsQuery.data?.rows ?? [];
  const authors = commentsQuery.data?.authors ?? new Map<string, string>();

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

      <div className="grid gap-6 lg:grid-cols-2">
        <CommentColumn
          side="a"
          title={`Why ${topic.choice_a}?`}
          rows={rows.filter((r) => r.side === "a")}
          authors={authors}
          myVote={myVote}
          user={user}
          topicId={topic.id}
          reactions={reactionsQuery.data ?? {}}
          onReact={react}
          isAdmin={isAdmin}
          isBanned={isBanned}
        />
        <CommentColumn
          side="b"
          title={`Why ${topic.choice_b}?`}
          rows={rows.filter((r) => r.side === "b")}
          authors={authors}
          myVote={myVote}
          user={user}
          topicId={topic.id}
          reactions={reactionsQuery.data ?? {}}
          onReact={react}
          isAdmin={isAdmin}
          isBanned={isBanned}
        />
      </div>
    </div>
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
    setPosting(true);
    const { error } = await supabase
      .from("comments")
      .insert({ topic_id: topicId, user_id: user.id, side, body: text.slice(0, 1000) });
    setPosting(false);
    if (error) {
      toast.error("Could not post that take.");
      return;
    }
    setBody("");
    toast.success("Take posted 🔥");
    queryClient.invalidateQueries({ queryKey: ["comments", topicId] });
  }

  return (
    <section className={`arena-panel flex flex-col gap-4 border-t-4 p-4 ${accent}`}>
      <h2 className={`text-2xl ${side === "a" ? "text-side-a" : "text-side-b"}`}>{title}</h2>

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
        {sorted.map((row, index) => (
          <li
            key={row.id}
            className={`rounded-sm border p-3 ${
              row.is_hidden
                ? "border-dashed border-destructive/50 bg-destructive/5"
                : index < 3 && sort !== "newest"
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
              ) : index < 3 && sort !== "newest" ? (
                <span className="font-medium text-muted-foreground">
                  {sort === "wild" ? "Wild take" : "Pinned"}
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-sm leading-relaxed text-foreground">{row.body}</p>
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
        ))}
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
