# Debate Arena

A web application built around binary (2-choice) voting paired with polarized, highly gamified community debates. Unlike standard polling websites, comment sections are strictly bifurcated into two distinct columns corresponding to the user's chosen side ("Why Choice A?" vs. "Why Choice B?").

The platform leverages a custom "Wild Takes" sorting algorithm—surface-ranking comments with high volumes of both likes and dislikes (controversy)—to lean into authentic, entertaining community discourse.

2. Target Audience & Core Use Cases

Casual Scanners: Users who want a quick pulse check on global trends, pop culture debates, and tech dilemmas via instant 2-choice voting.

Debaters & Commenters: Users who cast their vote, defend their stance in the corresponding column, and engage in tactical upvoting/downvoting.

Chaos Enthusiasts: Users who navigate straight to the Wild Takes tab to view the most roasted, unhinged, or heavily debated arguments on either side.

Admins: Curators who publish topics, manage tags/categories, and review user-submitted topic suggestions.

3. User Roles & Permissions

Guest / Anonymous User: Can view topics, browse categories/tags, view vote breakdown percentages, and read comments. Optional: Can cast a quick vote tracked via cookies/browser fingerprinting.

Authenticated User: Can cast/change votes, submit comments inside their chosen side's column, like/dislike comments, and submit topic suggestions.

Admin: Full CRUD access over categories, tags, topics, and the user suggestion moderation queue, plus comment moderation, member management and an audit trail. See "Admin capabilities" below.

4. Feature Specifications & Requirements

A. Home & Feed Architecture

Hero Banner (The Headliner): Displays a high-velocity or 50/50 "Neck-and-Neck" topic at the top of the homepage with instant voting capabilities.

Feed Filter Tabs:

🔥 Trending: High vote velocity + recent activity.

⚖️ Neck-and-Neck: Automatically filters topics sitting within a 45%–55% split range.

⭐ Top Voted: Highest lifetime vote counts.

🕒 Newest: Chronologically sorted new topics.

Topic Grid Cards: Display title, category badge, tag pills, live percentage progress bar (Choice A vs. Choice B), total vote count, and total "Wild Takes" count.

B. Topic & Voting System

Admin-Only Publishing: Only admin accounts can publish live topics to the public feed.

User Suggestion Engine: Users can submit topic ideas via a modal (Title, Choice A text, Choice B text, Category, Tags) entering a pending status queue for admin approval.

Binary Voting Mechanics:

Users select either Choice A or Choice B.

Restricted to 1 vote per user per topic.

Users are permitted to switch their vote later, which dynamically recalculates percentages and updates their comment association context.

Closing Date (optional): A topic can carry a deadline, or run indefinitely. Once the deadline passes the debate is archived in place — the split, the tallies and every take on both sides stay fully readable, but voting, switching sides, commenting, replying and reacting all stop. A closed topic drops out of the Headliner rotation, since the hero exists to invite a vote, and its trending score is damped to a quarter so a just-concluded debate fades off the front page over a day rather than vanishing the moment it ends; Newest, Top Voted, Browse and its own page are unaffected. Clearing the deadline reopens it.

C. The Bifurcated Comment & "Wild Takes" Engine

Mandatory Voting Gate: Users must cast their vote on a topic before unlocking the comment box for that topic.

Side-by-Side Layout: Comments are strictly separated into two columns: Why Choice A? and Why Choice B?.

Sorting Tabs Per Side:

⭐ Top Liked: Sorted by net score (likes_count - dislikes_count), pinning the top 3 comments.

🔥 Wild Takes: Sorted by engagement volume and controversy ratio (high combined count of likes and dislikes, with a close ratio). Pins the top 3 wild takes.

🕒 Newest: Reverse chronological order.

Comment Interaction: Individual comments feature simple Like and Dislike buttons.

5. Technical Stack & Architecture

Frontend: React (or Next.js for SEO-optimized public topic pages).

Styling: Tailwind CSS.

Backend & Database: Supabase (PostgreSQL) leveraging real-time subscriptions for live vote/comment updates.

Hosting / Deployment: Cloudflare Pages/Workers.


7. Key Algorithms (Pseudo-Logic for Supabase/SQL)

A. Controversy / "Wild Takes" Sorting Metric

To calculate true internet chaos, rank comments by combining total engagement volume with a balance penalty (where likes and dislikes are close to equal):

$$\text{Controversy Score} = (\text{likes} + \text{dislikes}) - \vert{}\text{likes} - \text{dislikes}\vert{}$$

Example 1: 50 Likes, 45 Dislives $\rightarrow (95) - \vert{}5\vert{} = 90$ (High Wild Take Score 🔥)

Example 2: 500 Likes, 2 Dislikes $\rightarrow (502) - \vert{}498\vert{} = 4$ (Low Wild Take Score)

8. MVP Implementation Roadmap

Phase 1 (Database & Auth): Initialize Supabase project, execute SQL schema, and configure user authentication.

Phase 2 (Admin Core): Build the admin dashboard to manually insert topics, choices, categories, and tags.

Phase 3 (Frontend Voting): Implement homepage feeds, filter tabs, topic detail view, and binary voting mechanics with optimistic UI updates.

Phase 4 (Bifurcated Comments & Wild Takes): Build side-by-side comment columns, comment voting, and the Top Liked / Wild Takes / Newest sorting switches.

Phase 5 (Community Polish): Implement user topic suggestion forms and submission moderation queues.

## Admin capabilities

The curator dashboard at `/admin` is organised into seven tabs.

**Overview** — live counts (topics, votes, comments, reports, members, bans), a
14-day votes and comments trend, and the published topics sitting closest to a
50/50 split. Open reports surface as a banner that jumps straight to the queue.

**Queue** — user suggestions with the suggester's name. Approve as-is, edit
before approving, or reject with a reason.

**Topics** — search and filter by status; create and fully edit topics (title,
description, both choices, cover art, category and tags); publish, unpublish
back into the queue, or delete behind a confirmation that names what gets
destroyed. Any published topic can be pinned as the Headliner, which overrides
the automatic hero pick on the homepage. Each topic can also be given a closing
date — free-form, or from the +24h/+3d/+7d/+30d presets — after which it becomes
a read-only result; leaving it empty runs the debate indefinitely, and a date in
the past closes it on the spot.

**Moderation** — the reports queue members file from any comment, plus a search
across every comment in the arena. Comments can be *hidden* (reversible: pulled
from public view and from the Wild Takes count, still visible to their author)
or deleted outright, and an author can be banned in one step from either view.
Admins also get hide/delete controls inline on topic pages.

**People** — member directory with per-user activity, grant/revoke admin, and
ban/unban. A banned member keeps read access but cannot vote, comment, react or
suggest topics.

**Categories & Tags** — add, rename and remove, each showing how many topics
would be affected.

**Audit log** — every admin action, append-only. No one, including admins, can
edit or delete entries.

Four invariants are enforced by the database rather than the UI, so they hold
no matter how a request arrives: the last admin cannot be demoted, admins cannot
be banned, only admins can change a comment's moderation fields — an author
can still edit their own comment body but cannot un-hide it — and a closed topic
takes no further votes, takes or reactions from any client, the synthetic ones
included. Moderation still works on a closed topic; hiding and deleting a
comment are the one thing the deadline does not freeze.

## Development

You need [Bun](https://bun.sh) installed.

```sh
git clone <this-repository-url>
cd <repository-name>
bun install
bun run dev
```

Copy `.env` values for `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` and
`VITE_SUPABASE_PROJECT_ID` (plus their non-prefixed server twins) before starting
the dev server. Server-only secrets — `SUPABASE_SERVICE_ROLE_KEY`, the `R2_*`
variables and `BOT_TICK_SECRET` — live in the deployment environment, never in
the repository.

```sh
bun run build     # production build
bun run lint      # eslint
bun run format    # prettier
```

**Live app**: https://toktiang.com
