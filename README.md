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

Admin: Full CRUD access over categories, tags, topics, and the user suggestion moderation queue.

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

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://thinkbattle.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/305e7210-ac73-42ed-8142-a542ff7c57ad).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
