import { createFileRoute } from "@tanstack/react-router";

/**
 * Scheduler entry point for the synthetic audience engine.
 * Called every minute by pg_cron with a dedicated, server-only shared secret.
 * Never authenticate this with the publishable key: that key ships to browsers.
 */
function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const Route = createFileRoute("/api/public/bots/tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env["BOT_TICK_SECRET"];
        const provided =
          request.headers.get("x-bot-tick-secret") ??
          (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
        if (!expected || !provided || !timingSafeEqual(provided, expected)) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { runBotTick } = await import("@/lib/bots.worker.server");
        try {
          const result = await runBotTick();
          return Response.json(result);
        } catch (err) {
          console.error("bot tick failed", err);
          return Response.json({ error: (err as Error).message }, { status: 500 });
        }
      },
    },
  },
});
