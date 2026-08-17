import { createFileRoute } from "@tanstack/react-router";

/**
 * Scheduler entry point for the synthetic audience engine.
 * Called every minute by pg_cron with the project's apikey header.
 */
export const Route = createFileRoute("/api/public/bots/tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey") ?? "";
        const expected = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"];
        if (!expected || apikey !== expected) {
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
