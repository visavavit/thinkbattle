import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { Eye, EyeOff, Search, ThumbsDown, ThumbsUp, Trash2, UserX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  adminKeys,
  describeError,
  formatWhen,
  recordAudit,
  type AdminCommentRow,
  type ReportStatus,
} from "@/lib/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmAction } from "./ConfirmAction";

/** Shared mutations for acting on a single comment. */
function useCommentModeration(actorId: string) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin", "comments"] });
    queryClient.invalidateQueries({ queryKey: ["admin", "reports"] });
    queryClient.invalidateQueries({ queryKey: adminKeys.stats });
    queryClient.invalidateQueries({ queryKey: adminKeys.audit });
    queryClient.invalidateQueries({ queryKey: ["comments"] });
  };

  const setHidden = useMutation({
    mutationFn: async ({
      commentId,
      hidden,
      reason,
      preview,
    }: {
      commentId: string;
      hidden: boolean;
      reason?: string;
      preview?: string;
    }) => {
      const { error } = await supabase
        .from("comments")
        .update({
          is_hidden: hidden,
          hidden_reason: hidden ? reason || null : null,
          hidden_by: hidden ? actorId : null,
          hidden_at: hidden ? new Date().toISOString() : null,
        })
        .eq("id", commentId);
      if (error) throw error;
      await recordAudit({
        actorId,
        action: hidden ? "comment.hide" : "comment.unhide",
        entityType: "comment",
        entityId: commentId,
        summary: preview?.slice(0, 120) ?? null,
        detail: reason ? { reason } : {},
      });
    },
    onSuccess: (_d, v) => {
      toast.success(v.hidden ? "Comment hidden from the public" : "Comment restored");
      invalidate();
    },
    onError: (error) => toast.error(describeError(error, "Could not update that comment")),
  });

  const remove = useMutation({
    mutationFn: async ({ commentId, preview }: { commentId: string; preview?: string }) => {
      const { error } = await supabase.from("comments").delete().eq("id", commentId);
      if (error) throw error;
      await recordAudit({
        actorId,
        action: "comment.delete",
        entityType: "comment",
        entityId: commentId,
        summary: preview?.slice(0, 120) ?? null,
      });
    },
    onSuccess: () => {
      toast.success("Comment deleted");
      invalidate();
    },
    onError: (error) => toast.error(describeError(error, "Could not delete that comment")),
  });

  const ban = useMutation({
    mutationFn: async ({
      userId,
      username,
      reason,
    }: {
      userId: string;
      username: string;
      reason: string;
    }) => {
      const { error } = await supabase
        .from("user_bans")
        .insert({ user_id: userId, reason: reason || null, banned_by: actorId });
      if (error) throw error;
      await recordAudit({
        actorId,
        action: "user.ban",
        entityType: "user",
        entityId: userId,
        summary: username,
        detail: reason ? { reason } : {},
      });
    },
    onSuccess: (_d, v) => {
      toast.success(`${v.username} can no longer post or vote`);
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["admin", "people"] });
    },
    onError: (error) => toast.error(describeError(error, "Could not ban that user")),
  });

  return { setHidden, remove, ban };
}

function CommentActions({
  actorId,
  commentId,
  body,
  isHidden,
  authorId,
  authorName,
  authorBanned,
}: {
  actorId: string;
  commentId: string;
  body: string;
  isHidden: boolean;
  authorId: string;
  authorName: string;
  authorBanned: boolean;
}) {
  const { setHidden, remove, ban } = useCommentModeration(actorId);
  return (
    <div className="flex flex-wrap gap-2">
      {isHidden ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() => setHidden.mutate({ commentId, hidden: false, preview: body })}
        >
          <Eye className="mr-1 h-3.5 w-3.5" /> Restore
        </Button>
      ) : (
        <ConfirmAction
          trigger={
            <Button size="sm" variant="outline">
              <EyeOff className="mr-1 h-3.5 w-3.5" /> Hide
            </Button>
          }
          title="Hide this comment?"
          description="It disappears from the public thread and stops counting toward the topic's comment total. The author still sees it, and you can restore it later."
          confirmLabel="Hide it"
          reasonLabel="Reason (kept in the audit log)"
          reasonPlaceholder="Personal attack…"
          onConfirm={(reason) =>
            setHidden.mutate({ commentId, hidden: true, reason, preview: body })
          }
        />
      )}

      <ConfirmAction
        trigger={
          <Button size="sm" variant="outline">
            <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
          </Button>
        }
        title="Delete this comment for good?"
        description="Hiding is reversible; deleting is not. The comment and its reactions are gone."
        confirmLabel="Delete permanently"
        destructive
        onConfirm={() => remove.mutate({ commentId, preview: body })}
      />

      {authorBanned ? (
        <Badge variant="destructive">author banned</Badge>
      ) : (
        <ConfirmAction
          trigger={
            <Button size="sm" variant="outline">
              <UserX className="mr-1 h-3.5 w-3.5" /> Ban author
            </Button>
          }
          title={`Ban ${authorName}?`}
          description="They keep read access but can no longer vote, comment, react or suggest topics. Their existing comments stay up unless you hide them."
          confirmLabel="Ban user"
          destructive
          reasonLabel="Reason (kept in the audit log)"
          reasonPlaceholder="Repeated harassment…"
          onConfirm={(reason) => ban.mutate({ userId: authorId, username: authorName, reason })}
        />
      )}
    </div>
  );
}

function ReportsQueue({ actorId }: { actorId: string }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ReportStatus>("open");

  const reports = useQuery({
    queryKey: adminKeys.reports(status),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_report_queue", {
        _status: status,
        _limit: 100,
      });
      if (error) throw error;
      return data ?? [];
    },
  });

  const resolve = useMutation({
    mutationFn: async ({
      reportId,
      next,
      summary,
    }: {
      reportId: string;
      next: ReportStatus;
      summary: string;
    }) => {
      const { error } = await supabase
        .from("comment_reports")
        .update({ status: next, resolved_by: actorId, resolved_at: new Date().toISOString() })
        .eq("id", reportId);
      if (error) throw error;
      await recordAudit({
        actorId,
        action: `report.${next}`,
        entityType: "report",
        entityId: reportId,
        summary,
      });
    },
    onSuccess: () => {
      toast.success("Report closed");
      queryClient.invalidateQueries({ queryKey: ["admin", "reports"] });
      queryClient.invalidateQueries({ queryKey: adminKeys.stats });
      queryClient.invalidateQueries({ queryKey: adminKeys.audit });
    },
    onError: (error) => toast.error(describeError(error, "Could not close that report")),
  });

  const STATUSES: ReportStatus[] = ["open", "resolved", "dismissed"];

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
              status === s
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {reports.isLoading ? <Skeleton className="h-32" /> : null}
      {!reports.isLoading && (reports.data ?? []).length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">
          {status === "open" ? "No open reports. The arena is behaving." : `No ${status} reports.`}
        </p>
      ) : null}

      {(reports.data ?? []).map((r) => (
        <div key={r.report_id} className="arena-panel space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="destructive">{r.reason}</Badge>
            <span>
              reported by {r.reporter_name} · {formatWhen(r.created_at)}
            </span>
            {r.comment_is_hidden ? <Badge variant="secondary">already hidden</Badge> : null}
          </div>

          <div
            className={`rounded-sm border-l-4 bg-accent/30 p-3 ${
              r.comment_side === "a" ? "border-side-a" : "border-side-b"
            }`}
          >
            <p className="text-sm">{r.comment_body}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              by <strong>{r.author_name}</strong> on{" "}
              <Link to="/topic/$id" params={{ id: r.topic_id }} className="underline">
                {r.topic_title}
              </Link>{" "}
              · {r.comment_likes} 👍 {r.comment_dislikes} 👎
            </p>
          </div>

          {status === "open" ? (
            <div className="flex flex-wrap gap-2">
              <CommentActions
                actorId={actorId}
                commentId={r.comment_id}
                body={r.comment_body}
                isHidden={r.comment_is_hidden}
                authorId={r.author_id}
                authorName={r.author_name}
                authorBanned={r.author_banned}
              />
              <span className="mx-1 w-px bg-border" />
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  resolve.mutate({
                    reportId: r.report_id,
                    next: "resolved",
                    summary: r.comment_body.slice(0, 120),
                  })
                }
              >
                Mark handled
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  resolve.mutate({
                    reportId: r.report_id,
                    next: "dismissed",
                    summary: r.comment_body.slice(0, 120),
                  })
                }
              >
                Dismiss
              </Button>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function CommentBrowser({ actorId }: { actorId: string }) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [onlyHidden, setOnlyHidden] = useState(false);

  const comments = useQuery({
    queryKey: adminKeys.comments(query, onlyHidden),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_comment_feed", {
        _only_hidden: onlyHidden,
        _limit: 60,
        ...(query ? { _search: query } : {}),
      });
      if (error) throw error;
      return (data ?? []) as AdminCommentRow[];
    },
  });

  return (
    <div className="space-y-3">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(search.trim());
        }}
      >
        <div className="relative min-w-56 flex-1">
          <Search className="absolute top-1/2 left-2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search every comment…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button type="submit" size="sm">
          Search
        </Button>
        <button
          type="button"
          onClick={() => setOnlyHidden((v) => !v)}
          className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
            onlyHidden
              ? "border-foreground bg-foreground text-background"
              : "border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          Hidden only
        </button>
      </form>

      {comments.isLoading ? <Skeleton className="h-32" /> : null}
      {!comments.isLoading && (comments.data ?? []).length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">No comments match.</p>
      ) : null}

      {(comments.data ?? []).map((c) => (
        <div
          key={c.id}
          className={`arena-panel space-y-3 border-l-4 p-4 ${
            c.side === "a" ? "border-l-side-a" : "border-l-side-b"
          } ${c.is_hidden ? "opacity-60" : ""}`}
        >
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <strong className="text-foreground">{c.author_name}</strong>
            <Link to="/topic/$id" params={{ id: c.topic_id }} className="underline">
              {c.topic_title}
            </Link>
            <span>{formatWhen(c.created_at)}</span>
            {c.is_synthetic ? <Badge variant="outline">synthetic</Badge> : null}

            {c.is_hidden ? (
              <Badge variant="secondary">
                hidden{c.hidden_reason ? `: ${c.hidden_reason}` : ""}
              </Badge>
            ) : null}
            {c.open_reports > 0 ? (
              <Badge variant="destructive">
                {c.open_reports} report{c.open_reports === 1 ? "" : "s"}
              </Badge>
            ) : null}
          </div>
          <p className="text-sm">{c.body}</p>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <ThumbsUp className="h-3.5 w-3.5" /> {c.likes_count}
            </span>
            <span className="inline-flex items-center gap-1">
              <ThumbsDown className="h-3.5 w-3.5" /> {c.dislikes_count}
            </span>
          </div>
          <CommentActions
            actorId={actorId}
            commentId={c.id}
            body={c.body}
            isHidden={c.is_hidden}
            authorId={c.author_id}
            authorName={c.author_name}
            authorBanned={c.author_banned}
          />
        </div>
      ))}
    </div>
  );
}

export function ModerationPanel({ actorId }: { actorId: string }) {
  return (
    <Tabs defaultValue="reports">
      <TabsList>
        <TabsTrigger value="reports">Reports</TabsTrigger>
        <TabsTrigger value="all">All comments</TabsTrigger>
      </TabsList>
      <TabsContent value="reports" className="pt-4">
        <ReportsQueue actorId={actorId} />
      </TabsContent>
      <TabsContent value="all" className="pt-4">
        <CommentBrowser actorId={actorId} />
      </TabsContent>
    </Tabs>
  );
}
