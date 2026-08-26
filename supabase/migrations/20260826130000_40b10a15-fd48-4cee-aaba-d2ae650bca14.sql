-- Guest voting, behind an admin switch.
--
-- NOT YET EXECUTED. Written and reviewed, never run: the session that authored
-- it had no database to run it against. This one alters the live table holding
-- the product's primary data — take a backup and apply to a branch or staging
-- project first.
--
-- Why: the vote buttons are disabled for anyone without an account, so an
-- anonymous visitor cannot do the one thing the site is for. public.functions
-- itself notes anonymous traffic is "the bulk of it".
--
-- Guest votes live in public.votes rather than a second table. The deciding
-- fact is that sync_topic_votes() (20260817171342) reads only new.choice,
-- old.choice and topic_id — it never touches user_id — so a guest row keeps
-- topics.votes_a/votes_b correct with no trigger change at all, and
-- votes_guard_closed binds it for free. A separate guest_votes table would
-- mean two triggers writing the same two counters, and any drift between them
-- corrupts the tally silently.
--
-- Two things fall out of user_id being null on those rows, both wanted:
--   * every votes policy is `auth.uid() = user_id`, and `auth.uid() = null` is
--     null, never true — so guest rows are invisible and unwritable to every
--     client role without a single new policy.
--   * the comments policies "comment after voting" / "reply after voting" join
--     on v.user_id = auth.uid(), so guests are barred from commenting by the
--     code that is already there. Guest voting unlocks the tally, not the
--     debate.
--
-- Anonymous clients cannot reach any of this directly in any case: `anon` holds
-- only SELECT on the public tables and no grant whatsoever on votes. Everything
-- below is called by the server on the service-role client.

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

alter table public.votes alter column user_id drop not null;
alter table public.votes add column if not exists guest_id uuid;

-- Exactly one owner. NOT VALID then VALIDATE so the scan does not hold a
-- stronger lock than it needs on a live table.
alter table public.votes drop constraint if exists votes_owner_exactly_one;
alter table public.votes add constraint votes_owner_exactly_one
  check (num_nonnulls(user_id, guest_id) = 1) not valid;
alter table public.votes validate constraint votes_owner_exactly_one;

-- One vote per device per topic, mirroring unique (topic_id, user_id).
create unique index if not exists votes_topic_guest_uniq
  on public.votes (topic_id, guest_id) where guest_id is not null;

-- Rate limiting keys on a hashed address for guests, who have no user_id.
alter table public.rate_events alter column user_id drop not null;
alter table public.rate_events add column if not exists ip_hash text;
create index if not exists rate_events_ip_kind_time
  on public.rate_events (ip_hash, kind, created_at desc) where ip_hash is not null;

-- ---------------------------------------------------------------------------
-- Public flags
-- ---------------------------------------------------------------------------

-- app_settings has RLS enabled with no policies and holds bot_tick_secret, so
-- it stays unreadable. This function enumerates in code the handful of keys
-- that are public, which is why it is a definer function and not a read policy:
-- a policy broad enough to expose a flag is one mistake away from exposing the
-- secret sitting in the next row.
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

-- Absent means off. A fresh environment should not silently accept anonymous
-- votes because nobody has said otherwise yet.
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

-- ---------------------------------------------------------------------------
-- Casting a guest vote
-- ---------------------------------------------------------------------------

-- One round trip: flag check, rate check, upsert, and the resolved tally.
--
-- Returning the post-write tally matters. A guest whose localStorage was
-- cleared but whose cookie survived believes they have no vote, so the true
-- delta may be A+1/B-1 rather than A+1 — the client cannot work that out, and
-- guessing makes the reader watch their own vote bounce.
--
-- The flag is re-checked here rather than trusted from the client: a page
-- cached before an admin switched guest voting off must not still be able to
-- cast one.
create or replace function public.cast_guest_vote(
  _guest_id uuid,
  _topic_id uuid,
  _choice char(1),
  _ip_hash text
)
-- OUT names deliberately do not collide with any column on votes or topics:
-- plpgsql resolves an unqualified reference against variables first, and a
-- clash there is a runtime error rather than something a review would catch.
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

  -- Generous, and never a ban. Thai mobile carriers put large numbers of
  -- users behind CGNAT, so a per-address limit will false-positive on shared
  -- addresses; this is a speed bump against the bored, not an integrity
  -- control, and it should not read as an accusation.
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

  -- votes_guard_closed fires inside this write, so a closed debate is refused
  -- here exactly as it is for a signed-in voter.
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

-- ---------------------------------------------------------------------------
-- Merging a device's votes into an account
-- ---------------------------------------------------------------------------

-- Called once when a guest signs in or signs up.
--
-- Case A, the account has not voted on that topic: reattribute the row. The
-- choice does not change, so sync_topic_votes()'s UPDATE branch is a no-op and
-- the tally is provably untouched. The vote then satisfies "comment after
-- voting", so commenting unlocks the moment they sign up.
--
-- Case B, the account already voted there: the guest row is the same human
-- counted twice. Delete it and let the account's own vote stand.
--
-- Case C, the topic has closed: votes_guard_closed refuses both the UPDATE and
-- the DELETE. Those topics are skipped rather than worked around. That guard's
-- documented value (20260820120000) is that it holds on every write path
-- including service_role, and spending that invariant to re-attribute a vote on
-- a debate that is already over would be a bad trade. Nothing is lost: the vote
-- still counts in the final tally, it is just not on their profile, and the
-- topic takes no comments either way.
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

  -- Case B first: clear the duplicates before reattributing, so the unique
  -- index on (topic_id, user_id) cannot trip on a row we are about to delete.
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

-- ---------------------------------------------------------------------------
-- Undo, for a curator
-- ---------------------------------------------------------------------------

-- Ships with the feature rather than on the day it is first needed. Guest
-- voting trades integrity for reach — a signed cookie stops casual
-- double-voting and nothing more — so the way to undo a stuffed topic has to
-- exist from the start.
--
-- Only works while the topic is open, for the same reason the merge skips
-- closed ones: votes_guard_closed refuses the DELETE. Purging a published
-- final result would be worse than living with it.
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
