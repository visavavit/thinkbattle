create or replace function public.closed_trending_weight(_closes_at timestamptz)
returns numeric
language sql
stable
set search_path = public
as $$
  select case when _closes_at is not null and _closes_at <= now() then 0.25 else 1 end::numeric;
$$;

revoke all on function public.closed_trending_weight(timestamptz) from public, anon, authenticated;
revoke all on function public.guard_topic_closed() from public, anon, authenticated;
revoke all on function public.guard_reaction_topic_closed() from public, anon, authenticated;
revoke all on function public.sync_topic_comment_counts() from public, anon, authenticated;
revoke all on function public.seed_trending_score() from public, anon, authenticated;