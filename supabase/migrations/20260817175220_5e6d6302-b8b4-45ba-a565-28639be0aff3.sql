create extension if not exists pg_cron;
create extension if not exists pg_net;

drop function if exists public.admin_comment_feed(text, uuid, boolean, integer);
create or replace function public.admin_comment_feed(_search text default null, _topic_id uuid default null, _only_hidden boolean default false, _limit integer default 60)
returns table(id uuid, body text, side text, created_at timestamptz, is_hidden boolean, hidden_reason text, likes_count integer, dislikes_count integer, controversy_score integer, author_id uuid, author_name text, author_banned boolean, topic_id uuid, topic_title text, open_reports bigint, is_synthetic boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  return query
  select c.id, c.body, c.side::text, c.created_at, c.is_hidden, c.hidden_reason,
    c.likes_count, c.dislikes_count, c.controversy_score, c.user_id,
    coalesce(p.username, 'unknown'),
    exists (select 1 from public.user_bans b where b.user_id = c.user_id),
    t.id, t.title,
    (select count(*) from public.comment_reports r where r.comment_id = c.id and r.status = 'open'),
    c.is_synthetic
  from public.comments c
    join public.topics t on t.id = c.topic_id
    left join public.profiles p on p.id = c.user_id
  where (_topic_id is null or c.topic_id = _topic_id)
    and (coalesce(_only_hidden, false) = false or c.is_hidden)
    and (_search is null or _search = '' or c.body ilike '%' || _search || '%')
  order by c.created_at desc
  limit greatest(1, least(coalesce(_limit, 60), 200));
end; $$;
revoke all on function public.admin_comment_feed(text, uuid, boolean, integer) from public, anon;
grant execute on function public.admin_comment_feed(text, uuid, boolean, integer) to authenticated;

select cron.unschedule('bot-audience-tick') where exists (select 1 from cron.job where jobname = 'bot-audience-tick');

select cron.schedule(
  'bot-audience-tick',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://project--305e7210-ac73-42ed-8142-a542ff7c57ad.lovable.app/api/public/bots/tick',
    headers := '{"Content-Type": "application/json", "apikey": "sb_publishable_FnmST5_nfBEfFyuRl2zdkg_-H525VDh"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);