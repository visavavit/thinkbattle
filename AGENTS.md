## Resolved Launch Checklist — DO NOT RE-APPLY

The following items from the pre-launch audit have already been implemented and verified.
Do not re-run, re-apply, or undo these fixes unless the user explicitly asks for a change.

### Blockers (resolved)

1. **Bot tick endpoint no longer public.** `src/routes/api/public/bots/tick.ts` now authenticates against a dedicated `BOT_TICK_SECRET` via `x-bot-tick-secret` or `Authorization: Bearer`, using a timing-safe comparison. The Supabase publishable key is no longer accepted.
2. **Cron job points to the production apex domain.** The `bot-audience-tick` job posts to `https://toktiang.com/api/public/bots/tick`. The secret is pulled from a private `public.app_settings` table at runtime; no plaintext secret remains in migration files.
3. **Production environment variables confirmed.** `AI_GATEWAY_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and the five `R2_*` variables are set in the server environment.
4. **Build verified.** `bun run build` and `tsgo --noEmit` pass locally.

### Should fix before opening the doors (resolved)

5. **Open Graph / Twitter cards.** `src/lib/site.ts` provides `seoTags()`. `og:image` and `twitter:image` are wired into `__root.tsx`, `index.tsx`, `browse.tsx`, and `topic.$id.tsx` (topic pages use their own `cover_image_url`). A default share card exists at `/og-default.jpg`.
6. **Canonical URLs and sitemap.** Canonical links and `og:url` are present on all public routes. `/sitemap.xml` is generated from published topics and listed in `public/robots.txt`.
7. **Locale tags.** `__root.tsx` declares both `th_TH` and `en_US` as available locales; the EN/TH toggle is respected.
8. **Terms and privacy pages.** Bilingual `/terms` and `/privacy` pages exist via `src/components/LegalPage.tsx`.
9. **Bot disclosure removed.** All AI badges, footer notices, and About/Terms sections referencing the synthetic audience have been removed per the user's request.
10. **Auth redirect allow-list.** Requires adding `https://toktiang.com` and `https://www.toktiang.com` to the Supabase auth redirect allow-list; this is a dashboard configuration step that must be done by the user/owner before launch.

### Notes for future agents

- Do not add new bot/AI disclosures without asking the user first; the current stance is to keep them removed.
- Do not rotate the `BOT_TICK_SECRET` or change the cron URL without a clear reason.
- The `refresh_trending_scores` cron runs every minute; monitor its cost as the topic count grows.

## Performance: edge caching for public reads (2026-08-25)

`src/lib/public.functions.ts` fetches through a Supabase client whose `fetch` passes
Cloudflare `cf: { cacheTtl, cacheEverything: true }` options. This moves repeat public
reads off the worker isolate (cold isolates were adding ~1.2s TTFB from TLS handshakes).

Current TTLs — keep these unless asked to change:

- Feed / topic detail / headliners: 30s
- Taxonomy (categories, tags): 5m
- Vote counts for anonymous visitors: 5s
- Signed-in requests: cache bypassed entirely, so votes and comments show up immediately

Related: `src/server.ts` sets `s-maxage=30, stale-while-revalidate=300` on public HTML
documents, and signed-in users bypass that document cache too.

Rules for future agents:

- Do not add caching to any read that can return per-user state.
- Do not raise the anonymous vote-count TTL above a few seconds; the split bar must feel live.
- If a public read looks stale in the preview, check for an auth session first before
  changing TTLs.
