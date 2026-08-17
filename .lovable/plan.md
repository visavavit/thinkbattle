# Switching sides: what happens to your old comments

## What happens today (the problem)

When a reader switches from Side A to Side B, the database **permanently deletes**
every comment they wrote on the old side. There is no warning, no undo, and their
likes/dislikes vanish with them. The toast afterwards even says the comments "moved
out of that column", which is not what actually happens.

## Proposed behaviour

Old comments are **kept, not deleted**, and stay in the column where they were
written — the argument was made in good faith and other readers already reacted
to it. They get marked so the context is honest.

1. **Keep the comment in its original column.** It becomes read-only for the author
   (no edits), and reactions from others keep working.
2. **Add a "Changed their mind" badge** on any comment whose author no longer votes
   for that side. Small, muted, with a tooltip: "This user has since switched to
   {other choice}."
3. **Confirm before switching.** A dialog appears whenever the reader already has a
   vote and clicks the other side:
   - Title: "Switch to {other choice}?"
   - Body: your vote moves, the split updates, and — when they have comments on the
     old side — "Your N comment(s) under *Why {old choice}?* will stay published and
     be marked 'Changed their mind'."
   - Buttons: Cancel / Switch side.
   - If they have no comments yet, keep it lightweight (still confirm, shorter text).
4. **After switching**, the composer opens on the new side; the old column becomes
   read-only for them as it is today.

## Technical notes

- Migration: change `sync_topic_votes` so the `UPDATE` branch stops deleting the
  author's comments on the old side; it only recalculates `votes_a` / `votes_b`.
- Expose which comments belong to a "switched" author: the comment already carries
  `side` and `user_id`, so the discussion query fetches the current vote of each
  comment author for this topic (one extra query on `votes` filtered to the topic)
  and flags rows where `vote.choice !== comment.side`.
- Public read policy on `votes` is owner-only today, so add a narrow read path: a
  `topic_comment_authors(_topic_id)` security-definer function returning
  `(user_id, choice)` only for users who have commented on that topic — no other
  vote data is exposed.
- `Discussion.tsx`: add an AlertDialog gated on `myVote && myVote !== choice`,
  perform the existing upsert only on confirm, and correct the success toast.
- Comment rendering: render the badge when the author's current choice differs
  from the comment's side.

## Alternative considered

Deleting or hiding old comments on switch (today's behaviour) — rejected: it
silently destroys content other readers engaged with and makes threads look
broken. Keeping them with a badge is more honest and more entertaining.
