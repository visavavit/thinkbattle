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

## Auth event storm on tab refocus (2026-08-25)

Symptom: switching away from the tab and back left the app stuck on loading skeletons,
with a burst of duplicate auth + notification requests in the network log.

Cause: Supabase's auth client re-emits `SIGNED_IN` (and token-refresh) events whenever
the tab regains focus, even when the session never changed. `src/routes/__root.tsx`
reacted to every event with `router.invalidate()` + `queryClient.invalidateQueries()`,
refetching every active query at once.

Fix: `src/routes/__root.tsx` keeps the last known user id in a ref and ignores
`SIGNED_IN` / `SIGNED_OUT` events when the id is unchanged. Only a real identity change
triggers invalidation.

Rules for future agents:

- Never invalidate the router or the whole query cache directly from `onAuthStateChange`
  without first comparing the user id to the previous one.
- If you add new auth-driven refresh logic, verify it by focusing another tab and
  returning: there should be no refetch burst.

## Browse search + guest voting migrations APPLIED (2026-08-26)

`supabase/migrations/20260826120000_*` (browse search) and `20260826130000_*` (guest
voting) have now been executed against the live database. The `NOT YET EXECUTED`
headers in those files are stale — do not re-apply them.

- The browse-search migration was applied with one edit: it referenced a
  `topics.wild_takes_count` column that does not exist, which was dropped from the
  `topic_cards` re-declaration.
- `src/integrations/supabase/types.ts` was regenerated from the real schema, replacing
  the earlier hand edit.
- Guest voting still needs `GUEST_COOKIE_SECRET` in the server environment — it is NOT
  set yet, so the feature stays off no matter what the admin switch says. That is
  deliberate: an unsigned device id would let one client claim any number of devices.
## Guest voting: the cache rule (2026-08-26)

Anonymous visitors can vote when an admin turns it on (Admin → Settings, default
**off**). Commenting still requires an account.

**Nothing in the SSR or document path may read or write the guest cookie.** `server.ts`
skips document caching when `Set-Cookie` is present, but has no protection against a
response that merely _varies_ by a request cookie. A loader reading `tt_gid` during SSR
would put one device's "you voted A" into a shared edge entry served to everyone else in
that colo, and it would fail silently.

So the cookie is touched in exactly one place: the POST server functions in
`src/lib/guest.functions.ts`, which dynamically import `src/lib/guest.server.ts`. Keep it
that way.

Rules for future agents:

- Never import `guest.server.ts` from a loader, a route `head()`, or a GET server fn.
- A guest's own vote comes from the localStorage mirror in `guest-vote-store.ts`, read in
  an effect. Do not replace it with a "have I voted?" endpoint — that puts an uncacheable
  round trip on every anonymous page view.
- `cast_guest_vote` returns resolved tallies, not a delta. Keep it that way: a guest whose
  storage was cleared but whose cookie survived cannot know their own prior side.
- The merge on sign-up skips closed topics. Do not add a bypass to `guard_topic_closed`;
  its value is that it holds on every write path including service_role.
- Do not put a read policy on `app_settings` to expose a flag — it holds
  `bot_tick_secret`. Add the key to the `site_flags()` definer function instead.
- Anti-abuse here is best-effort by design. Do not describe it as preventing ballot
  stuffing; `admin_purge_guest_votes` is the actual remedy.

## Paging: comments and browse are cursor-based (2026-08-26)

Both feeds page by keyset cursor, not a growing `limit`.

- Comments: `src/lib/comments-cursor.ts` + `comments-cache.ts`, ordered
  `created_at desc, id desc`. The old growing-limit version re-downloaded every prior row
  and grew the reply `.in()` URL past what proxies accept at a few hundred takes.
- Browse: `src/lib/feed-search.ts`, ordered by the sort column then `id`.

Rules for future agents:

- The `id` tiebreak is not decoration. Comment timestamps tie (the bot worker backdates
  `created_at`) and vote counts tie constantly; a page boundary inside a tie skips or
  repeats rows without it.
- Pass cursor timestamps through verbatim. `toISOString()` truncates Postgres microseconds
  to milliseconds and silently skips rows.
- Browse search is ILIKE against `topics.search_text` with a pg_trgm index, **not**
  tsvector: Postgres cannot segment Thai, so full-text search matches almost nothing.
- Browse's _status_ filter stays client-side on purpose — deadline state is read from the
  reader's clock because rows are cached for minutes.

## Environment variable rebinds require a dev-server restart (2026-08-26)

Symptom: after rebinding Lovable Cloud Supabase credentials, the preview still logged
`Missing Supabase environment variable(s): SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY` and
hydration replaced the SSR-rendered page with the root error boundary.

Cause: the running Vite dev server had cached the old environment variables. Rebinding
alone updated the deployment environment but did not flush the in-process cache, so the
browser bundle continued to be built/loaded without credentials.

Fix: kill the dev server process so the supervisor restarts it; the new process then picks
up the rebound variables. Also verify the browser console after a full page load, not just
the initial SSR paint.

Rules for future agents:

- After any Supabase credential rebind, restart the dev server and re-check the browser
  console for `Missing Supabase environment variable(s)`.
- If the error appears only on the published domain (`toktiang.com`) and not the
  preview, the production bundle was built before the rebind. Republish the app to
  regenerate the bundle with the current environment variables.
- Do not assume a successful SSR render means hydration is healthy; wait for the client
  bundle to mount and check for late errors.
