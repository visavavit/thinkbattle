import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { Pencil, Pin, PinOff, Plus, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { adminKeys, describeError, formatWhen, recordAudit, type TopicStatus } from "@/lib/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmAction } from "./ConfirmAction";
import { TopicEditorDialog, type EditableTopic } from "./TopicEditorDialog";

type AdminTopic = {
  id: string;
  title: string;
  description: string | null;
  choice_a: string;
  choice_b: string;
  status: TopicStatus;
  votes_a: number;
  votes_b: number;
  created_at: string;
  published_at: string | null;
  category_id: string | null;
  cover_image_url: string | null;
  is_featured: boolean;
  submitted_by: string | null;
  closes_at: string | null;
};

function useAdminTopics() {
  return useQuery({
    queryKey: adminKeys.topics,
    queryFn: async () => {
      // Deliberately "*" rather than a column list. Naming columns means a
      // migration that has not reached this environment yet fails the whole
      // query, and the panel renders as "no topics" rather than as broken.
      // The admin topic set is small and this is behind an admin session.
      const { data, error } = await supabase
        .from("topics")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as AdminTopic[];

      const suggesterIds = [
        ...new Set(rows.map((r) => r.submitted_by).filter(Boolean)),
      ] as string[];
      const names = new Map<string, string>();
      if (suggesterIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, username")
          .in("id", suggesterIds);
        for (const p of profiles ?? []) names.set(p.id, p.username);
      }
      return { rows, names };
    },
  });
}

function useTopicMutations(actorId: string) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: adminKeys.topics });
    queryClient.invalidateQueries({ queryKey: adminKeys.stats });
    queryClient.invalidateQueries({ queryKey: adminKeys.audit });
    queryClient.invalidateQueries({ queryKey: ["feed"] });
    queryClient.invalidateQueries({ queryKey: ["headliner"] });
  };

  const setStatus = useMutation({
    mutationFn: async ({
      topic,
      status,
      note,
    }: {
      topic: AdminTopic;
      status: TopicStatus;
      note?: string;
    }) => {
      const { error } = await supabase
        .from("topics")
        .update({
          status,
          published_at: status === "published" ? new Date().toISOString() : null,
          moderation_note: note || null,
          reviewed_by: actorId,
          reviewed_at: new Date().toISOString(),
          // a topic pulled off the feed must not stay the headliner
          ...(status === "published" ? {} : { is_featured: false }),
        })
        .eq("id", topic.id);
      if (error) throw error;
      await recordAudit({
        actorId,
        action: `topic.${status}`,
        entityType: "topic",
        entityId: topic.id,
        summary: topic.title,
        detail: note ? { note } : {},
      });
    },
    onSuccess: (_data, variables) => {
      toast.success(
        variables.status === "published"
          ? "Published to the feed"
          : variables.status === "pending"
            ? "Moved back to the queue"
            : "Rejected",
      );
      invalidate();
    },
    onError: (error) => toast.error(describeError(error, "Update failed")),
  });

  const remove = useMutation({
    mutationFn: async (topic: AdminTopic) => {
      const { error } = await supabase.from("topics").delete().eq("id", topic.id);
      if (error) throw error;
      await recordAudit({
        actorId,
        action: "topic.delete",
        entityType: "topic",
        entityId: topic.id,
        summary: topic.title,
        detail: { votes: topic.votes_a + topic.votes_b },
      });
    },
    onSuccess: () => {
      toast.success("Topic deleted");
      invalidate();
    },
    onError: (error) => toast.error(describeError(error, "Delete failed")),
  });

  const feature = useMutation({
    mutationFn: async ({ topic, on }: { topic: AdminTopic; on: boolean }) => {
      const { error } = await supabase.rpc("admin_toggle_featured", {
        _topic_id: topic.id,
        _on: on,
      });
      if (error) throw error;
      await recordAudit({
        actorId,
        action: on ? "topic.feature" : "topic.unfeature",
        entityType: "topic",
        entityId: topic.id,
        summary: topic.title,
      });
    },
    onSuccess: (_data, variables) => {
      toast.success(variables.on ? "Added to the Headliners ⚡" : "Removed from the Headliners");
      invalidate();
    },
    onError: (error) => toast.error(describeError(error, "Could not update the headliners")),
  });

  return { setStatus, remove, feature };
}

/**
 * A failed read and an empty arena look identical once the rows are gone, and
 * the empty copy is reassuring — which is exactly wrong when the query 400s.
 * This says which one happened, and shows the database's own message.
 */
function LoadError({ error }: { error: unknown }) {
  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
      <p className="font-bold text-destructive">Could not load topics</p>
      <p className="mt-1 text-muted-foreground">
        {describeError(error, "The database rejected the request.")}
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: TopicStatus }) {
  if (status === "published") return <Badge variant="default">Live</Badge>;
  if (status === "pending") return <Badge variant="secondary">Pending</Badge>;
  return <Badge variant="outline">Unpublished</Badge>;
}

/**
 * A published topic past its deadline is still Live — it is on the feed and
 * readable — but it takes no more votes or takes, and that is worth saying
 * separately from the publish status.
 */
function DeadlineBadge({ closesAt }: { closesAt: string | null }) {
  if (!closesAt) return null;
  const at = new Date(closesAt);
  if (Number.isNaN(at.getTime())) return null;
  // formatWhen only reads backwards, and a deadline is usually ahead
  const minutes = Math.round((at.getTime() - Date.now()) / 60000);
  if (minutes <= 0) return <Badge variant="outline">🔒 Closed</Badge>;
  const left =
    minutes < 60
      ? `${minutes}m`
      : minutes < 60 * 24
        ? `${Math.round(minutes / 60)}h`
        : `${Math.round(minutes / (60 * 24))}d`;
  return <Badge variant="outline">⏳ Closes in {left}</Badge>;
}

export function TopicQueue({ actorId }: { actorId: string }) {
  const topics = useAdminTopics();
  const { setStatus } = useTopicMutations(actorId);
  const [editing, setEditing] = useState<EditableTopic | null>(null);

  const pending = (topics.data?.rows ?? []).filter((t) => t.status === "pending");
  const names = topics.data?.names ?? new Map<string, string>();

  if (topics.isLoading) return <Skeleton className="h-32" />;
  if (topics.isError) return <LoadError error={topics.error} />;

  return (
    <div className="space-y-3">
      {pending.length === 0 ? (
        <p className="text-muted-foreground">Nothing pending. The mob is satisfied.</p>
      ) : null}

      {pending.map((t) => (
        <div key={t.id} className="arena-panel space-y-3 p-4">
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-bold">{t.title}</p>
              {t.description ? (
                <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>
              ) : null}
              <p className="mt-1 text-sm text-muted-foreground">
                <span className="text-side-a">{t.choice_a}</span> vs{" "}
                <span className="text-side-b">{t.choice_b}</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                suggested by {t.submitted_by ? (names.get(t.submitted_by) ?? "unknown") : "unknown"}{" "}
                · {formatWhen(t.created_at)}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => setStatus.mutate({ topic: t, status: "published" })}
              disabled={setStatus.isPending}
            >
              Approve &amp; publish
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(t)}>
              <Pencil className="mr-1 h-3.5 w-3.5" /> Edit first
            </Button>
            <ConfirmAction
              trigger={
                <Button size="sm" variant="outline">
                  Reject
                </Button>
              }
              title="Reject this suggestion?"
              description="It stays in the archive and can be restored later."
              confirmLabel="Reject"
              reasonLabel="Reason (optional, kept in the audit log)"
              reasonPlaceholder="Duplicate of an existing topic…"
              onConfirm={(reason) =>
                setStatus.mutate({ topic: t, status: "rejected", note: reason })
              }
            />
          </div>
        </div>
      ))}

      <TopicEditorDialog
        topic={editing}
        open={Boolean(editing)}
        onOpenChange={(open) => !open && setEditing(null)}
        actorId={actorId}
        publishOnSave
      />
    </div>
  );
}

export function TopicTable({ actorId }: { actorId: string }) {
  const topics = useAdminTopics();
  const { setStatus, remove, feature } = useTopicMutations(actorId);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<TopicStatus | "all">("all");
  const [editing, setEditing] = useState<EditableTopic | null>(null);
  const [creating, setCreating] = useState(false);

  const rows = useMemo(() => {
    const all = topics.data?.rows ?? [];
    const term = search.trim().toLowerCase();
    return all.filter(
      (t) =>
        (filter === "all" || t.status === filter) &&
        (term === "" ||
          t.title.toLowerCase().includes(term) ||
          t.choice_a.toLowerCase().includes(term) ||
          t.choice_b.toLowerCase().includes(term)),
    );
  }, [topics.data, search, filter]);

  const FILTERS: { key: TopicStatus | "all"; label: string }[] = [
    { key: "all", label: "All" },
    { key: "published", label: "Live" },
    { key: "pending", label: "Pending" },
    { key: "rejected", label: "Unpublished" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute top-1/2 left-2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search topics…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === f.key
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="mr-1 h-4 w-4" /> New topic
        </Button>
      </div>

      {topics.isLoading ? <Skeleton className="h-40" /> : null}
      {topics.isError ? <LoadError error={topics.error} /> : null}

      <div className="space-y-2">
        {rows.map((t) => (
          <div key={t.id} className="arena-panel flex flex-wrap items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  to="/topic/$id"
                  params={{ id: t.id }}
                  className="truncate font-bold hover:underline"
                >
                  {t.title}
                </Link>
                <StatusBadge status={t.status} />
                <DeadlineBadge closesAt={t.closes_at} />
                {t.is_featured ? <Badge variant="secondary">⚡ Headliner</Badge> : null}
              </div>
              <p className="text-xs text-muted-foreground">
                {(t.votes_a + t.votes_b).toLocaleString()} votes · {t.choice_a} vs {t.choice_b} ·{" "}
                {t.published_at
                  ? `published ${formatWhen(t.published_at)}`
                  : formatWhen(t.created_at)}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {t.status === "published" ? (
                <Button
                  size="sm"
                  variant="outline"
                  title={t.is_featured ? "Remove from the headliners" : "Add to the headliners"}
                  onClick={() => feature.mutate({ topic: t, on: !t.is_featured })}
                  disabled={feature.isPending}
                >
                  {t.is_featured ? (
                    <PinOff className="h-3.5 w-3.5" />
                  ) : (
                    <Pin className="h-3.5 w-3.5" />
                  )}
                </Button>
              ) : null}

              <Button size="sm" variant="outline" onClick={() => setEditing(t)}>
                <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
              </Button>

              {t.status === "published" ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setStatus.mutate({ topic: t, status: "pending" })}
                >
                  Unpublish
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => setStatus.mutate({ topic: t, status: "published" })}
                >
                  Publish
                </Button>
              )}

              <ConfirmAction
                trigger={
                  <Button size="sm" variant="destructive">
                    Delete
                  </Button>
                }
                title={`Delete "${t.title}"?`}
                description={`This also deletes ${(t.votes_a + t.votes_b).toLocaleString()} votes and every comment on it. Unpublishing keeps the data instead.`}
                confirmLabel="Delete permanently"
                destructive
                onConfirm={() => remove.mutate(t)}
              />
            </div>
          </div>
        ))}
        {rows.length === 0 && !topics.isLoading && !topics.isError ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No topics match that filter.
          </p>
        ) : null}
      </div>

      <TopicEditorDialog
        topic={editing}
        open={Boolean(editing)}
        onOpenChange={(open) => !open && setEditing(null)}
        actorId={actorId}
      />
      <TopicEditorDialog
        topic={null}
        open={creating}
        onOpenChange={setCreating}
        actorId={actorId}
      />
    </div>
  );
}
