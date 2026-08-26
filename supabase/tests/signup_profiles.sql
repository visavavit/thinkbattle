-- Behaviour tests for automatic profile creation (20260826150000).
--
-- Run with supabase/tests/run.sh. Every check either raises with a FAIL
-- message or emits a PASS notice, so a clean run is all PASS and no ERROR.

create or replace function pass2(label text) returns void language plpgsql as $$
begin raise notice 'PASS  %', label; end $$;

\echo '--- 1. an account gets a profile without any client help ---'
insert into auth.users (id, email) values
  ('bbbb0000-0000-0000-0000-000000000001', 'somchai@gmail.com');
do $$ begin
  if (select username from public.profiles where id = 'bbbb0000-0000-0000-0000-000000000001') = 'somchai'
  then perform pass2('the trigger writes the profile as the account is created');
  else raise exception 'FAIL: no profile, got %',
    (select count(*) from public.profiles where id = 'bbbb0000-0000-0000-0000-000000000001'); end if;
end $$;

\echo '--- 2. the collision that used to lose an account ---'
-- Same email local part. This is the exact case that made ensureProfile raise
-- 23505 and leave the second user with no profile at all.
insert into auth.users (id, email) values
  ('bbbb0000-0000-0000-0000-000000000002', 'somchai@hotmail.com'),
  ('bbbb0000-0000-0000-0000-000000000003', 'somchai@yahoo.com');
do $$
declare a text; b text;
begin
  select username into a from public.profiles where id = 'bbbb0000-0000-0000-0000-000000000002';
  select username into b from public.profiles where id = 'bbbb0000-0000-0000-0000-000000000003';
  if a = 'somchai2' and b = 'somchai3'
  then perform pass2('colliding names are suffixed, not dropped: ' || a || ', ' || b);
  else raise exception 'FAIL: got % and %', a, b; end if;
end $$;

\echo '--- 3. where the name comes from ---'
-- Google hands back full_name, and it arrives with a space in it.
insert into auth.users (id, email, raw_user_meta_data) values
  ('bbbb0000-0000-0000-0000-000000000004', 'x@example.com',
   '{"full_name": "  Anong   Wattana  "}'::jsonb);
do $$ begin
  if (select username from public.profiles where id = 'bbbb0000-0000-0000-0000-000000000004')
     = 'Anong Wattana'
  then perform pass2('an OAuth full_name is trimmed and its whitespace collapsed');
  else raise exception 'FAIL: got "%"',
    (select username from public.profiles where id = 'bbbb0000-0000-0000-0000-000000000004'); end if;
end $$;

-- An explicit username from the sign-up form beats both.
insert into auth.users (id, email, raw_user_meta_data) values
  ('bbbb0000-0000-0000-0000-000000000005', 'ignored@example.com',
   '{"username": "chosen_name", "full_name": "Ignored Name"}'::jsonb);
do $$ begin
  if (select username from public.profiles where id = 'bbbb0000-0000-0000-0000-000000000005')
     = 'chosen_name'
  then perform pass2('a name typed on the sign-up form wins over the email and the OAuth name');
  else raise exception 'FAIL'; end if;
end $$;

-- Too short to be a display name, and no metadata to fall back on.
insert into auth.users (id, email) values
  ('bbbb0000-0000-0000-0000-000000000006', 'ab@example.com');
do $$ declare n text; begin
  select username into n from public.profiles where id = 'bbbb0000-0000-0000-0000-000000000006';
  if length(n) >= 3 then perform pass2('a two-letter email local part still yields a usable name: ' || n);
  else raise exception 'FAIL: got "%"', n; end if;
end $$;

-- A very long name must not overflow the 24 the account page enforces, and
-- must still leave room for a collision suffix.
insert into auth.users (id, email) values
  ('bbbb0000-0000-0000-0000-000000000007', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa@example.com'),
  ('bbbb0000-0000-0000-0000-000000000008', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa@other.com');
do $$ declare a text; b text; begin
  select username into a from public.profiles where id = 'bbbb0000-0000-0000-0000-000000000007';
  select username into b from public.profiles where id = 'bbbb0000-0000-0000-0000-000000000008';
  if length(a) <= 24 and length(b) <= 24 and lower(a) <> lower(b)
  then perform pass2('long names are clamped to 24 and still made distinct');
  else raise exception 'FAIL: % (%) / % (%)', a, length(a), b, length(b); end if;
end $$;

\echo '--- 4. signup must never fail because of the profile ---'
-- A synthetic profile holding the same name is invisible to the unique index,
-- so this is the case where the insert succeeds despite an apparent clash.
insert into public.profiles (id, username, is_synthetic)
values ('cccc0000-0000-0000-0000-000000000001', 'ghostwriter', true);
insert into auth.users (id, email) values
  ('bbbb0000-0000-0000-0000-000000000009', 'ghostwriter@example.com');
do $$ begin
  if exists (select 1 from public.profiles where id = 'bbbb0000-0000-0000-0000-000000000009')
  then perform pass2('a name held only by a synthetic profile does not block a real signup');
  else raise exception 'FAIL: signup produced no profile'; end if;
end $$;

\echo '--- 5. username_available ---'
do $$ begin
  if public.username_available('somchai') = false
     and public.username_available('definitely-free-name') = true
     and public.username_available('ab') = false
     and public.username_available('   ') = false
     and public.username_available(null) = false
     and public.username_available('SOMCHAI') = false
  then perform pass2('username_available is case-insensitive and rejects too-short and empty');
  else raise exception 'FAIL: %, %, %, %, %, %',
    public.username_available('somchai'), public.username_available('definitely-free-name'),
    public.username_available('ab'), public.username_available('   '),
    public.username_available(null), public.username_available('SOMCHAI'); end if;
end $$;

-- A name held only by a synthetic profile, which no real account has taken.
insert into public.profiles (id, username, is_synthetic)
values ('cccc0000-0000-0000-0000-000000000002', 'phantom_only', true);
do $$ begin
  if public.username_available('phantom_only') = true
     -- ...whereas 'ghostwriter' was claimed by a real signup in section 4, so
     -- it is now genuinely taken.
     and public.username_available('ghostwriter') = false
  then perform pass2('a synthetic profile does not reserve a name, but a real one does');
  else raise exception 'FAIL: phantom_only=%, ghostwriter=%',
    public.username_available('phantom_only'), public.username_available('ghostwriter'); end if;
end $$;

\echo '--- 6. setting your own name ---'
select set_config('request.jwt.claim.sub', 'bbbb0000-0000-0000-0000-000000000001', false);
do $$ declare r record; begin
  select * into r from public.set_my_username('Somchai The Debater');
  if r.ok and r.username = 'Somchai The Debater' then perform pass2('a member can rename themselves');
  else raise exception 'FAIL: % %', r.ok, r.reason; end if;
end $$;

do $$ declare r record; begin
  select * into r from public.set_my_username('somchai2');
  if not r.ok and r.reason = 'taken' then perform pass2('a name someone else holds is reported as taken, not as a constraint error');
  else raise exception 'FAIL: % %', r.ok, r.reason; end if;
end $$;

do $$ declare r record; begin
  select * into r from public.set_my_username('ab');
  if not r.ok and r.reason = 'too_short' then perform pass2('a name under three characters is refused');
  else raise exception 'FAIL: % %', r.ok, r.reason; end if;
end $$;

do $$ declare r record; begin
  -- Taking your own current name back is not a collision with yourself.
  select * into r from public.set_my_username('Somchai The Debater');
  if r.ok then perform pass2('saving your own name unchanged is not a collision');
  else raise exception 'FAIL: % %', r.ok, r.reason; end if;
end $$;

-- The repair case: a user whose profile row is missing. Before this migration
-- the account page sent an UPDATE, which matched nothing and reported success.
delete from public.profiles where id = 'bbbb0000-0000-0000-0000-000000000001';
do $$ declare r record; begin
  select * into r from public.set_my_username('BackFromTheDead');
  if r.ok and exists (select 1 from public.profiles
                       where id = 'bbbb0000-0000-0000-0000-000000000001'
                         and username = 'BackFromTheDead')
  then perform pass2('setting a name repairs a missing profile row instead of silently doing nothing');
  else raise exception 'FAIL: % %', r.ok, r.reason; end if;
end $$;

select set_config('request.jwt.claim.sub', '', false);
do $$ declare r record; begin
  select * into r from public.set_my_username('anything');
  if not r.ok and r.reason = 'unauthenticated' then perform pass2('a signed-out caller gets nowhere');
  else raise exception 'FAIL: % %', r.ok, r.reason; end if;
end $$;

\echo '--- 7. the backfill, on accounts that predate the trigger ---'
alter table auth.users disable trigger on_auth_user_created;
insert into auth.users (id, email, created_at) values
  ('dddd0000-0000-0000-0000-000000000001', 'orphan@example.com', now() - interval '2 days'),
  ('dddd0000-0000-0000-0000-000000000002', 'orphan@other.com',   now() - interval '1 day'),
  ('dddd0000-0000-0000-0000-000000000003', 'somchai@third.com',  now());
alter table auth.users enable trigger on_auth_user_created;

do $$
declare _u record;
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

do $$ declare n integer; begin
  select count(*) into n from auth.users u
    left join public.profiles p on p.id = u.id where p.id is null;
  if n = 0 then perform pass2('the backfill leaves no account without a profile');
  else raise exception 'FAIL: % accounts still have none', n; end if;
end $$;

do $$ declare a text; b text; begin
  select username into a from public.profiles where id = 'dddd0000-0000-0000-0000-000000000001';
  select username into b from public.profiles where id = 'dddd0000-0000-0000-0000-000000000002';
  -- Both orphans derive "orphan". The first takes it; the second collides
  -- *within the same backfill*, which a single naive INSERT..SELECT would not
  -- notice, and must come out suffixed the same way a live signup would rather
  -- than falling back to something unreadable.
  if a = 'orphan' and b = 'orphan2'
  then perform pass2('the backfill names collisions the same way a live signup does: ' || a || ', ' || b);
  else raise exception 'FAIL: %, %', a, b; end if;
end $$;

do $$ declare c text; begin
  select username into c from public.profiles where id = 'dddd0000-0000-0000-0000-000000000003';
  -- This one derives "somchai", a name freed earlier in this file when its
  -- original holder renamed. A freed name is available like any other.
  if c = 'somchai' then perform pass2('a name freed by a rename is reusable: ' || c);
  else raise exception 'FAIL: %', c; end if;
end $$;

do $$ begin
  if (select count(*) from public.profiles p
       where p.is_synthetic = false
       group by lower(p.username) having count(*) > 1 limit 1) is null
  then perform pass2('no two real profiles share a name after all of that');
  else raise exception 'FAIL: duplicate names exist'; end if;
end $$;

\echo '--- 8. the client safety net ---'
select set_config('request.jwt.claim.sub', 'bbbb0000-0000-0000-0000-000000000004', false);
delete from public.profiles where id = 'bbbb0000-0000-0000-0000-000000000004';
select public.ensure_my_profile();
do $$ begin
  if exists (select 1 from public.profiles where id = 'bbbb0000-0000-0000-0000-000000000004')
  then perform pass2('ensure_my_profile fills in a missing row');
  else raise exception 'FAIL: still missing'; end if;
end $$;

-- Called again it must not touch the name the member chose.
select set_config('request.jwt.claim.sub', 'bbbb0000-0000-0000-0000-000000000005', false);
select public.set_my_username('DeliberateName');
select public.ensure_my_profile();
do $$ begin
  if (select username from public.profiles where id = 'bbbb0000-0000-0000-0000-000000000005')
     = 'DeliberateName'
  then perform pass2('ensure_my_profile never renames someone who already has a profile');
  else raise exception 'FAIL: name was overwritten with %',
    (select username from public.profiles where id = 'bbbb0000-0000-0000-0000-000000000005'); end if;
end $$;

select set_config('request.jwt.claim.sub', '', false);
select public.ensure_my_profile();
select pass2('ensure_my_profile is a no-op when signed out');

\echo 'DONE'

