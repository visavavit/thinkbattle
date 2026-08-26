# Debate Arena

A web application built around binary (2-choice) voting paired with polarized, highly gamified community debates. Unlike standard polling websites, comment sections are strictly bifurcated into two distinct columns corresponding to the user's chosen side ("Why Choice A?" vs. "Why Choice B?").

Each column ranks its own arguments, so the strongest case for either side rises to the head of that side's column and the debate stays readable from both ends.

2. Target Audience & Core Use Cases

Casual Scanners: Users who want a quick pulse check on global trends, pop culture debates, and tech dilemmas via instant 2-choice voting.

Debaters & Commenters: Users who cast their vote, defend their stance in the corresponding column, and engage in tactical upvoting/downvoting.

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

Topic Grid Cards: Display title, category badge, tag pills, live percentage progress bar (Choice A vs. Choice B), total vote count, and comment count.

B. Topic & Voting System

Admin-Only Publishing: Only admin accounts can publish live topics to the public feed.

User Suggestion Engine: Users can submit topic ideas via a modal (Title, Choice A text, Choice B text, Category, Tags) entering a pending status queue for admin approval.

Binary Voting Mechanics:

Users select either Choice A or Choice B.

Restricted to 1 vote per user per topic.

Users are permitted to switch their vote later, which dynamically recalculates percentages and updates their comment association context.

Closing Date (optional): A topic can carry a deadline, or run indefinitely. Once the deadline passes the debate is archived in place — the split, the tallies and every take on both sides stay fully readable, but voting, switching sides, commenting, replying and reacting all stop. A closed topic drops out of the Headliner rotation, since the hero exists to invite a vote, and its trending score is damped to a quarter so a just-concluded debate fades off the front page over a day rather than vanishing the moment it ends; Newest, Top Voted, Browse and its own page are unaffected. Clearing the deadline reopens it.

C. The Bifurcated Comment Engine

Mandatory Voting Gate: Users must cast their vote on a topic before unlocking the comment box for that topic.

Side-by-Side Layout: Comments are strictly separated into two columns: Why Choice A? and Why Choice B?.

Sorting Tabs Per Side:

⭐ Top Liked: Sorted by net score (likes_count - dislikes_count), pinning the top 3 comments over a newest-first feed.

🕒 Newest: Reverse chronological order.

Comment Interaction: Individual comments feature simple Like and Dislike buttons.

Long Takes: A take or reply may run to 4000 characters. Anything past six lines
is clamped behind a _Show more_ toggle, so one essay cannot leave its column
towering over the other or push the reactions off the screen.

Editing: An author can revise their own take or reply while the debate is open.
Every revision is recorded — the take carries an _Edited_ marker, and anyone can
open it to read every version it has had, newest first. The trail is written by
a database trigger into a table nobody holds INSERT, UPDATE or DELETE on, so a
take that collected its likes on one argument cannot quietly become another.
Editing stops when the take is hidden or the deadline passes.

5. Technical Stack & Architecture

Frontend: React (or Next.js for SEO-optimized public topic pages).

Styling: Tailwind CSS.

Backend & Database: Supabase (PostgreSQL) leveraging real-time subscriptions for live vote/comment updates.

Hosting / Deployment: Cloudflare Pages/Workers.

8. MVP Implementation Roadmap

Phase 1 (Database & Auth): Initialize Supabase project, execute SQL schema, and configure user authentication.

Phase 2 (Admin Core): Build the admin dashboard to manually insert topics, choices, categories, and tags.

Phase 3 (Frontend Voting): Implement homepage feeds, filter tabs, topic detail view, and binary voting mechanics with optimistic UI updates.

Phase 4 (Bifurcated Comments): Build side-by-side comment columns, comment voting, and the Top Liked / Newest sorting switches.

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
across every comment in the arena. Comments can be _hidden_ (reversible: pulled
from public view and from the topic's comment count, still visible to their author)
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
can edit their own comment body, but only the body: not its author, topic, side,
parent, timestamp or edit trail, and never to un-hide it — and a closed topic
takes no further votes, takes, edits or reactions from any client, the synthetic
ones included. Moderation still works on a closed topic; hiding and deleting a
comment are the one thing the deadline does not freeze.

## Development

You need [Bun](https://bun.sh) installed.

```sh
git clone <this-repository-url>
cd <repository-name>
bun install
bun run dev
```

Copy `.env.example` to `.env` and fill in `VITE_SUPABASE_URL`,
`VITE_SUPABASE_PUBLISHABLE_KEY` and `VITE_SUPABASE_PROJECT_ID` (plus their
non-prefixed server twins) before starting the dev server. `.env` is not tracked
in git. Server-only secrets — `SUPABASE_SERVICE_ROLE_KEY`, the `R2_*`
variables and `BOT_TICK_SECRET` — live in the deployment environment, never in
the repository.

```sh
bun run build     # production build
bun run lint      # eslint
bun run format    # prettier
```

**Live app**: https://toktiang.com
