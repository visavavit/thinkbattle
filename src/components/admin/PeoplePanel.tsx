import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search, Shield, ShieldOff, UserCheck, UserX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { adminKeys, describeError, formatWhen, recordAudit, type DirectoryRow } from "@/lib/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmAction } from "./ConfirmAction";

export function PeoplePanel({ actorId }: { actorId: string }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");

  const people = useQuery({
    queryKey: adminKeys.people(query),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_user_directory", {
        _search: query || undefined,
        _limit: 100,
      });
      if (error) throw error;
      return (data ?? []) as DirectoryRow[];
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin", "people"] });
    queryClient.invalidateQueries({ queryKey: adminKeys.stats });
    queryClient.invalidateQueries({ queryKey: adminKeys.audit });
    queryClient.invalidateQueries({ queryKey: ["is-admin"] });
  };

  const setRole = useMutation({
    mutationFn: async ({ user, admin }: { user: DirectoryRow; admin: boolean }) => {
      if (admin) {
        const { error } = await supabase
          .from("user_roles")
          .insert({ user_id: user.id, role: "admin" });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", user.id)
          .eq("role", "admin");
        if (error) throw error;
      }
      await recordAudit({
        actorId,
        action: admin ? "user.grant_admin" : "user.revoke_admin",
        entityType: "user",
        entityId: user.id,
        summary: user.username,
      });
    },
    onSuccess: (_d, v) => {
      toast.success(v.admin ? `${v.user.username} is now an admin` : `${v.user.username} demoted`);
      invalidate();
    },
    onError: (error) => toast.error(describeError(error, "Could not change that role")),
  });

  const setBan = useMutation({
    mutationFn: async ({
      user,
      banned,
      reason,
    }: {
      user: DirectoryRow;
      banned: boolean;
      reason?: string;
    }) => {
      if (banned) {
        const { error } = await supabase
          .from("user_bans")
          .insert({ user_id: user.id, reason: reason || null, banned_by: actorId });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("user_bans").delete().eq("user_id", user.id);
        if (error) throw error;
      }
      await recordAudit({
        actorId,
        action: banned ? "user.ban" : "user.unban",
        entityType: "user",
        entityId: user.id,
        summary: user.username,
        detail: reason ? { reason } : {},
      });
    },
    onSuccess: (_d, v) => {
      toast.success(v.banned ? `${v.user.username} banned` : `${v.user.username} reinstated`);
      invalidate();
    },
    onError: (error) => toast.error(describeError(error, "Could not update that ban")),
  });

  return (
    <div className="space-y-4">
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(search.trim());
        }}
      >
        <div className="relative min-w-56 flex-1">
          <Search className="absolute top-1/2 left-2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search by username…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button type="submit" size="sm">
          Search
        </Button>
      </form>

      {people.isLoading ? <Skeleton className="h-40" /> : null}

      <div className="space-y-2">
        {(people.data ?? []).map((u) => {
          const isSelf = u.id === actorId;
          return (
            <div key={u.id} className="arena-panel flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">{u.username}</span>
                  {u.is_admin ? <Badge variant="default">admin</Badge> : null}
                  {u.is_banned ? <Badge variant="destructive">banned</Badge> : null}
                  {isSelf ? <Badge variant="outline">you</Badge> : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  joined {formatWhen(u.created_at)} · {u.votes_count} votes · {u.comments_count}{" "}
                  comments · {u.topics_count} suggested
                  {u.hidden_comments_count > 0 ? ` · ${u.hidden_comments_count} hidden` : ""}
                  {u.reports_against > 0 ? ` · ${u.reports_against} reported` : ""}
                </p>
                {u.is_banned && u.ban_reason ? (
                  <p className="mt-1 text-xs text-destructive">Ban reason: {u.ban_reason}</p>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-2">
                {u.is_admin ? (
                  <ConfirmAction
                    trigger={
                      <Button size="sm" variant="outline" disabled={isSelf}>
                        <ShieldOff className="mr-1 h-3.5 w-3.5" /> Revoke admin
                      </Button>
                    }
                    title={`Revoke admin from ${u.username}?`}
                    description="They keep their account and history but lose access to this dashboard."
                    confirmLabel="Revoke"
                    onConfirm={() => setRole.mutate({ user: u, admin: false })}
                  />
                ) : (
                  <ConfirmAction
                    trigger={
                      <Button size="sm" variant="outline" disabled={u.is_banned}>
                        <Shield className="mr-1 h-3.5 w-3.5" /> Make admin
                      </Button>
                    }
                    title={`Make ${u.username} an admin?`}
                    description="Full control over topics, comments, taxonomy, bans and other admins."
                    confirmLabel="Grant admin"
                    onConfirm={() => setRole.mutate({ user: u, admin: true })}
                  />
                )}

                {u.is_banned ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setBan.mutate({ user: u, banned: false })}
                  >
                    <UserCheck className="mr-1 h-3.5 w-3.5" /> Unban
                  </Button>
                ) : (
                  <ConfirmAction
                    trigger={
                      <Button size="sm" variant="destructive" disabled={isSelf || u.is_admin}>
                        <UserX className="mr-1 h-3.5 w-3.5" /> Ban
                      </Button>
                    }
                    title={`Ban ${u.username}?`}
                    description="They keep read access but can no longer vote, comment, react or suggest topics."
                    confirmLabel="Ban user"
                    destructive
                    reasonLabel="Reason (kept in the audit log)"
                    reasonPlaceholder="Repeated harassment…"
                    onConfirm={(reason) => setBan.mutate({ user: u, banned: true, reason })}
                  />
                )}
              </div>
            </div>
          );
        })}
        {(people.data ?? []).length === 0 && !people.isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nobody matches that.</p>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">
        Admins cannot be banned and the last admin cannot be demoted — the database refuses both, so
        the arena can never lock itself out.
      </p>
    </div>
  );
}
