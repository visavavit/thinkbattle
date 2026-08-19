/** English dictionary — the source of truth for the key set. */
export const en = {
  // ---- brand / shell
  "brand.arena": "toktiang.com",
  "nav.feed": "Feed",
  "nav.browse": "Browse",
  "nav.admin": "Admin",
  "nav.signIn": "Sign in",
  "nav.signOut": "Sign out",
  "footer.tagline": "toktiang.com · two choices, both sides heard.",
  "lang.switchToThai": "Switch to Thai",
  "lang.switchToEnglish": "Switch to English",

  // ---- notifications
  "notif.title": "Notifications",
  "notif.open": "Notifications",
  "notif.unreadBadge": "{n} unread",
  "notif.empty": "Nothing yet. Post a take and see who bites.",
  "notif.markAllRead": "Mark all read",
  "notif.someone": "Someone",
  "notif.reply": "{actor} replied to your take",
  "notif.like": "{actor} liked your take",
  "notif.dislike": "{actor} dumped on your take",
  "notif.topicPublished": "Your topic is live",
  "notif.deleted": "This take is gone",
  "notif.justNow": "just now",
  "notif.minutesAgo": "{n}m ago",
  "notif.hoursAgo": "{n}h ago",
  "notif.daysAgo": "{n}d ago",

  // ---- error / not found
  "notFound.title": "Page not found",
  "notFound.body": "The page you're looking for doesn't exist or has been moved.",
  "common.goHome": "Go home",
  "error.title": "This page didn't load",
  "error.body": "Something went wrong on our end. You can try refreshing or head back home.",
  "common.tryAgain": "Try again",
  "common.cancel": "Cancel",

  // ---- home
  "home.heroLead": "Pick a side.",
  "home.heroAccent": " Defend it.",
  "home.heroSub":
    "Vote on the debates people are actually having, then read the best arguments from both sides — side by side.",
  "home.headliner": "⚡ The Headliner",
  "home.castVote": "Cast your vote",
  "home.emptyTab": "Nothing in this tab yet — try another filter.",
  "tab.trending": "Trending",
  "tab.neck": "Neck-and-Neck",
  "tab.top": "Top Voted",
  "tab.newest": "Newest",

  // ---- browse
  "browse.title": "Browse the arena",
  "browse.allCategories": "All categories",
  "browse.allTags": "All tags",
  "browse.empty": "No debates match these filters.",

  // ---- topic page
  "topic.backToFeed": "Back to the feed",
  "topic.loadFailed": "This debate didn't load",
  "topic.notFound": "Debate not found",

  // ---- vote / split bar
  "vote.noVotes": "No votes yet",
  "vote.noVotesAria": "No votes yet. {a} versus {b}.",
  "vote.yourVote": "your vote",
  "vote.countOne": "{n} vote",
  "vote.countMany": "{n} votes",
  "vote.totalVotes": "{n} total votes",
  "vote.canSwitch": " — you can switch sides any time",
  "vote.pickToUnlock": " — pick a side to unlock the comments",
  "vote.signInToVote": "sign in to vote",
  "vote.failed": "Vote failed. Try again.",
  "vote.switched": "Side switched — your earlier takes stay up, marked as changed their mind.",
  "vote.suspendedVote": "Your account is suspended — voting is disabled.",
  "vote.suspendedReact": "Your account is suspended — reactions are disabled.",
  "vote.signInToReact": "Sign in to like or dislike.",

  // ---- side switch dialog
  "switch.title": "Switch to {label}?",
  "switch.body": "Your vote moves to the other side and the split updates straight away.",
  "switch.bodyWithTakes":
    " Your {n} take(s) under “Why {label}?” stay published with their likes, and will be marked “Changed their mind”. You won't be able to post there any more.",
  "switch.bodyNoTakes": " You'll be able to post in the other column instead.",
  "switch.confirm": "Switch side",

  // ---- ban banner
  "ban.title": "Your account is suspended.",
  "ban.body":
    "You can still read every debate, but voting, commenting and reacting are disabled.",
  "ban.reason": " Reason: {reason}",

  // ---- comment columns
  "col.why": "Why {label}?",
  "col.showOneSide": "Show one side's takes at a time",
  "col.showing": "Showing {label}",
  "comment.loadMore": "Load more takes",
  "comment.loading": "Loading…",
  "sort.top": "Top Liked",
  "sort.wild": "Wild Takes",
  "sort.newest": "Newest",
  "comment.placeholder": "Defend your side...",
  "comment.post": "Post your take",
  "comment.posted": "Take posted 🔥",
  "comment.tooLong": "That take is too long (2000 characters max).",
  "comment.failed": "Could not post that take.",
  "comment.lockedBanned": "Your account is suspended — you can read but not post.",
  "comment.lockedOtherSide": "You voted for the other side — this column is read-only.",
  "comment.lockedVote": "Vote above to unlock this column.",
  "comment.lockedSignIn": "Sign in and vote to join this column.",
  "comment.empty": "No takes here yet. Be the first.",
  "comment.anonymous": "anonymous",
  "comment.changedMind": "Changed their mind",
  "comment.changedMindTitle": "This reader has since switched to {label}.",
  "comment.hidden": "Hidden by a moderator",
  "comment.wildTake": "Wild take",
  "comment.topTake": "Top take",

  // ---- replies
  "reply.action": "Reply",
  "reply.placeholder": "Reply to this take...",
  "reply.posted": "Reply posted",
  "reply.failed": "Could not post that reply.",

  // ---- reports
  "report.tooltip": "Report to moderators",
  "report.aria": "Report this comment",
  "report.title": "Report this comment",
  "report.body": "Moderators see the comment, who wrote it and your reason.",
  "report.placeholder": "Harassment, spam, off-topic…",
  "report.send": "Send report",
  "report.needReason": "Tell the moderators what's wrong with it.",
  "report.duplicate": "You already reported this one.",
  "report.failed": "Could not send that report",
  "report.sent": "Reported — a moderator will take a look.",

  // ---- moderation (inline, admin)
  "mod.hide": "Hide from the public",
  "mod.hideAria": "Hide this comment",
  "mod.restore": "Restore this comment",
  "mod.delete": "Delete permanently",
  "mod.deleteAria": "Delete this comment",
  "mod.confirmDelete": "Delete {name}'s comment permanently?",
  "mod.failed": "Moderation failed",
  "mod.deleted": "Comment deleted",
  "mod.hidden": "Comment hidden",
  "mod.restored": "Restored",

  // ---- suggest dialog
  "suggest.trigger": "Suggest",
  "suggest.title": "Suggest a showdown",
  "suggest.body": "Admins review every suggestion before it hits the feed.",
  "suggest.fieldTitle": "Title",
  "suggest.titlePlaceholder": "Cereal before milk or milk before cereal?",
  "suggest.description": "Description (optional)",
  "suggest.choiceA": "Choice A",
  "suggest.choiceB": "Choice B",
  "suggest.category": "Category",
  "suggest.tags": "Tags",
  "suggest.submit": "Submit for review",
  "suggest.sent": "Sent to the moderation queue 🔥",
  "suggest.failed": "Could not submit your idea.",
  "suggest.checkForm": "Check the form",
  "suggest.errTitle": "Title must be at least 6 characters",
  "suggest.errChoiceA": "Choice A is required",
  "suggest.errChoiceB": "Choice B is required",
  "suggest.errCategory": "Pick a category",

  // ---- tag input
  "tags.placeholder": "Type a tag, press Enter",
  "tags.max": "Up to {n} tags",
  "tags.hint": "Separate with comma, space or Enter · max {n} tags",
  "tags.remove": "Remove {tag}",

  // ---- uploads
  "upload.label": "Upload image",
  "upload.busy": "Uploading…",
  "upload.tooBig": "Images must be 5 MB or smaller.",
  "upload.done": "Image uploaded",
  "upload.failed": "Upload failed.",
  "upload.readFailed": "Could not read the file.",

  // ---- auth
  "auth.signInTitle": "Enter the arena",
  "auth.signUpTitle": "Join the arena",
  "auth.sub": "You need an account to vote, comment, and react.",
  "auth.email": "Email",
  "auth.password": "Password",
  "auth.signIn": "Sign in",
  "auth.createAccount": "Create account",
  "auth.or": "or",
  "auth.google": "Continue with Google",
  "auth.toSignUp": "No account? Sign up",
  "auth.toSignIn": "Already have an account? Sign in",
  "auth.checkEmail": "Check your email to confirm your account.",
  "auth.googleFailed": "Google sign-in failed.",
  "auth.errEmail": "Enter a valid email",
  "auth.errPassword": "Password must be at least 6 characters",
  "auth.checkDetails": "Check your details",

  // ---- card meta
  "card.votes": "{n} votes",
  "card.wild": "{n} wild",

  // ---- head metadata
  "meta.home.title": "toktiang.com — Pick a Side, Defend It",
  "meta.home.description":
    "Binary debates with bifurcated comment columns and a Wild Takes ranking that surfaces the most controversial arguments on both sides.",
  "meta.home.ogDescription":
    "Vote on 2-choice showdowns and fight it out in split comment columns.",
  "meta.browse.title": "Browse Debates by Category — toktiang.com",
  "meta.browse.description":
    "Filter binary debates by category and tag: tech, food, pop culture, life, sports.",
  "meta.auth.title": "Sign in — toktiang.com",
  "meta.auth.description": "Sign in to vote on debates and post takes in toktiang.com.",
  "meta.topic.unavailable": "Debate unavailable — toktiang.com",
  "meta.topic.description":
    "{a} vs {b}. Vote, then defend your side in the split comment columns.",
} as const;

export type TranslationKey = keyof typeof en;
export type Dictionary = Record<TranslationKey, string>;
