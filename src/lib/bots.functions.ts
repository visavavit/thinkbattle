import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { planCampaign, type Tone } from "@/lib/bots.planner";

export type CreateCampaignInput = {
  topicId: string;
  totalVotes: number;
  durationMinutes: number;
  targetPctA: number;
  jitter: number;
  commentsTarget: number;
  reactionsTarget: number;
  tone: Tone;
};

export const createBotCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: CreateCampaignInput) => input)
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const totalVotes = Math.min(5000, Math.max(1, Math.round(data.totalVotes)));
    const durationMinutes = Math.min(20160, Math.max(5, Math.round(data.durationMinutes)));
    const commentsTarget = Math.min(300, Math.max(0, Math.round(data.commentsTarget)));
    const reactionsTarget = Math.min(3000, Math.max(0, Math.round(data.reactionsTarget)));
    const targetPctA = Math.min(100, Math.max(0, Math.round(data.targetPctA)));
    const jitter = Math.min(40, Math.max(0, Math.round(data.jitter)));

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // personas that have not already voted on this topic
    const { data: personas, error: personaError } = await supabaseAdmin
      .from("bot_personas")
      .select("id, profile_id")
      .limit(2000);
    if (personaError) throw new Error(personaError.message);

    const { data: existingVotes } = await supabaseAdmin
      .from("votes")
      .select("user_id")
      .eq("topic_id", data.topicId);
    const taken = new Set((existingVotes ?? []).map((v) => v.user_id));
    const available = (personas ?? []).filter((p) => !taken.has(p.profile_id));
    if (available.length === 0) throw new Error("No free synthetic members left for this topic.");

    const startAt = new Date();
    const endsAt = new Date(startAt.getTime() + durationMinutes * 60_000);

    const { data: campaign, error } = await supabaseAdmin
      .from("bot_campaigns")
      .insert({
        topic_id: data.topicId,
        total_votes: Math.min(totalVotes, available.length),
        duration_minutes: durationMinutes,
        target_pct_a: targetPctA,
        jitter,
        comments_target: commentsTarget,
        reactions_target: reactionsTarget,
        tone: data.tone,
        status: "running",
        starts_at: startAt.toISOString(),
        ends_at: endsAt.toISOString(),
        created_by: context.userId,
      })
      .select("id, total_votes")
      .single();
    if (error) throw new Error(error.message);

    const actions = planCampaign({
      personaIds: available.map((p) => p.id),
      totalVotes: campaign.total_votes,
      durationMinutes,
      targetPctA,
      jitter,
      commentsTarget,
      reactionsTarget,
      tone: data.tone,
      startAt,
    });

    for (let i = 0; i < actions.length; i += 500) {
      const chunk = actions.slice(i, i + 500).map((a) => ({
        ...a,
        payload: a.payload as never,
        campaign_id: campaign.id,
      }));

      const { error: insertError } = await supabaseAdmin.from("bot_actions").insert(chunk);
      if (insertError) throw new Error(insertError.message);
    }

    return { id: campaign.id, planned: actions.length, votes: campaign.total_votes };
  });

export const runBotTickNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Forbidden");
    const { runBotTick } = await import("@/lib/bots.worker.server");
    return await runBotTick();
  });
