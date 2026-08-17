revoke all on function public.sync_topic_votes() from public, anon, authenticated;
revoke all on function public.sync_comment_reactions() from public, anon, authenticated;
revoke all on function public.touch_vote() from public, anon, authenticated;
revoke all on function public.has_role(uuid, public.app_role) from public, anon;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;