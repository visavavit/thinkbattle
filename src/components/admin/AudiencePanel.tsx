import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bot, Pause, Play, RefreshCw, Square, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createBotCampaign, runBotTickNow } from "@/lib/bots.functions";
import type { Tone } from "@/lib/bots.planner";
import { describeError, formatWhen, recordAudit } from "@/lib/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmAction } from "@/components/admin/ConfirmAction";

type Overview = Awaited<ReturnType<typeof fetchOverview>>[number];

async function fetchOverview() {
  const { data, error } = await supabase.rpc("admin_campaign_overview");
  if (error) throw error;
  return data ?? [];
}

const TONES: { value: Tone; label: string }[] = [
  { value: "calm", label: "Calm — measured, polite" },
  { value: "casual", label: "Casual — chatty internet voice" },
  { value: "spicy", label: "Spicy — blunt and funny" },
];

const PRESETS = [
  { label: "Slow burn", votes: 200, hours: 24, comments: 12, reactions: 120 },
  { label: "Busy day", votes: 600, hours: 8, comments: 30, reactions: 400 },
  { label: "Going viral", votes: 1200, hours: 3, comments: 60, reactions: 900 },
];

function statusTone(status: string) {
  if (status === "running") return "text-side-a";
  if (status === "error") return "text-destructive";
  if (status === "done") return "text-muted-foreground";
  return "text-foreground";
}

export function AudiencePanel({ actorId }: { actorId: string }) {
  const qc = useQueryClient();
  const create = useServerFn(createBotCampaign);
  const tickNow = useServerFn(runBotTickNow);

  const [topicId, setTopicId] = useState("");
  const [votes, setVotes] = useState(300);
  const [hours, setHours] = useState(12);
  const [pctA, setPctA] = useState(55);
  const [jitter, setJitter] = useState(12);
  const [comments, setComments] = useState(20);
  const [reactions, setReactions] = useState(180);
  const [tone, setTone] = useState<Tone>("casual");

  const topics = useQuery({
    queryKey: ["admin", "bot-topics"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("topics")
        .select("id, title, choice_a, choice_b")
        .eq("status", "published")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const campaigns = useQuery({ queryKey: ["admin", "campaigns"], queryFn: fetchOverview });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "campaigns"] });

  const selected = (topics.data ?? []).find((t) => t.id === topicId);

  const launch = useMutation({
    mutationFn: async () => {
      if (!topicId) throw new Error("Pick a topic first.");
      return await create({
        data: {
          topicId,
          totalVotes: votes,
          durationMinutes: Math.round(hours * 60),
          targetPctA: pctA,
          jitter,
          commentsTarget: comments,
          reactionsTarget: reactions,
          tone,
        },
      });
    },
    onSuccess: async (result) => {
      toast.success(`Campaign live — ${result.votes} votes scheduled over ${hours}h.`);
      await recordAudit({
        actorId,
        action: "audience.launch",
        entityType: "topic",
        entityId: topicId,
        summary: `Synthetic audience: ${result.votes} votes / ${hours}h`,
        detail: { pctA, jitter, comments, reactions, tone },
      });
      refresh();
    },
    onError: (error) => toast.error(describeError(error)),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("bot_campaigns")
        .update({ status, error_message: null, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (error) => toast.error(describeError(error)),
  });

  const purge = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("admin_purge_campaign", { _campaign_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Campaign and every trace of it removed.");
      refresh();
      qc.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
    onError: (error) => toast.error(describeError(error)),
  });

  const deliverNow = useMutation({
    mutationFn: async () => await tickNow({}),
    onSuccess: (r) => {
      toast.success(`Delivered ${r.votes ?? 0} votes, ${r.comments ?? 0} comments.`);
      refresh();
    },
    onError: (error) => toast.error(describeError(error)),
  });

  return (
    <div className="space-y-6">
      <div className="arena-panel space-y-4 p-4">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4" />
          <h3 className="text-base font-semibold">Launch a synthetic audience</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Seeds a topic with members that vote over real time, argue in the right column and react
          to each other. Delivery follows a natural interest curve — busy at first, quiet overnight —
          so numbers never tick up mechanically.
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Topic</Label>
            <Select value={topicId} onValueChange={setTopicId}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a published topic" />
              </SelectTrigger>
              <SelectContent>
                {(topics.data ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Voice</Label>
            <Select value={tone} onValueChange={(v) => setTone(v as Tone)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TONES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bot-votes">How many votes</Label>
            <Input
              id="bot-votes"
              type="number"
              min={1}
              max={5000}
              value={votes}
              onChange={(e) => setVotes(Number(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bot-hours">Spread over (hours)</Label>
            <Input
              id="bot-hours"
              type="number"
              min={0.25}
              max={336}
              step={0.25}
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bot-comments">Comments</Label>
            <Input
              id="bot-comments"
              type="number"
              min={0}
              max={300}
              value={comments}
              onChange={(e) => setComments(Number(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bot-reactions">Likes / dislikes</Label>
            <Input
              id="bot-reactions"
              type="number"
              min={0}
              max={3000}
              value={reactions}
              onChange={(e) => setReactions(Number(e.target.value))}
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>
              Target split — {pctA}% {selected ? selected.choice_a : "A"} / {100 - pctA}%{" "}
              {selected ? selected.choice_b : "B"}
            </Label>
            <Slider value={[pctA]} min={0} max={100} step={1} onValueChange={([v]) => setPctA(v ?? 50)} />
          </div>
          <div className="space-y-2">
            <Label>Realism jitter — {jitter}%</Label>
            <Slider
              value={[jitter]}
              min={0}
              max={40}
              step={1}
              onValueChange={([v]) => setJitter(v ?? 12)}
            />
            <p className="text-xs text-muted-foreground">
              How much the running split is allowed to wander before it settles on the target.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map((p) => (
            <Button
              key={p.label}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setVotes(p.votes);
                setHours(p.hours);
                setComments(p.comments);
                setReactions(p.reactions);
              }}
            >
              {p.label}
            </Button>
          ))}
          <div className="ml-auto flex gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => deliverNow.mutate()}
              disabled={deliverNow.isPending}
            >
              <RefreshCw className="mr-1 h-3.5 w-3.5" /> Deliver due now
            </Button>
            <Button onClick={() => launch.mutate()} disabled={launch.isPending || !topicId}>
              {launch.isPending ? "Scheduling…" : "Launch campaign"}
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-base font-semibold">Campaigns</h3>
        {campaigns.isLoading ? (
          <Skeleton className="h-24" />
        ) : (campaigns.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No campaigns yet.</p>
        ) : (
          (campaigns.data ?? []).map((c: Overview) => {
            const progress = c.total_votes > 0 ? (c.delivered_votes / c.total_votes) * 100 : 0;
            return (
              <div key={c.id} className="arena-panel space-y-3 p-4">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-semibold">{c.topic_title}</span>
                  <span className={`text-xs font-medium uppercase ${statusTone(c.status)}`}>
                    {c.status}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    live split {c.live_pct_a}/{100 - c.live_pct_a} · target {c.target_pct_a}/
                    {100 - c.target_pct_a}
                  </span>
                </div>

                {c.error_message ? (
                  <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
                    {c.error_message}
                  </p>
                ) : null}

                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-side-a transition-all"
                    style={{ width: `${Math.min(100, progress)}%` }}
                  />
                </div>

                <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                  <span>
                    Votes {c.delivered_votes}/{c.total_votes} · comments {c.delivered_comments}/
                    {c.comments_target} · reactions {c.delivered_reactions}/{c.reactions_target}
                  </span>
                  <span className="sm:text-right">
                    {c.pending_actions} queued
                    {c.next_run_at ? ` · next ${formatWhen(c.next_run_at)}` : ""}
                  </span>
                  <span>
                    Real: {c.real_votes} votes / {c.real_comments} comments
                  </span>
                  <span className="sm:text-right">
                    Synthetic: {c.synthetic_votes} votes / {c.synthetic_comments} comments
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {c.status === "running" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setStatus.mutate({ id: c.id, status: "paused" })}
                    >
                      <Pause className="mr-1 h-3.5 w-3.5" /> Pause
                    </Button>
                  ) : c.status === "paused" || c.status === "error" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setStatus.mutate({ id: c.id, status: "running" })}
                    >
                      <Play className="mr-1 h-3.5 w-3.5" /> Resume
                    </Button>
                  ) : null}
                  {c.status !== "stopped" && c.status !== "done" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setStatus.mutate({ id: c.id, status: "stopped" })}
                    >
                      <Square className="mr-1 h-3.5 w-3.5" /> Stop
                    </Button>
                  ) : null}
                  <ConfirmAction
                    title="Purge this campaign?"
                    description="Deletes every synthetic vote, comment and reaction this campaign created on the topic. Real activity is untouched."
                    confirmLabel="Purge"
                    onConfirm={() => purge.mutate(c.id)}
                    trigger={
                      <Button size="sm" variant="ghost" className="text-destructive">
                        <Trash2 className="mr-1 h-3.5 w-3.5" /> Purge
                      </Button>
                    }
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
