import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { describeError, recordAudit } from "@/lib/admin";
import { readGuestVotingEnabled, setGuestVotingEnabled } from "@/lib/settings.functions";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";

/**
 * Site-wide switches. English-only, like the rest of the curator dashboard.
 */
export function SettingsPanel({ actorId }: { actorId: string }) {
  const queryClient = useQueryClient();

  const guestVoting = useQuery({
    queryKey: ["admin", "settings", "guest-voting"],
    queryFn: () => readGuestVotingEnabled(),
  });

  const toggle = useMutation({
    mutationFn: (enabled: boolean) => setGuestVotingEnabled({ data: { enabled } }),
    onSuccess: async ({ enabled }) => {
      await recordAudit({
        actorId,
        action: "settings.guest_voting",
        entityType: "app_settings",
        entityId: "guest_voting_enabled",
        summary: enabled ? "Guest voting turned on" : "Guest voting turned off",
        detail: { enabled },
      });
      queryClient.setQueryData(["admin", "settings", "guest-voting"], { enabled });
      // The public flag is cached, so the arena catches up on its own clock.
      queryClient.invalidateQueries({ queryKey: ["site-flags"] });
      toast.success(enabled ? "Guest voting is on" : "Guest voting is off");
    },
    onError: (error) => toast.error(describeError(error, "Could not change that setting")),
  });

  return (
    <div className="space-y-6">
      <section className="arena-panel space-y-4 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="font-bold">Guest voting</h2>
            <p className="max-w-prose text-sm text-muted-foreground">
              Let visitors vote without an account. Commenting still requires signing in — a guest
              vote unlocks the tally, not the debate. Votes are tracked per device with a signed
              cookie, which stops casual double-voting and nothing more: anyone willing to clear
              cookies or open a private window can vote again.
            </p>
            <p className="max-w-prose text-sm text-muted-foreground">
              Changes take up to a minute to reach readers, because the flag rides along in the
              cached page. Turning this off stops new guest votes; it does not retract ones already
              counted.
            </p>
          </div>
          {guestVoting.isPending ? (
            <Skeleton className="h-6 w-11 shrink-0" />
          ) : (
            <Switch
              checked={guestVoting.data?.enabled ?? false}
              disabled={toggle.isPending}
              onCheckedChange={(next) => toggle.mutate(next)}
              aria-label="Guest voting"
            />
          )}
        </div>
        {guestVoting.isError ? (
          <p className="text-sm text-destructive">
            {describeError(guestVoting.error, "Could not read that setting")}
          </p>
        ) : null}
      </section>
    </div>
  );
}
