create or replace function public.sync_topic_votes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.topics set votes_a = votes_a + (new.choice='a')::int, votes_b = votes_b + (new.choice='b')::int where id = new.topic_id;
  elsif tg_op = 'UPDATE' then
    if new.choice <> old.choice then
      update public.topics
        set votes_a = votes_a + (new.choice='a')::int - (old.choice='a')::int,
            votes_b = votes_b + (new.choice='b')::int - (old.choice='b')::int
      where id = new.topic_id;
    end if;
  elsif tg_op = 'DELETE' then
    update public.topics set votes_a = votes_a - (old.choice='a')::int, votes_b = votes_b - (old.choice='b')::int where id = old.topic_id;
  end if;
  return null;
end; $$;

create or replace function public.topic_comment_authors(_topic_id uuid)
returns table(user_id uuid, choice char)
language sql stable security definer set search_path = public as $$
  select v.user_id, v.choice
  from public.votes v
  where v.topic_id = _topic_id
    and exists (
      select 1 from public.comments c
      where c.topic_id = _topic_id and c.user_id = v.user_id and c.is_hidden = false
    )
$$;

revoke all on function public.topic_comment_authors(uuid) from public;
grant execute on function public.topic_comment_authors(uuid) to anon, authenticated, service_role;