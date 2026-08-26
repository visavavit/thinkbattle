/**
 * Synthetic audience worker. Called once a minute by the scheduler.
 *
 * Contract: bounded work per run, single-flight lease, idempotent progress
 * (each action row flips pending -> claimed -> done), and a circuit breaker
 * that parks the campaign when the AI gateway refuses (402/403).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const LOCK_NAME = "bot_tick";
const LOCK_SECONDS = 110;
const MAX_ACTIONS_PER_TICK = 80;
const MAX_COMMENTS_PER_TICK = 8;

type ActionRow = {
  id: number;
  campaign_id: string;
  persona_id: string;
  kind: "vote" | "comment" | "reaction";
  choice: "a" | "b" | null;
  payload: Record<string, unknown>;
  run_at: string;
};

class GatewayBlocked extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function acquireLock() {
  const until = new Date(Date.now() + LOCK_SECONDS * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("job_locks")
    .upsert({ name: LOCK_NAME, locked_until: until, updated_at: new Date().toISOString() }, {
      onConflict: "name",
      ignoreDuplicates: false,
    })
    .lt("locked_until", new Date().toISOString())
    .select("name");
  if (error) {
    // first ever run: the row does not exist yet, so the lt() filter matched nothing
    const insert = await supabaseAdmin
      .from("job_locks")
      .insert({ name: LOCK_NAME, locked_until: until })
      .select("name");
    return !insert.error;
  }
  return (data ?? []).length > 0;
}

async function releaseLock() {
  await supabaseAdmin
    .from("job_locks")
    .update({ locked_until: new Date(Date.now() - 1000).toISOString() })
    .eq("name", LOCK_NAME);
}

const FALLBACKS: Record<string, string[]> = {
  calm: [
    "both sides have a point but this one just holds up better long term",
    "not a strong opinion, it's simply the more practical answer",
    "i've gone back and forth on this and landed here",
  ],
  casual: [
    "idk how this is even a debate lol",
    "been saying this for years, glad someone gets it",
    "my whole group chat agrees with me on this one",
  ],
  spicy: [
    "the other side is genuinely not okay",
    "wild that people vote the other way with a straight face",
    "losing my mind reading the other column rn",
  ],
};

function fallbackTake(tone: string) {
  const pool = FALLBACKS[tone] ?? FALLBACKS["casual"]!;
  return pool[Math.floor(Math.random() * pool.length)]!;
}

/** One gateway call per topic+side group; returns short, human-shaped takes. */
async function generateTakes(args: {
  title: string;
  side: string;
  otherSide: string;
  tone: string;
  count: number;
}): Promise<string[]> {
  // Server-only. AI_GATEWAY_API_KEY is the name to set going forward; the legacy
  // name is still read so an existing deployment keeps working until it is renamed.
  const key = process.env["AI_GATEWAY_API_KEY"] || process.env["LOVABLE_API_KEY"];
  if (!key) return Array.from({ length: args.count }, () => fallbackTake(args.tone));

  const toneHint =
    args.tone === "calm"
      ? "measured, polite, slightly nerdy"
      : args.tone === "spicy"
        ? "blunt, funny, a bit provocative but never abusive or hateful"
        : "casual internet chat, playful";

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content:
            "You write short forum comments for a two-sided debate site. Voice: real people, " +
            "not marketing. 4 to 25 words each. Mostly lowercase, imperfect punctuation, no " +
            "hashtags, no emoji spam, no quotation marks, never mention being an AI. Vary the " +
            "structure a lot: some jokes, some anecdotes, some one-liners. " +
            "Reply with a JSON array of strings and nothing else.",
        },
        {
          role: "user",
          content: `Debate: "${args.title}". Write ${args.count} distinct comments arguing for "${args.side}" (against "${args.otherSide}"). Tone: ${toneHint}.`,
        },
      ],
    }),
  });

  if (res.status === 402 || res.status === 403) {
    const body = await res.text();
    throw new GatewayBlocked(res.status, body.slice(0, 300));
  }
  if (!res.ok) return Array.from({ length: args.count }, () => fallbackTake(args.tone));

  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = json.choices?.[0]?.message?.content ?? "";
  const match = raw.match(/\[[\s\S]*\]/);
  let takes: string[] = [];
  try {
    takes = match ? (JSON.parse(match[0]) as string[]) : [];
  } catch {
    takes = raw
      .split("\n")
      .map((l) => l.replace(/^[-*\d.\s]+/, "").trim())
      .filter(Boolean);
  }
  takes = takes.filter((t) => typeof t === "string" && t.trim().length > 3).map((t) => t.trim());
  while (takes.length < args.count) takes.push(fallbackTake(args.tone));
  return takes.slice(0, args.count);
}

export async function runBotTick() {
  const got = await acquireLock();
  if (!got) return { skipped: "locked" as const };

  const summary = { votes: 0, comments: 0, reactions: 0, campaigns: 0, blocked: false };

  try {
    const { data: campaigns } = await supabaseAdmin
      .from("bot_campaigns")
      .select("id, topic_id, tone, status")
      .eq("status", "running");

    if (!campaigns || campaigns.length === 0) return summary;
    summary.campaigns = campaigns.length;

    const ids = campaigns.map((c) => c.id);
    const nowIso = new Date().toISOString();

    const { data: claimedRows } = await supabaseAdmin
      .from("bot_actions")
      .select("id")
      .in("campaign_id", ids)
      .eq("status", "pending")
      .lte("run_at", nowIso)
      .order("run_at", { ascending: true })
      .limit(MAX_ACTIONS_PER_TICK);

    const claimIds = (claimedRows ?? []).map((r) => r.id);
    if (claimIds.length === 0) {
      await finishCompleted(ids);
      return summary;
    }

    const { data: actions } = await supabaseAdmin
      .from("bot_actions")
      .update({ status: "claimed", claimed_at: nowIso })
      .in("id", claimIds)
      .eq("status", "pending")
      .select("id, campaign_id, persona_id, kind, choice, payload, run_at");

    const due = (actions ?? []) as unknown as ActionRow[];
    if (due.length === 0) return summary;

    // persona -> profile map
    const personaIds = [...new Set(due.map((a) => a.persona_id))];
    const { data: personas } = await supabaseAdmin
      .from("bot_personas")
      .select("id, profile_id")
      .in("id", personaIds);
    const profileOf = new Map((personas ?? []).map((p) => [p.id, p.profile_id]));

    const topicOf = new Map(campaigns.map((c) => [c.id, c.topic_id]));
    const toneOf = new Map(campaigns.map((c) => [c.id, c.tone]));
    const delivered = new Map<string, { votes: number; comments: number; reactions: number }>();
    const bump = (id: string, k: "votes" | "comments" | "reactions") => {
      const row = delivered.get(id) ?? { votes: 0, comments: 0, reactions: 0 };
      row[k] += 1;
      delivered.set(id, row);
    };
    const doneIds: number[] = [];
    const skipIds: number[] = [];

    // ---- votes -------------------------------------------------------------
    for (const action of due.filter((a) => a.kind === "vote")) {
      const profile = profileOf.get(action.persona_id);
      const topic = topicOf.get(action.campaign_id);
      if (!profile || !topic || !action.choice) {
        skipIds.push(action.id);
        continue;
      }
      const { error } = await supabaseAdmin.from("votes").insert({
        topic_id: topic,
        user_id: profile,
        choice: action.choice,
        is_synthetic: true,
        created_at: action.run_at,
      });
      if (error && !error.message.includes("duplicate key")) {
        skipIds.push(action.id);
        continue;
      }
      if (!error) {
        bump(action.campaign_id, "votes");
        summary.votes++;
      }
      doneIds.push(action.id);
    }

    // ---- comments (grouped per topic + side, one gateway call each) --------
    const commentActions = due.filter((a) => a.kind === "comment").slice(0, MAX_COMMENTS_PER_TICK);
    const groups = new Map<string, ActionRow[]>();
    for (const a of commentActions) {
      const key = `${a.campaign_id}:${a.choice}`;
      groups.set(key, [...(groups.get(key) ?? []), a]);
    }
    for (const [key, group] of groups) {
      const campaignId = key.split(":")[0]!;
      const topicId = topicOf.get(campaignId);
      if (!topicId) {
        skipIds.push(...group.map((g) => g.id));
        continue;
      }
      const { data: topic } = await supabaseAdmin
        .from("topics")
        .select("title, choice_a, choice_b")
        .eq("id", topicId)
        .maybeSingle();
      if (!topic) {
        skipIds.push(...group.map((g) => g.id));
        continue;
      }
      const side = group[0]!.choice === "a" ? topic.choice_a : topic.choice_b;
      const other = group[0]!.choice === "a" ? topic.choice_b : topic.choice_a;
      let takes: string[];
      try {
        takes = await generateTakes({
          title: topic.title,
          side,
          otherSide: other,
          tone: String(toneOf.get(campaignId) ?? "casual"),
          count: group.length,
        });
      } catch (err) {
        if (err instanceof GatewayBlocked) {
          summary.blocked = true;
          await supabaseAdmin
            .from("bot_campaigns")
            .update({
              status: "error",
              error_message:
                err.status === 402
                  ? "Paused: AI credits are exhausted. Top up, then resume the campaign."
                  : "Paused: AI access is blocked for this workspace.",
              updated_at: new Date().toISOString(),
            })
            .eq("status", "running");
          await supabaseAdmin
            .from("bot_actions")
            .update({ status: "pending", claimed_at: null })
            .in(
              "id",
              due.filter((d) => !doneIds.includes(d.id)).map((d) => d.id),
            );
          return summary;
        }
        skipIds.push(...group.map((g) => g.id));
        continue;
      }

      // avoid re-posting a take that already exists on this topic
      const { data: existing } = await supabaseAdmin
        .from("comments")
        .select("body")
        .eq("topic_id", topicId)
        .limit(200);
      const seen = new Set((existing ?? []).map((c) => c.body.trim().toLowerCase()));

      for (let i = 0; i < group.length; i++) {
        const action = group[i]!;
        const profile = profileOf.get(action.persona_id);
        const body = (takes[i] ?? "").trim();
        if (!profile || body.length < 3 || seen.has(body.toLowerCase())) {
          skipIds.push(action.id);
          continue;
        }
        seen.add(body.toLowerCase());
        const { error } = await supabaseAdmin.from("comments").insert({
          topic_id: topicId,
          user_id: profile,
          side: action.choice!,
          body,
          is_synthetic: true,
          created_at: action.run_at,
        });
        if (error) {
          skipIds.push(action.id);
          continue;
        }
        bump(action.campaign_id, "comments");
        summary.comments++;
        doneIds.push(action.id);
      }
    }
    // comments that did not fit this tick stay pending for the next one
    const deferred = due
      .filter((a) => a.kind === "comment" && !commentActions.includes(a))
      .map((a) => a.id);
    if (deferred.length > 0) {
      await supabaseAdmin
        .from("bot_actions")
        .update({ status: "pending", claimed_at: null })
        .in("id", deferred);
    }

    // ---- reactions ---------------------------------------------------------
    const reactionActions = due.filter((a) => a.kind === "reaction");
    if (reactionActions.length > 0) {
      const topicIds = [
        ...new Set(reactionActions.map((a) => topicOf.get(a.campaign_id)).filter(Boolean)),
      ] as string[];
      const { data: comments } = await supabaseAdmin
        .from("comments")
        .select("id, topic_id, side, user_id")
        .in("topic_id", topicIds)
        .eq("is_hidden", false);
      const byTopic = new Map<string, typeof comments>();
      for (const c of comments ?? []) {
        byTopic.set(c.topic_id, [...(byTopic.get(c.topic_id) ?? []), c]);
      }

      for (const action of reactionActions) {
        const profile = profileOf.get(action.persona_id);
        const topicId = topicOf.get(action.campaign_id);
        const pool = topicId ? (byTopic.get(topicId) ?? []) : [];
        const candidates = pool.filter((c) => c.user_id !== profile);
        if (!profile || candidates.length === 0) {
          skipIds.push(action.id);
          continue;
        }
        // 75% of the time react to your own side (a like), otherwise cross-side
        const wantOwnSide = Math.random() < 0.75;
        const preferred = candidates.filter((c) =>
          wantOwnSide ? c.side === action.choice : c.side !== action.choice,
        );
        const target = (preferred.length > 0 ? preferred : candidates)[
          Math.floor(Math.random() * (preferred.length > 0 ? preferred.length : candidates.length))
        ]!;
        const sameSide = target.side === action.choice;
        // agreeing mostly likes; disagreeing mostly dislikes — the same shape
        // real readers produce, so the ranking stays believable
        const value = sameSide
          ? Math.random() < 0.92
            ? 1
            : -1
          : Math.random() < 0.72
            ? -1
            : 1;
        const { error } = await supabaseAdmin
          .from("comment_reactions")
          .insert({ comment_id: target.id, user_id: profile, value });
        if (!error) {
          bump(action.campaign_id, "reactions");
          summary.reactions++;
        }
        doneIds.push(action.id);
      }
    }

    if (doneIds.length > 0) {
      await supabaseAdmin
        .from("bot_actions")
        .update({ status: "done", done_at: new Date().toISOString() })
        .in("id", doneIds);
    }
    if (skipIds.length > 0) {
      await supabaseAdmin.from("bot_actions").update({ status: "skipped" }).in("id", skipIds);
    }

    for (const [campaignId, counts] of delivered) {
      const { data: current } = await supabaseAdmin
        .from("bot_campaigns")
        .select("delivered_votes, delivered_comments, delivered_reactions")
        .eq("id", campaignId)
        .maybeSingle();
      if (!current) continue;
      await supabaseAdmin
        .from("bot_campaigns")
        .update({
          delivered_votes: current.delivered_votes + counts.votes,
          delivered_comments: current.delivered_comments + counts.comments,
          delivered_reactions: current.delivered_reactions + counts.reactions,
          updated_at: new Date().toISOString(),
        })
        .eq("id", campaignId);
    }

    await finishCompleted(ids);
    return summary;
  } finally {
    await releaseLock();
  }
}

/** Mark campaigns with nothing left to deliver as done. */
async function finishCompleted(campaignIds: string[]) {
  for (const id of campaignIds) {
    const { count } = await supabaseAdmin
      .from("bot_actions")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", id)
      .in("status", ["pending", "claimed"]);
    if ((count ?? 0) === 0) {
      await supabaseAdmin
        .from("bot_campaigns")
        .update({ status: "done", updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("status", "running");
    }
  }
}
