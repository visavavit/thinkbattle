-- Behaviour tests for image attachments on takes (20260826140000).
--
-- Run with supabase/tests/run.sh, which replays the whole migration history
-- against a throwaway local Postgres first. Every check either raises with a
-- FAIL message or emits a PASS notice, so a clean run is all PASS and no ERROR.
--
-- `request.jwt.claim.sub` is what the shim's auth.uid() reads, so setting it is
-- how a test says "now this user is the caller".

\set ON_ERROR_STOP on
\set QUIET on
\pset format unaligned
\pset tuples_only on

create or replace function pass(label text) returns void language plpgsql as $$
begin raise notice 'PASS  %', label; end $$;

-- Runs `sql` and checks it fails with a message containing `frag`.
create or replace function must_fail(sql text, frag text, label text) returns void
language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    if position(lower(frag) in lower(sqlerrm)) > 0 then
      raise notice 'PASS  % (%)', label, left(sqlerrm, 60);
      return;
    end if;
    raise exception 'FAIL  %: wrong error: %', label, sqlerrm;
  end;
  raise exception 'FAIL  %: expected an error, got none', label;
end $$;

-- ---------------------------------------------------------------- fixtures
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'mod@example.com')
on conflict do nothing;
insert into public.profiles (id, username) values
  ('11111111-1111-1111-1111-111111111111', 'alice'),
  ('22222222-2222-2222-2222-222222222222', 'bob'),
  ('33333333-3333-3333-3333-333333333333', 'mod')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role) values
  ('33333333-3333-3333-3333-333333333333', 'admin') on conflict do nothing;

insert into public.topics (id, title, choice_a, choice_b, status, closes_at)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'Test', 'A', 'B', 'published', now() + interval '7 days');

insert into public.votes (topic_id, user_id, choice) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'a'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'a');

\echo '--- 1. the switch ---'
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);

do $$ begin
  if (public.site_flags() ? 'comment_images') and (public.site_flags()->>'comment_images') = 'false'
     and (public.site_flags() ? 'guest_voting') then
    perform pass('site_flags exposes comment_images, defaulting off, guest_voting intact');
  else
    raise exception 'FAIL site_flags: %', public.site_flags();
  end if;
end $$;

select must_fail(
  $q$ select public.begin_upload('comments','webp','{480}') $q$,
  'turned off', 'attachments refused while the switch is off');

select public.set_app_setting('comment_images_enabled', 'on');
do $$ begin
  if (public.site_flags()->>'comment_images') = 'true' then perform pass('switch on is visible in site_flags');
  else raise exception 'FAIL: flag did not flip'; end if;
end $$;

\echo '--- 2. reserve / confirm ---'
create temp table ids (who text primary key, id uuid, url text);

insert into ids (who, id) values ('alice1', public.begin_upload('comments','webp','{480,960}'));
update ids set url = 'https://cdn.example/comments/' || id || '-w960.webp' where who = 'alice1';
do $$ declare u uuid; begin
  select id into u from ids where who='alice1';
  if (select state from public.uploads where id=u) = 'pending'
     and (select user_id from public.uploads where id=u) = '11111111-1111-1111-1111-111111111111'
     and (select widths from public.uploads where id=u) = '{480,960}'::integer[]
  then perform pass('begin_upload writes an attributed pending row with its ladder');
  else raise exception 'FAIL: bad pending row'; end if;
end $$;

do $$ declare u uuid; r text; begin
  select id, url into u, r from ids where who='alice1';
  perform public.finish_upload(u, r, 12345);
  if (select state from public.uploads where id=u) = 'stored' then perform pass('finish_upload marks it stored');
  else raise exception 'FAIL: not stored'; end if;
end $$;

select must_fail(
  format($q$ select public.finish_upload(%L, 'https://cdn.example/x.webp', 1) $q$, (select id from ids where who='alice1')),
  'no longer open', 'finish_upload cannot be replayed');

\echo '--- 3. only your own upload may be attached ---'
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
insert into ids (who, id) values ('bob1', public.begin_upload('comments','webp','{480}'));
update ids set url = 'https://cdn.example/comments/' || id || '-w480.webp' where who = 'bob1';
select public.finish_upload((select id from ids where who='bob1'), (select url from ids where who='bob1'), 999);

select must_fail(
  format($q$ insert into public.comments (topic_id, user_id, side, body, image_url)
             values ('aaaaaaaa-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','a','bob steals alices picture', %L) $q$,
          (select url from ids where who='alice1')),
  'not yours', 'cannot attach someone else''s upload');

select must_fail(
  $q$ insert into public.comments (topic_id, user_id, side, body, image_url)
      values ('aaaaaaaa-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','a','made up url','https://cdn.example/comments/nope.webp') $q$,
  'not yours', 'cannot attach a URL with no ledger row');

\echo '--- 4. posting, one per take ---'
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
create temp table cmts (label text primary key, id uuid);
with posted as (
  insert into public.comments (topic_id, user_id, side, body, image_url, image_width, image_height)
  values ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','a',
          'here is the receipt', (select url from ids where who='alice1'), 960, 540)
  returning id
)
insert into cmts (label, id) select 'alice1', id from posted;
select pass('a take posts with its attachment');

delete from public.rate_events;  -- step past the composer's 10s cool-off
select must_fail(
  format($q$ insert into public.comments (topic_id, user_id, side, body, image_url)
             values ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','a','same picture again', %L) $q$,
          (select url from ids where who='alice1')),
  'duplicate key', 'the same upload cannot be posted twice');

\echo '--- 5. replies stay text-only ---'
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
delete from public.rate_events;
select must_fail(
  format($q$ insert into public.comments (topic_id, user_id, side, body, parent_id, image_url)
             values ('aaaaaaaa-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','a','replying', %L, %L) $q$,
          (select id from cmts where label='alice1'), (select url from ids where who='bob1')),
  'replies cannot', 'a reply cannot carry an image');

\echo '--- 6. no swapping after posting; removal allowed ---'
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select must_fail(
  format($q$ update public.comments set image_url = %L where id = %L $q$,
         (select url from ids where who='bob1'), (select id from cmts where label='alice1')),
  'cannot be changed', 'an attachment cannot be swapped after posting');

update public.comments set image_url = null, image_width = null, image_height = null
 where id = (select id from cmts where label='alice1');
do $$ begin
  if (select state from public.uploads where id = (select id from ids where who='alice1')) = 'orphaned'
  then perform pass('removing the image orphans its ledger row');
  else raise exception 'FAIL: not orphaned, got %', (select state from public.uploads where id = (select id from ids where who='alice1')); end if;
end $$;

\echo '--- 7. hiding takes the picture down ---'
-- Re-attach so there is something to take down. A fresh upload, because the
-- first one is orphaned now and an orphaned row is not attachable.
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
insert into ids (who, id) values ('alice2', public.begin_upload('comments','webp','{480,960}'));
update ids set url = 'https://cdn.example/comments/' || id || '-w960.webp' where who = 'alice2';
select public.finish_upload((select id from ids where who='alice2'), (select url from ids where who='alice2'), 5000);

delete from public.rate_events;
with posted as (
  insert into public.comments (topic_id, user_id, side, body, image_url, image_width, image_height)
  values ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','a',
          'second receipt', (select url from ids where who='alice2'), 960, 540)
  returning id
)
insert into cmts (label, id) select 'alice2', id from posted;

-- as a moderator
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);
update public.comments set is_hidden = true, hidden_by = '33333333-3333-3333-3333-333333333333', hidden_at = now()
 where id = (select id from cmts where label='alice2');
do $$ begin
  if (select image_url from public.comments where id = (select id from cmts where label='alice2')) is null
     and (select image_width from public.comments where id = (select id from cmts where label='alice2')) is null
     and (select state from public.uploads where id = (select id from ids where who='alice2')) = 'orphaned'
  then perform pass('hiding a take nulls its image and orphans the upload');
  else raise exception 'FAIL: hide left the image in place (url=%, state=%)',
    (select image_url from public.comments where id = (select id from cmts where label='alice2')),
    (select state from public.uploads where id = (select id from ids where who='alice2')); end if;
end $$;

update public.comments set is_hidden = false, hidden_by = null, hidden_at = null
 where id = (select id from cmts where label='alice2');
do $$ begin
  if (select image_url from public.comments where id = (select id from cmts where label='alice2')) is null
  then perform pass('unhiding does not resurrect it');
  else raise exception 'FAIL: unhide brought the image back'; end if;
end $$;

\echo '--- 8. deleting a take, and a cascading topic ---'
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
insert into ids (who, id) values ('alice3', public.begin_upload('comments','webp','{480}'));
update ids set url = 'https://cdn.example/comments/' || id || '-w480.webp' where who = 'alice3';
select public.finish_upload((select id from ids where who='alice3'), (select url from ids where who='alice3'), 4000);
delete from public.rate_events;
with posted as (
  insert into public.comments (topic_id, user_id, side, body, image_url)
  values ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','a',
          'third receipt', (select url from ids where who='alice3'))
  returning id
)
insert into cmts (label, id) select 'alice3', id from posted;

delete from public.comments where id = (select id from cmts where label='alice3');
do $$ begin
  if (select state from public.uploads where id = (select id from ids where who='alice3')) = 'orphaned'
  then perform pass('deleting a take orphans its upload');
  else raise exception 'FAIL: delete did not orphan'; end if;
end $$;

-- The cascade case: nothing in the application is running when a topic goes.
insert into ids (who, id) values ('alice4', public.begin_upload('comments','webp','{480}'));
update ids set url = 'https://cdn.example/comments/' || id || '-w480.webp' where who = 'alice4';
select public.finish_upload((select id from ids where who='alice4'), (select url from ids where who='alice4'), 4000);
insert into public.topics (id, title, choice_a, choice_b, status, closes_at)
values ('aaaaaaaa-0000-0000-0000-000000000002', 'Doomed', 'A', 'B', 'published', now() + interval '7 days');
insert into public.votes (topic_id, user_id, choice)
values ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'a');
delete from public.rate_events;
insert into public.comments (topic_id, user_id, side, body, image_url)
values ('aaaaaaaa-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','a',
        'on a doomed topic', (select url from ids where who='alice4'));
delete from public.topics where id = 'aaaaaaaa-0000-0000-0000-000000000002';
do $$ begin
  if (select state from public.uploads where id = (select id from ids where who='alice4')) = 'orphaned'
  then perform pass('a cascading topic delete orphans the uploads under it');
  else raise exception 'FAIL: cascade did not orphan'; end if;
end $$;

\echo '--- 9. the sweep ---'
create temp table swept as select * from public.take_orphaned_uploads(100);
do $$ begin
  if (select count(*) from swept) = 4 then perform pass('the sweep claims all four orphans');
  else raise exception 'FAIL: claimed % rows', (select count(*) from swept); end if;
end $$;
do $$ begin
  if (select count(*) from public.uploads where state = 'purging') = 4
     and (select widths from swept where id = (select id from ids where who='alice2')) = '{480,960}'::integer[]
  then perform pass('claimed rows carry the ladder needed to delete every rendition');
  else raise exception 'FAIL: bad claim state'; end if;
end $$;
do $$ begin
  if (select count(*) from public.take_orphaned_uploads(100)) = 0
  then perform pass('a second sweep claims nothing — no double delete');
  else raise exception 'FAIL: re-claimed rows already in flight'; end if;
end $$;
do $$ declare n integer; begin
  select public.mark_uploads_purged(array(select id from swept)) into n;
  if n = 4 and (select count(*) from public.uploads where state='purging') = 0
  then perform pass('confirming the deletes drops the ledger rows');
  else raise exception 'FAIL: marked %', n; end if;
end $$;

\echo '--- 10. what the sweep must not take ---'
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
-- A picture chosen in a composer that was never submitted: still 'stored', on
-- no take. Young, so it stays; aged, so it goes.
insert into ids (who, id) values ('stray', public.begin_upload('comments','webp','{480}'));
update ids set url = 'https://cdn.example/comments/' || id || '-w480.webp' where who = 'stray';
select public.finish_upload((select id from ids where who='stray'), (select url from ids where who='stray'), 4000);
-- An avatar, which hangs off a profile this predicate knows nothing about.
insert into ids (who, id) values ('avatar', public.begin_upload('avatars','webp','{}'));
update ids set url = 'https://cdn.example/avatars/' || id || '.webp' where who = 'avatar';
select public.finish_upload((select id from ids where who='avatar'), (select url from ids where who='avatar'), 4000);
update public.uploads set created_at = now() - interval '3 hours'
 where id in (select id from ids where who in ('stray','avatar'));

do $$ declare claimed uuid[]; begin
  select array(select id from public.take_orphaned_uploads(100)) into claimed;
  if claimed = array[(select id from ids where who='stray')]
  then perform pass('an abandoned attachment is swept; an avatar of the same age is not');
  else raise exception 'FAIL: swept %', claimed; end if;
end $$;

\echo '--- 11. rate limit and ban ---'
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
delete from public.rate_events;
select public.begin_upload('comments','webp','{480}') from generate_series(1,4);
select must_fail(
  $q$ select public.begin_upload('comments','webp','{480}') $q$,
  'too fast', 'the fifth upload in a minute is refused');

delete from public.rate_events;
insert into public.user_bans (user_id, banned_by, reason)
values ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', 'testing');
select must_fail(
  $q$ select public.begin_upload('comments','webp','{480}') $q$,
  'cannot upload', 'a banned account cannot upload');

select must_fail(
  $q$ select public.begin_upload('covers','webp','{480}') $q$,
  'cannot upload', 'a banned account cannot upload a cover either');
delete from public.user_bans where user_id = '22222222-2222-2222-2222-222222222222';

select must_fail(
  $q$ select public.begin_upload('covers','webp','{480}') $q$,
  'curators', 'a non-curator cannot upload a cover');
select must_fail(
  $q$ select public.begin_upload('elsewhere','webp','{480}') $q$,
  'unsupported', 'an unknown folder is refused');
select must_fail(
  $q$ select public.begin_upload('comments','gif','{480}') $q$,
  'jpeg, png or webp', 'an unsupported file type is refused');

\echo '--- 12. the moderation queues can see it ---'
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);
do $$ begin
  if exists (select 1 from public.admin_comment_feed(null, null, false, 60) f where f.body = 'here is the receipt')
     and (select count(*) from public.admin_comment_feed(null, null, false, 60) f where f.is_synthetic is not null) > 0
  then perform pass('admin_comment_feed still works and kept is_synthetic');
  else raise exception 'FAIL: comment feed broken'; end if;
end $$;

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
insert into public.comment_reports (comment_id, reporter_id, reason)
values ((select id from cmts where label='alice2'), '22222222-2222-2222-2222-222222222222', 'doxx');
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);
do $$ begin
  if exists (select 1 from public.admin_report_queue('open', 100) q
              where q.comment_id = (select id from cmts where label='alice2'))
  then perform pass('admin_report_queue still works with the image column added');
  else raise exception 'FAIL: report queue broken'; end if;
end $$;

\echo '--- 13. guest voting still works ---'
do $$ declare r record; begin
  select * into r from public.cast_guest_vote(
    '99999999-9999-9999-9999-999999999999',
    'aaaaaaaa-0000-0000-0000-000000000001', 'b', 'hash') ;
  perform pass('cast_guest_vote is untouched by any of this');
exception when others then
  if sqlerrm ilike '%guest voting%' or sqlerrm ilike '%turned off%' then
    perform pass('cast_guest_vote still gates on its own switch: ' || left(sqlerrm, 40));
  else raise exception 'FAIL: guest voting broke: %', sqlerrm; end if;
end $$;

\echo '--- 14. the ordinary write paths still work on a take with a picture ---'
-- Reactions are the highest-frequency update on this table and they run under
-- the *reacting reader's* JWT, not the author's. If the image guard tripped
-- here it would break liking site-wide, not just attachments.
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
insert into ids (who, id) values ('alice5', public.begin_upload('comments','webp','{480}'));
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
delete from public.rate_events;
insert into ids (who, id) values ('alice6', public.begin_upload('comments','webp','{480,960}'));
update ids set url = 'https://cdn.example/comments/' || id || '-w960.webp' where who = 'alice6';
select public.finish_upload((select id from ids where who='alice6'), (select url from ids where who='alice6'), 7000);
with posted as (
  insert into public.comments (topic_id, user_id, side, body, image_url, image_width, image_height)
  values ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','a',
          'a take that will be liked and edited', (select url from ids where who='alice6'), 960, 540)
  returning id
)
insert into cmts (label, id) select 'alice6', id from posted;

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
insert into public.comment_reactions (comment_id, user_id, value)
values ((select id from cmts where label='alice6'), '22222222-2222-2222-2222-222222222222', 1);
do $$ begin
  if (select likes_count from public.comments where id = (select id from cmts where label='alice6')) = 1
     and (select image_url from public.comments where id = (select id from cmts where label='alice6')) is not null
  then perform pass('liking a take with a picture works and leaves the picture alone');
  else raise exception 'FAIL: reaction path broken'; end if;
end $$;

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
update public.comments set body = 'a take that was edited after being liked'
 where id = (select id from cmts where label='alice6');
do $$ begin
  if (select edit_count from public.comments where id = (select id from cmts where label='alice6')) = 1
     and (select count(*) from public.comment_edits where comment_id = (select id from cmts where label='alice6')) = 1
     and (select image_url from public.comments where id = (select id from cmts where label='alice6')) is not null
     and (select state from public.uploads where id = (select id from ids where who='alice6')) = 'stored'
  then perform pass('editing the body keeps the trail, the picture and the ledger row');
  else raise exception 'FAIL: edit path broken (edits=%, state=%)',
    (select count(*) from public.comment_edits where comment_id = (select id from cmts where label='alice6')),
    (select state from public.uploads where id = (select id from ids where who='alice6')); end if;
end $$;

-- A take with no picture at all must be untouched by any of this.
delete from public.rate_events;
insert into public.comments (topic_id, user_id, side, body)
values ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','a','a plain text take');
select pass('a plain text take still posts');

-- And a pending row whose bytes never landed is swept on age alone.
update public.uploads set created_at = now() - interval '2 hours'
 where id = (select id from ids where who='alice5');
do $$ declare claimed uuid[]; begin
  select array(select id from public.take_orphaned_uploads(100)) into claimed;
  if claimed = array[(select id from ids where who='alice5')]
  then perform pass('an upload reserved but never confirmed is swept on age');
  else raise exception 'FAIL: swept %', claimed; end if;
end $$;

\echo 'DONE'

