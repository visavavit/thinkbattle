import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { describeError, recordAudit } from "@/lib/admin";
import {
  readCommentImagesEnabled,
  readGuestVotingEnabled,
  setCommentImagesEnabled,
  setGuestVotingEnabled,
} from "@/lib/settings.functions";
import { countPendingPurges, sweepOrphanUploads } from "@/lib/uploads.functions";
import { Button } from "@/components/ui/button";
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

  const commentImages = useQuery({
    queryKey: ["admin", "settings", "comment-images"],
    queryFn: () => readCommentImagesEnabled(),
  });

  const pendingPurges = useQuery({
    queryKey: ["admin", "settings", "pending-purges"],
    queryFn: () => countPendingPurges(),
  });

  const toggleImages = useMutation({
    mutationFn: (enabled: boolean) => setCommentImagesEnabled({ data: { enabled } }),
    onSuccess: async ({ enabled }) => {
      await recordAudit({
        actorId,
        action: "settings.comment_images",
        entityType: "app_settings",
        entityId: "comment_images_enabled",
        summary: enabled ? "Image attachments turned on" : "Image attachments turned off",
        detail: { enabled },
      });
      queryClient.setQueryData(["admin", "settings", "comment-images"], { enabled });
      queryClient.invalidateQueries({ queryKey: ["site-flags"] });
      toast.success(enabled ? "Image attachments are on" : "Image attachments are off");
    },
    onError: (error) => toast.error(describeError(error, "Could not change that setting")),
  });

  const sweep = useMutation({
    mutationFn: () => sweepOrphanUploads(),
    onSuccess: ({ purged, failed }) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "settings", "pending-purges"] });
      if (purged === 0 && failed === 0) {
        toast.success("Nothing waiting — the bucket is clean");
        return;
      }
      toast.success(
        failed > 0
          ? `Deleted ${purged}; ${failed} could not be reached and will be retried`
          : `Deleted ${purged} image${purged === 1 ? "" : "s"}`,
      );
    },
    onError: (error) => toast.error(describeError(error, "Could not run the sweep")),
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

      <section className="arena-panel space-y-4 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="font-bold">Image attachments</h2>
            <p className="max-w-prose text-sm text-muted-foreground">
              Let signed-in members attach one picture to a take. Replies stay text-only, and guests
              cannot attach anything because they cannot post at all.
            </p>
            <p className="max-w-prose text-sm text-muted-foreground">
              Read this before turning it on: hiding a take now also <strong>deletes</strong> the
              picture on it, permanently, and unhiding does not bring it back. That is deliberate —
              a hidden take whose image is still fetchable at a public URL has not really been
              moderated. It also means the moderation queue is the only thing standing between the
              site and whatever people upload, so turn this on when someone is actually watching the
              queue.
            </p>
            <p className="max-w-prose text-sm text-muted-foreground">
              Like guest voting, the switch rides along in the cached page and takes up to a minute
              to reach readers. Turning it off stops new attachments; pictures already posted stay
              up until a moderator takes them down.
            </p>
          </div>
          {commentImages.isPending ? (
            <Skeleton className="h-6 w-11 shrink-0" />
          ) : (
            <Switch
              checked={commentImages.data?.enabled ?? false}
              disabled={toggleImages.isPending}
              onCheckedChange={(next) => toggleImages.mutate(next)}
              aria-label="Image attachments"
            />
          )}
        </div>
        {commentImages.isError ? (
          <p className="text-sm text-destructive">
            {describeError(commentImages.error, "Could not read that setting")}
          </p>
        ) : null}
      </section>

      <section className="arena-panel space-y-4 p-5">
        <div className="space-y-1">
          <h2 className="font-bold">Deleted images</h2>
          <p className="max-w-prose text-sm text-muted-foreground">
            Every upload is recorded, and the record is marked the moment nothing points at it any
            more — a take deleted, an image removed, a take hidden, a whole topic cascading away.
            Hiding and deleting run this sweep on the spot, so this button is for what those paths
            miss: a topic deleted with its thread under it, an image picked in a composer that was
            never submitted, or a delete that failed while storage was unreachable.
          </p>
          <p className="max-w-prose text-sm text-muted-foreground">
            Safe to run at any time. It only ever deletes files the database has already decided
            nothing references.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={sweep.isPending}
            onClick={() => sweep.mutate()}
          >
            {sweep.isPending ? "Deleting…" : "Delete them now"}
          </Button>
          {pendingPurges.isPending ? (
            <Skeleton className="h-4 w-24" />
          ) : pendingPurges.isError ? (
            <span className="text-sm text-destructive">
              {describeError(pendingPurges.error, "Could not count what is waiting")}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">
              {pendingPurges.data?.pending === 0
                ? "Nothing waiting"
                : `${pendingPurges.data?.pending} waiting`}
            </span>
          )}
        </div>
      </section>
    </div>
  );
}
