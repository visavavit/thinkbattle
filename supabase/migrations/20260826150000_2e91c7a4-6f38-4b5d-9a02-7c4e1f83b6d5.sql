-- Every account gets a profile, from the database, on the way in.
--
-- NOT YET EXECUTED. Written and tested against a local replay of the whole
-- migration history, never run against the live database.
--
-- The bug this fixes is not theoretical: 20260819070118 already had to
-- backfill "missing profiles for real signed-up users". Two things made
-- profile rows optional, and both are still live.
--
-- 1. ensureProfile() is called from exactly one place, the effect on /auth.
--    Google sign-in redirects to the bare origin, so it lands on / and that
--    effect never mounts. Neither does it for anyone who confirms their
--    signup email in a different tab. Those accounts get no profile at all.
--
-- 2. When it does run it can fail silently. It upserts with `on conflict (id)`
--    while the uniqueness that actually bites is the index on lower(username)
--    added in 20260822193245. The derived username is the email local part, so
--    somchai@gmail.com and somchai@hotmail.com both ask for "somchai" — the
--    second insert raises 23505, ensureProfile does not check the error, and
--    that user is "unknown" everywhere. Worse, the account page's fix is an
--    UPDATE, which matches no rows and reports success, so the display name
--    can never be set.
--
-- Both go away if the row is written by the database when the account is
-- created, which is where it always belonged: no client route has to be
-- visited, no collision is silent, and the name is settled before the first
-- page renders.

-- ---------------------------------------------------------------------------
-- 1. What a display name may be
-- ---------------------------------------------------------------------------

-- Mirrors the 3..24 the account page enforces. Collapses whitespace, because a
-- name derived from an OAuth "full_name" arrives with spaces in it and a name
-- that renders as two words with a gap in the middle of a comment header is
-- not the same string anyone typed.
create or replace function public.clean_username(_raw text)
returns text
language sql
immutable
as $$
  select nullif(left(btrim(regexp_replace(coalesce(_raw, ''), '\s+', ' ', 'g')), 24), '');
$$;

revoke all on function public.clean_username(text) from public, anon, authenticated;

-- Is this name free? Case-insensitive, and it ignores synthetic profiles for
-- the same reason the unique index does.
--
-- Exposed to anon so the sign-up form can say "taken" before the account is
-- created rather than after. This leaks nothing: usernames are printed next to
-- every take on the site, so anyone can enumerate them by reading a thread.
create or replace function public.username_available(_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.clean_username(_name) is null then false
    when length(public.clean_username(_name)) < 3 then false
    else not exists (
      select 1 from public.profiles p
       where lower(p.username) = lower(public.clean_username(_name))
         and p.is_synthetic = false
    )
  end;
$$;

revoke all on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. The profile row, written when the account is
-- ---------------------------------------------------------------------------

-- Writes one profile row, resolving the display name.
--
-- Split out of the trigger so the backfill in section 4 can call the same
-- code. Two paths that both invent usernames is two places for the rules to
-- drift, and the backfill is exactly where nobody looks again.
--
-- The retry loop is the collision handling. A pre-check ("is this name free?")
-- followed by an insert is a race, and two people signing up as somchai in the
-- same second is the case that is currently broken — so the insert itself is
-- the check, and a unique violation just means try the next name.
create or replace function public.ensure_profile_row(_id uuid, _meta jsonb, _email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _base text;
  _name text;
  _i integer;
begin
  _base := coalesce(
    public.clean_username(_meta->>'username'),
    public.clean_username(_meta->>'full_name'),
    public.clean_username(split_part(coalesce(_email, ''), '@', 1)),
    'debater'
  );
  -- The account page's floor. A two-letter email local part is common enough
  -- to be worth handling rather than rejecting.
  if length(_base) < 3 then
    _base := left(_base || 'debater', 24);
  end if;

  _name := _base;

  for _i in 0..49 loop
    begin
      insert into public.profiles (id, username) values (_id, _name);
      return;
    exception
      when unique_violation then
        -- Already has a profile (a re-run, or the backfill got there first):
        -- nothing to do, and nothing to rename.
        if exists (select 1 from public.profiles p where p.id = _id) then
          return;
        end if;
        -- Otherwise the name is taken. Trim the base so the suffix always fits
        -- inside 24 characters rather than being cut off the end of it.
        _name := left(_base, 24 - length((_i + 2)::text)) || (_i + 2)::text;
    end;
  end loop;

  -- Fifty collisions on one name. Fall back to something that cannot collide.
  insert into public.profiles (id, username)
  values (_id, 'debater-' || left(replace(_id::text, '-', ''), 8))
  on conflict (id) do nothing;
end; $$;

revoke all on function public.ensure_profile_row(uuid, jsonb, text) from public, anon, authenticated;

-- Runs as the account is inserted, so there is no window in which a signed-in
-- user has no profile.
--
-- The handler is deliberate and the priority it encodes is deliberate too: a
-- trigger that raises here fails the whole signup. A missing profile is a bad
-- row; a signup that mysteriously fails is a lost user. So anything unexpected
-- is logged as a warning and the account is still created — and the backfill in
-- section 4 is what sweeps up anything that lands that way.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_profile_row(new.id, new.raw_user_meta_data, new.email);
  return new;
exception when others then
  raise warning 'handle_new_user could not create a profile for %: %', new.id, sqlerrm;
  return new;
end; $$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- The client's safety net, for the window between this code shipping and this
-- migration running, and for any account whose trigger logged a warning.
--
-- Cheap enough to call on every sign-in: one indexed existence check and then
-- nothing. It is deliberately not a rename — it only fills in a row that is
-- missing, so calling it can never take a name away from someone who chose one.
create or replace function public.ensure_my_profile()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _u record;
begin
  if auth.uid() is null then return; end if;
  if exists (select 1 from public.profiles p where p.id = auth.uid()) then return; end if;
  select u.id, u.raw_user_meta_data, u.email into _u from auth.users u where u.id = auth.uid();
  if not found then return; end if;
  perform public.ensure_profile_row(_u.id, _u.raw_user_meta_data, _u.email);
end; $$;

revoke all on function public.ensure_my_profile() from public, anon;
grant execute on function public.ensure_my_profile() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Setting a display name, from the client, safely
-- ---------------------------------------------------------------------------

-- The account page currently sends a bare UPDATE. For a user whose profile row
-- was never created that matches nothing, returns no error, and the UI says
-- "saved" — which is how the original bug hides itself. This upserts instead,
-- so the page repairs a missing row rather than pretending to write to it, and
-- reports a real answer either way.
--
-- Returns the name that was stored. It is not always the name that was asked
-- for: `taken` comes back as a distinct outcome rather than a raised error so
-- the client can say so in the reader's own language instead of surfacing a
-- Postgres constraint name.
create or replace function public.set_my_username(_name text)
returns table (ok boolean, reason text, username text)
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _clean text := public.clean_username(_name);
begin
  if _uid is null then
    return query select false, 'unauthenticated', null::text;
    return;
  end if;
  if _clean is null or length(_clean) < 3 then
    return query select false, 'too_short', null::text;
    return;
  end if;

  begin
    insert into public.profiles (id, username) values (_uid, _clean)
    on conflict (id) do update set username = excluded.username;
  exception when unique_violation then
    return query select false, 'taken', null::text;
    return;
  end;

  return query select true, null::text, _clean;
end; $$;

revoke all on function public.set_my_username(text) from public, anon;
grant execute on function public.set_my_username(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Sweep up the accounts that already lost their row
-- ---------------------------------------------------------------------------

-- The same code path the trigger uses, applied to whoever is already missing a
-- row. Oldest account first, so the earliest signup keeps the plainest name.
do $$
declare
  _u record;
begin
  for _u in
    select u.id, u.raw_user_meta_data, u.email
      from auth.users u
      left join public.profiles p on p.id = u.id
     where p.id is null
     order by u.created_at, u.id
  loop
    perform public.ensure_profile_row(_u.id, _u.raw_user_meta_data, _u.email);
  end loop;
end $$;
