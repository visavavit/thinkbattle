alter table public.votes alter column user_id drop not null;
alter table public.votes add column if not exists guest_id uuid;

alter table public.votes drop constraint if exists votes_owner_exactly_one;
alter table public.votes add constraint votes_owner_exactly_one
  check (num_nonnulls(user_id, guest_id) = 1) not valid;
alter table public.votes validate constraint votes_owner_exactly_one;

create unique index if not exists votes_topic_guest_uniq
  on public.votes (topic_id, guest_id) where guest_id is not null;

alter table public.rate_events alter column user_id drop not null;
alter table public.rate_events add column if not exists ip_hash text;
create index if not exists rate_events_ip_kind_time
  on public.rate_events (ip_hash, kind, created_at desc) where ip_hash is not null;

create or replace function public.site_flags()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'guest_voting',
    coalesce((select value from public.app_settings where key = 'guest_voting_enabled'), 'off') = 'on'
  );
$$;

revoke all on function public.site_flags() from public;
grant execute on function public.site_flags() to anon, authenticated, service_role;

create or replace function public.guest_voting_enabled()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select value from public.app_settings where key = 'guest_voting_enabled'), 'off') = 'on';
$$;

revoke all on function public.guest_voting_enabled() from public, anon, authenticated;
grant execute on function public.guest_voting_enabled() to service_role;

create or replace function public.cast_guest_vote(
  _guest_id uuid,
  _topic_id uuid,
  _choice char(1),
  _ip_hash text
)
returns table(new_choice char(1), old_choice char(1), tally_a integer, tally_b integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  _previous char(1);
  _recent integer;
begin
  if not public.guest_voting_enabled() then
    raise exception 'Guest voting is turned off.' using errcode = '22000';
  end if;

  if _choice not in ('a', 'b') then
    raise exception 'Pick one of the two sides.' using errcode = '22000';
  end if;

  if _ip_hash is not null then
    select count(*) into _recent
      from public.rate_events
     where ip_hash = _ip_hash
       and kind = 'guest_vote'
       and created_at > now() - interval '1 minute';
    if _recent >= 6 then
      raise exception 'That is a lot of voting at once. Try again in a minute.'
        using errcode = '22000';
    end if;

    select count(*) into _recent
      from public.rate_events
     where ip_hash = _ip_hash
       and kind = 'guest_vote'
       and created_at > now() - interval '1 hour';
    if _recent >= 60 then
      raise exception 'That is a lot of voting at once. Try again later.'
        using errcode = '22000';
    end if;
  end if;

  select v.choice into _previous
    from public.votes v
   where v.topic_id = _topic_id and v.guest_id = _guest_id;

  insert into public.votes (topic_id, guest_id, choice)
  values (_topic_id, _guest_id, _choice)
  on conflict (topic_id, guest_id) where guest_id is not null
  do update set choice = excluded.choice, updated_at = now();

  insert into public.rate_events (kind, ip_hash) values ('guest_vote', _ip_hash);

  return query
    select _choice, _previous, t.votes_a, t.votes_b
      from public.topics t
     where t.id = _topic_id;
end; $$;

revoke all on function public.cast_guest_vote(uuid, uuid, char, text) from public, anon, authenticated;
grant execute on function public.cast_guest_vote(uuid, uuid, char, text) to service_role;

create or replace function public.claim_guest_votes(_guest_id uuid, _user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  _claimed integer;
begin
  if _guest_id is null or _user_id is null then
    return 0;
  end if;

  delete from public.votes g
   where g.guest_id = _guest_id
     and exists (
       select 1 from public.votes u
        where u.topic_id = g.topic_id and u.user_id = _user_id
     )
     and not public.topic_is_closed(g.topic_id);

  update public.votes g
     set user_id = _user_id, guest_id = null
   where g.guest_id = _guest_id
     and not public.topic_is_closed(g.topic_id);

  get diagnostics _claimed = row_count;
  return _claimed;
end; $$;

revoke all on function public.claim_guest_votes(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_guest_votes(uuid, uuid) to service_role;

create or replace function public.admin_purge_guest_votes(_topic_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  _removed integer;
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Admins only' using errcode = '42501';
  end if;

  delete from public.votes where topic_id = _topic_id and guest_id is not null;
  get diagnostics _removed = row_count;
  return _removed;
end; $$;

revoke all on function public.admin_purge_guest_votes(uuid) from public, anon;
grant execute on function public.admin_purge_guest_votes(uuid) to authenticated, service_role;