# VS — Binary Voting & Bifurcated Debate Platform

A loud, arena-style app where every topic is a 2-choice showdown, comments are split into two opposing columns, and a "Wild Takes" ranking surfaces the most controversial arguments.

## Decisions locked in
- Voting requires sign-in (no guest votes). Guests can browse, read, and see percentages.
- Sign-in with email/password and Google.
- Your account gets the admin role directly.
- Visual direction: loud arena / chaos energy — bold type, hard contrast, distinct colors per side.

## What gets built

### Backend (Lovable Cloud)
Tables: `categories`, `tags`, `topics` (title, choice A/B labels, category, status: pending/published/rejected, submitted_by), `topic_tags`, `votes` (one row per user per topic, switchable), `comments` (topic, side A/B, body, author), `comment_reactions` (like/dislike, one per user per comment), `user_roles` (separate table with `admin`/`user` enum + `has_role()` security-definer function).

Counts (`votes_a`, `votes_b`, comment likes/dislikes) maintained by database triggers so feeds and sorting stay fast. Row-level security throughout: public read of published topics and their comments; writes scoped to the signed-in user; admin-only publishing and moderation.

Wild Takes score is a stored generated column: `(likes + dislikes) - abs(likes - dislikes)`.

### Pages
- **Home `/`** — Headliner hero showing a neck-and-neck or high-velocity topic with instant voting, plus feed tabs: Trending, Neck-and-Neck (45–55% split), Top Voted, Newest. Topic grid cards with category badge, tag pills, live A/B split bar, total votes, Wild Takes count.
- **Topic `/topic/$id`** — Big binary vote widget with live percentages and optimistic updates; vote can be switched. Below it, two columns: "Why Choice A?" and "Why Choice B?", each with Top Liked / Wild Takes / Newest tabs, top 3 pinned per tab, and like/dislike buttons per comment. Comment box stays locked until you vote, and only unlocks in the column matching your side.
- **Browse `/browse`** — category and tag filtering across published topics.
- **Suggest a topic** — modal for signed-in users (title, choice A, choice B, category, tags) that enters the pending queue.
- **Auth `/auth`** — email/password + Google.
- **Admin `/admin`** (protected) — topic CRUD and publishing, category/tag management, and the suggestion moderation queue (approve → publish, or reject).

### Realtime
Live subscriptions on votes and comments so percentages, new comments, and reaction counts move without refresh.

## Technical notes
- TanStack Start routes; public topic pages keep SSR with per-topic head metadata for sharing. Admin and other gated pages live under the `_authenticated` layout.
- Reads/writes go through server functions with the user's session (RLS enforced); admin actions verify the admin role server-side, never client-side.
- Sorting is done in SQL: Top Liked by `likes - dislikes`, Wild Takes by the controversy score, Newest by `created_at`.
- Seed data: a handful of categories, tags, and published debate topics with votes and comments so the feed and Wild Takes tab are populated on first load.

## Build order
1. Schema, roles, RLS, triggers, seed data, and auth (email + Google).
2. Home feed, filter tabs, topic cards, hero headliner.
3. Topic page with binary voting and optimistic updates.
4. Bifurcated comments, reactions, and the three sorting tabs.
5. Topic suggestions, admin dashboard, and moderation queue.
