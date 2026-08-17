/**
 * Schedule planner for the synthetic audience engine.
 *
 * Everything a campaign will ever do is planned up front as timestamped rows,
 * which makes delivery idempotent (a worker tick only claims due rows) and lets
 * the admin see exactly what is still coming.
 *
 * Realism rules baked in here:
 *  - interest decays: most of the votes land in the first third of the window
 *  - people sleep: an hour-of-day weight suppresses 1am-6am local-ish activity
 *  - splits wander: the A/B share drifts around the target instead of snapping
 *  - arguing takes time: a comment lands minutes after that persona's vote
 */

export type Tone = "calm" | "casual" | "spicy";

export type PlannedAction = {
  persona_id: string;
  kind: "vote" | "comment" | "reaction";
  choice: "a" | "b" | null;
  run_at: string;
  payload: Record<string, unknown>;
};

export type PlanInput = {
  personaIds: string[];
  totalVotes: number;
  durationMinutes: number;
  targetPctA: number;
  jitter: number;
  commentsTarget: number;
  reactionsTarget: number;
  tone: Tone;
  startAt: Date;
};

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rough circadian weight: quiet overnight, busy evening. */
function hourWeight(hour: number) {
  const table = [
    0.18, 0.12, 0.08, 0.07, 0.08, 0.12, 0.25, 0.45, 0.7, 0.85, 0.9, 0.95, 1.0, 0.95, 0.88, 0.9,
    0.95, 1.0, 1.1, 1.2, 1.15, 0.95, 0.7, 0.4,
  ];
  return table[hour] ?? 0.8;
}

export function planCampaign(input: PlanInput): PlannedAction[] {
  const rand = mulberry32(Math.floor(Math.random() * 2 ** 31));
  const windowMs = input.durationMinutes * 60_000;
  const start = input.startAt.getTime();

  const pool = [...input.personaIds];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = pool[i]!;
    pool[i] = pool[j]!;
    pool[j] = tmp;
  }
  const voters = pool.slice(0, Math.min(input.totalVotes, pool.length));

  // --- timing: decaying interest + circadian rejection sampling -------------
  const offsets: number[] = [];
  for (let i = 0; i < voters.length; i++) {
    let offset = 0;
    for (let attempt = 0; attempt < 6; attempt++) {
      const u = rand();
      offset = windowMs * Math.pow(u, 2.1);
      const hour = new Date(start + offset).getUTCHours();
      if (rand() < hourWeight(hour) / 1.2) break;
    }
    offsets.push(offset);
  }
  offsets.sort((a, b) => a - b);

  // --- split: random walk around the target, converging as votes pile up ----
  const target = input.targetPctA / 100;
  const amplitude = input.jitter / 100;
  let drift = 0;
  let countA = 0;
  const actions: PlannedAction[] = [];
  const voteMeta: { persona: string; choice: "a" | "b"; at: number }[] = [];

  voters.forEach((persona, index) => {
    drift = drift * 0.86 + (rand() - 0.5) * amplitude * 0.9;
    const progress = (index + 1) / voters.length;
    const running = index === 0 ? target : countA / index;
    // pull harder toward the target the further along the campaign is
    const correction = (target - running) * (0.25 + 0.55 * progress);
    const p = Math.min(0.98, Math.max(0.02, target + drift + correction));
    const choice: "a" | "b" = rand() < p ? "a" : "b";
    if (choice === "a") countA++;
    const at = start + (offsets[index] ?? 0);
    voteMeta.push({ persona, choice, at });
    actions.push({
      persona_id: persona,
      kind: "vote",
      choice,
      run_at: new Date(at).toISOString(),
      payload: {},
    });
  });

  // --- comments: a subset of voters argue, minutes after voting -------------
  const commenters = [...voteMeta]
    .sort(() => rand() - 0.5)
    .slice(0, Math.min(input.commentsTarget, voteMeta.length));
  for (const v of commenters) {
    const delay = 30_000 + rand() * 25 * 60_000;
    actions.push({
      persona_id: v.persona,
      kind: "comment",
      choice: v.choice,
      run_at: new Date(v.at + delay).toISOString(),
      payload: { tone: input.tone },
    });
  }

  // --- reactions: spread across the window, side decided at delivery time ---
  for (let i = 0; i < input.reactionsTarget; i++) {
    const source = voteMeta[Math.floor(rand() * voteMeta.length)];
    if (!source) break;
    const at = source.at + rand() * Math.max(windowMs * 0.6, 10 * 60_000);
    actions.push({
      persona_id: source.persona,
      kind: "reaction",
      choice: source.choice,
      run_at: new Date(at).toISOString(),
      payload: {},
    });
  }

  return actions.sort((a, b) => a.run_at.localeCompare(b.run_at));
}
