import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { adminKeys, formatWhen } from "@/lib/admin";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const TONE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  delete: "destructive",
  ban: "destructive",
  hide: "destructive",
  reject: "outline",
};

function toneFor(action: string) {
  for (const [needle, variant] of Object.entries(TONE)) {
    if (action.includes(needle)) return variant;
  }
  return "secondary";
}

export function AuditLogPanel() {
  const log = useQuery({
    queryKey: adminKeys.audit,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_audit_log")
        .select("id, actor_id, action, entity_type, entity_id, summary, detail, created_at")
        .order("created_at", { ascending: false })
        .limit(150);
      if (error) throw error;
      const rows = data ?? [];

      const actorIds = [...new Set(rows.map((r) => r.actor_id))];
      const names = new Map<string, string>();
      if (actorIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, username")
          .in("id", actorIds);
        for (const p of profiles ?? []) names.set(p.id, p.username);
      }
      return { rows, names };
    },
  });

  if (log.isLoading) return <Skeleton className="h-40" />;

  const rows = log.data?.rows ?? [];
  const names = log.data?.names ?? new Map<string, string>();

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Every admin action, append-only. Nobody — including admins — can edit or delete these
        entries.
      </p>
      <ul className="space-y-1">
        {rows.map((entry) => {
          const detail = (entry.detail ?? {}) as Record<string, unknown>;
          const reason = typeof detail["reason"] === "string" ? detail["reason"] : null;
          return (
            <li
              key={entry.id}
              className="flex flex-wrap items-center gap-2 rounded-sm border border-border px-3 py-2 text-sm"
            >
              <Badge variant={toneFor(entry.action)}>{entry.action}</Badge>
              <span className="font-medium">{names.get(entry.actor_id) ?? "unknown admin"}</span>
              {entry.summary ? (
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {entry.summary}
                </span>
              ) : (
                <span className="flex-1" />
              )}
              {reason ? <span className="text-xs text-muted-foreground">“{reason}”</span> : null}
              <span className="text-xs text-muted-foreground">{formatWhen(entry.created_at)}</span>
            </li>
          );
        })}
        {rows.length === 0 ? (
          <li className="py-8 text-center text-sm text-muted-foreground">
            No admin actions recorded yet.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
