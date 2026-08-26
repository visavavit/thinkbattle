-- Image attachments on takes, behind an admin switch.
--
-- NOT YET EXECUTED. Written and reviewed, never run: the session that authored
-- it had no database to run it against. Apply to a branch or staging project
-- first. The switch defaults to off, so applying it changes nothing visible
-- until an admin turns it on.
--
-- Why this is more than a text column:
--
-- Text moderation is cheap to undo — hiding a take makes it unreadable and
-- that is the end of it. An image is a separate object on a public CDN with
-- `cache-control: immutable`, and nothing in this repo could delete one:
-- r2.server.ts had a PUT and no DELETE. Hiding a take with a picture on it
-- would have left the picture publicly fetchable forever, by anyone who saw
-- the URL once. For the categories an argument site attracts — doxxed
-- screenshots, NCII, gore — that is not a moderation gap, it is the absence of
-- moderation. It is also a PDPA problem: you cannot honour a deletion request
-- for bytes you have no way to delete.
--
-- So the deletion path is the feature and the attachment is the easy part.
-- Three things carry it:
--
--   1. public.uploads — a ledger row per upload, written before the bytes are
--      ever sent. Nothing reaches R2 without a row here naming its owner, so
--      every object is attributable and, more importantly, addressable: the
--      row holds the key parts needed to delete it again.
--   2. Triggers that mark a ledger row `orphaned` the moment the thing
--      referencing it stops referencing it — a take deleted, an image removed,
--      a take hidden, a topic cascade. The database records the intent even
--      when no application code is running.
--   3. take_orphaned_uploads/mark_uploads_purged — the claim-and-confirm pair
--      the server calls to actually delete from R2. Prompt on the interactive
--      path, sweepable later for everything else.
--
-- Hiding a take nulls its image. That is deliberate and it is not reversible:
-- see guard_comment_image below.

-- ---------------------------------------------------------------------------
-- 1. The upload ledger
-- ---------------------------------------------------------------------------

-- `id` is the same uuid the R2 object key is built from (see renditionKey in
-- src/lib/images.ts), which is what makes a row enough to find the bytes
-- again. `widths` mirrors the rendition ladder written for that id: empty for
-- a single unsized file, otherwise one sibling object per entry.
create table if not exists public.uploads (
  id uuid primary key,
  user_id uuid not null,
  folder text not null check (folder in ('covers', 'avatars', 'comments')),
  ext text not null check (ext in ('jpg', 'png', 'webp')),
  widths integer[] not null default '{}',
  -- null until the bytes land; the public URL of the widest rendition, which
  -- is the one recorded on the take.
  url text unique,
  bytes bigint not null default 0,
  -- pending  : reserved, bytes may or may not have been written yet
  -- stored   : bytes are in R2 and the URL is live
  -- orphaned : nothing references it any more; waiting to be deleted from R2
  -- purging  : claimed by a sweep that is deleting it right now
  state text not null default 'pending' check (state in ('pending', 'stored', 'orphaned', 'purging')),
  created_at timestamptz not null default now(),
  stored_at timestamptz,
  orphaned_at timestamptz
);

create index if not exists uploads_user_created_idx on public.uploads (user_id, created_at desc);
-- The sweep's working set: everything not in a settled state, newest last.
create index if not exists uploads_state_idx on public.uploads (state, created_at)
  where state <> 'stored';

grant select on public.uploads to authenticated;
grant all on public.uploads to service_role;
alter table public.uploads enable row level security;

-- Read-only to its owner, and written exclusively by the definer functions
-- below. An INSERT grant here would let a client mint a ledger row claiming an
-- object it does not own, which is the one thing the ledger exists to prevent.
-- Dropped first because Postgres has no `create policy if not exists`, and a
-- migration that cannot be re-run is one you cannot recover a half-failed
-- apply with.
drop policy if exists "read own uploads" on public.uploads;
create policy "read own uploads" on public.uploads
  for select to authenticated using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 2. The attachment itself
-- ---------------------------------------------------------------------------

-- Dimensions are stored rather than measured on the client because the
-- comment feed is keyset-paged and images land mid-scroll: without an intrinsic
-- aspect ratio in the markup every attachment shoves the rows below it down as
-- it decodes.
alter table public.comments
  add column if not exists image_url text,
  add column if not exists image_width integer,
  add column if not exists image_height integer;

-- One take per image. Without this an author could post the same upload on
-- twenty takes, and purging any one of them would blank the other nineteen.
create unique index if not exists comments_image_url_uniq
  on public.comments (image_url) where image_url is not null;

-- ---------------------------------------------------------------------------
-- 3. The switch
-- ---------------------------------------------------------------------------

-- Absent means off, the same way guest voting reads: a fresh environment
-- should not start accepting user-supplied images because nobody has said
-- otherwise yet.
create or replace function public.comment_images_enabled()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select value from public.app_settings where key = 'comment_images_enabled'), 'off') = 'on';
$$;

revoke all on function public.comment_images_enabled() from public, anon, authenticated;
grant execute on function public.comment_images_enabled() to service_role;

-- Re-declared whole, per the note on the original: app_settings holds
-- bot_tick_secret, so the public keys are enumerated in code here rather than
-- exposed by a read policy.
create or replace function public.site_flags()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'guest_voting',
    coalesce((select value from public.app_settings where key = 'guest_voting_enabled'), 'off') = 'on',
    'comment_images',
    coalesce((select value from public.app_settings where key = 'comment_images_enabled'), 'off') = 'on'
  );
$$;

revoke all on function public.site_flags() from public;
grant execute on function public.site_flags() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Reserving an upload
-- ---------------------------------------------------------------------------

-- Called before a single byte is sent. Everything that could reject the upload
-- is checked here, so a rejected attempt costs no storage — and the rate event
-- is written on the way in, so an attempt that is abandoned half way still
-- counts against the quota. The alternative, charging only for completed
-- uploads, makes the cheapest abuse the one that never finishes.
--
-- The comment spam guard is a trigger on comments and never sees an upload, so
-- without a limit of its own the bucket is free storage for anyone with an
-- account.
create or replace function public.begin_upload(_folder text, _ext text, _widths integer[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _id uuid;
  _minute integer;
  _hour integer;
begin
  if _uid is null then
    raise exception 'Sign in to upload an image.' using errcode = '22000';
  end if;
  if _folder not in ('covers', 'avatars', 'comments') then
    raise exception 'Unsupported upload target.' using errcode = '22000';
  end if;
  if _ext not in ('jpg', 'png', 'webp') then
    raise exception 'Only JPEG, PNG or WebP images are allowed.' using errcode = '22000';
  end if;
  if public.is_banned(_uid) then
    raise exception 'Your account cannot upload images.' using errcode = '22000';
  end if;
  if _folder = 'covers' and not public.has_role(_uid, 'admin') then
    raise exception 'Only curators can upload cover images.' using errcode = '22000';
  end if;
  -- Re-checked here rather than trusted from the client: a page cached before
  -- an admin switched attachments off must not still be able to send one.
  if _folder = 'comments' and not public.comment_images_enabled() then
    raise exception 'Image attachments are turned off.' using errcode = '22000';
  end if;

  select count(*) into _minute
    from public.rate_events e
   where e.user_id = _uid and e.kind = 'upload'
     and e.created_at > now() - interval '1 minute';
  if _minute >= 4 then
    raise exception 'You are uploading too fast. Try again in a minute.' using errcode = '22000';
  end if;

  select count(*) into _hour
    from public.rate_events e
   where e.user_id = _uid and e.kind = 'upload'
     and e.created_at > now() - interval '1 hour';
  if _hour >= 30 then
    raise exception 'Hourly image limit reached. Take a breather.' using errcode = '22000';
  end if;

  insert into public.rate_events (user_id, kind) values (_uid, 'upload');

  _id := gen_random_uuid();
  insert into public.uploads (id, user_id, folder, ext, widths)
  values (_id, _uid, _folder, _ext, coalesce(_widths, '{}'));
  return _id;
end; $$;

revoke all on function public.begin_upload(text, text, integer[]) from public, anon;
grant execute on function public.begin_upload(text, text, integer[]) to authenticated, service_role;

-- Confirms the bytes landed. Until this runs the row stays `pending`, and a
-- pending row older than an hour is swept — so a crash between the PUT and
-- here loses the object rather than leaking it.
create or replace function public.finish_upload(_id uuid, _url text, _bytes bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.uploads
     set url = _url, bytes = greatest(_bytes, 0), state = 'stored', stored_at = now()
   where id = _id and user_id = auth.uid() and state = 'pending';
  if not found then
    raise exception 'That upload is no longer open.' using errcode = '22000';
  end if;
end; $$;

revoke all on function public.finish_upload(uuid, text, bigint) from public, anon;
grant execute on function public.finish_upload(uuid, text, bigint) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. What may be attached, and what happens to it later
-- ---------------------------------------------------------------------------

-- Three rules, in one BEFORE trigger:
--
--   * You may only attach an image you uploaded. The URL arrives from the
--     browser like any other column, so without this check a poster could
--     attach a URL they merely saw — including one already on someone else's
--     take, whose author would then lose the picture when this one is purged.
--   * An image cannot be swapped after posting. The body has an edit trail
--     (comment_edits) precisely so a take cannot be quietly rewritten after it
--     has been liked; an image with no trail and no ceiling on how far it can
--     change the meaning of a take is worse. Removal stays allowed — an author
--     who regrets a picture should not have to delete the argument with it.
--   * Hiding a take takes its image down. This is the whole reason the
--     deletion path exists, so it is enforced in the trigger rather than left
--     to whichever UI happens to perform the hide: both the moderation panel
--     and the inline controls write to this table directly. It does not come
--     back on unhide, and the moderation copy says so.
create or replace function public.guard_comment_image()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.image_url is null then
      return new;
    end if;
    if not public.comment_images_enabled() then
      raise exception 'Image attachments are turned off.' using errcode = '22000';
    end if;
    if new.parent_id is not null then
      raise exception 'Replies cannot carry an image.' using errcode = '22000';
    end if;
    if not exists (
      select 1 from public.uploads u
       where u.url = new.image_url
         and u.user_id = new.user_id
         and u.folder = 'comments'
         and u.state = 'stored'
    ) then
      raise exception 'That image is not yours to post.' using errcode = '22000';
    end if;
    return new;
  end if;

  if new.image_url is distinct from old.image_url and new.image_url is not null then
    raise exception 'An image cannot be changed after posting. Remove it instead.'
      using errcode = '22000';
  end if;

  if coalesce(new.is_hidden, false) and not coalesce(old.is_hidden, false) then
    new.image_url := null;
    new.image_width := null;
    new.image_height := null;
  end if;

  return new;
end; $$;

revoke all on function public.guard_comment_image() from public, anon, authenticated;

drop trigger if exists comments_guard_image on public.comments;
create trigger comments_guard_image
  before insert or update on public.comments
  for each row execute function public.guard_comment_image();

-- The other half: once nothing references an upload, say so in the ledger.
-- An AFTER trigger rather than application code because the reference can
-- disappear without any application code running at all — `delete from topics`
-- cascades to comments, and neither the panel nor the client is in that path.
create or replace function public.orphan_comment_upload()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _gone text := case when tg_op = 'DELETE' then old.image_url
                     when new.image_url is distinct from old.image_url then old.image_url
                     else null end;
begin
  if _gone is not null then
    update public.uploads
       set state = 'orphaned', orphaned_at = now()
     where url = _gone and state = 'stored';
  end if;
  return null;
end; $$;

revoke all on function public.orphan_comment_upload() from public, anon, authenticated;

drop trigger if exists comments_orphan_upload on public.comments;
create trigger comments_orphan_upload
  after update or delete on public.comments
  for each row execute function public.orphan_comment_upload();

-- ---------------------------------------------------------------------------
-- 6. Deleting the bytes
-- ---------------------------------------------------------------------------

-- Claim-and-confirm, because the delete happens in R2 where no transaction
-- reaches. Claiming flips the rows to `purging` so two concurrent sweeps
-- cannot both try, and a sweep that dies mid-flight leaves rows in `purging`
-- rather than dropping them from the ledger while the bytes are still there.
-- Those are reclaimed after an hour on the next pass.
--
-- Three things qualify:
--   * orphaned  — the referencing take is gone, or was hidden, or the image
--                 was removed from it.
--   * pending   — reserved but never confirmed. The bytes may exist; the
--                 delete is issued regardless, and a 404 from R2 is fine.
--   * stored, folder 'comments', an hour old, on no take — uploaded into a
--     composer that was never submitted. Covers and avatars are deliberately
--     excluded: they hang off topics and profiles, which this predicate knows
--     nothing about, so sweeping them would delete live pictures.
create or replace function public.take_orphaned_uploads(_limit integer default 100)
returns table (id uuid, folder text, ext text, widths integer[])
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with claimed as (
    select u.id from public.uploads u
     where u.state in ('orphaned', 'pending', 'purging')
       and (
         u.state = 'orphaned'
         or (u.state = 'pending' and u.created_at < now() - interval '1 hour')
         or (u.state = 'purging' and u.orphaned_at < now() - interval '1 hour')
       )
     order by u.created_at
     limit greatest(coalesce(_limit, 100), 0)
     for update skip locked
  ), stale as (
    select u.id from public.uploads u
     where u.state = 'stored'
       and u.folder = 'comments'
       and u.created_at < now() - interval '1 hour'
       and not exists (select 1 from public.comments c where c.image_url = u.url)
     order by u.created_at
     limit greatest(coalesce(_limit, 100), 0)
     for update skip locked
  )
  update public.uploads u
     set state = 'purging', orphaned_at = now()
   where u.id in (select claimed.id from claimed union all select stale.id from stale)
  returning u.id, u.folder, u.ext, u.widths;
end; $$;

revoke all on function public.take_orphaned_uploads(integer) from public, anon, authenticated;
grant execute on function public.take_orphaned_uploads(integer) to service_role;

-- Only rows the caller actually deleted from R2. Dropping the ledger row is
-- what makes the deletion final; anything left behind comes back next sweep.
create or replace function public.mark_uploads_purged(_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  _n integer;
begin
  delete from public.uploads where id = any(coalesce(_ids, '{}')) and state = 'purging';
  get diagnostics _n = row_count;
  return _n;
end; $$;

revoke all on function public.mark_uploads_purged(uuid[]) from public, anon, authenticated;
grant execute on function public.mark_uploads_purged(uuid[]) to service_role;

-- How much is waiting, for the admin panel to show without exposing the rows.
create or replace function public.pending_upload_purges()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer from public.uploads u
   where u.state in ('orphaned', 'pending', 'purging')
      or (u.state = 'stored' and u.folder = 'comments'
          and u.created_at < now() - interval '1 hour'
          and not exists (select 1 from public.comments c where c.image_url = u.url));
$$;

revoke all on function public.pending_upload_purges() from public, anon, authenticated;
grant execute on function public.pending_upload_purges() to service_role;

-- ---------------------------------------------------------------------------
-- 7. The moderation queues have to be able to see it
-- ---------------------------------------------------------------------------

-- A report that says "this picture is a doxx" is unactionable if the queue only
-- shows the text under it, and a moderator who has to open the public page to
-- see what was reported is a moderator who will guess instead. Both feeds gain
-- the attachment URL.
--
-- Dropped rather than replaced: `create or replace function` cannot change a
-- function's return type.
drop function if exists public.admin_comment_feed(text, uuid, boolean, integer);
create or replace function public.admin_comment_feed(
  _search text default null,
  _topic_id uuid default null,
  _only_hidden boolean default false,
  _limit integer default 60
)
returns table (
  id uuid,
  body text,
  side text,
  created_at timestamptz,
  is_hidden boolean,
  hidden_reason text,
  likes_count integer,
  dislikes_count integer,
  controversy_score integer,
  author_id uuid,
  author_name text,
  author_banned boolean,
  topic_id uuid,
  topic_title text,
  open_reports bigint,
  is_synthetic boolean,
  image_url text
)
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
    c.is_synthetic,
    c.image_url
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

drop function if exists public.admin_report_queue(public.report_status, integer);
create or replace function public.admin_report_queue(
  _status public.report_status default 'open',
  _limit integer default 100
)
returns table (
  report_id uuid,
  reason text,
  status public.report_status,
  created_at timestamptz,
  reporter_id uuid,
  reporter_name text,
  comment_id uuid,
  comment_body text,
  comment_side text,
  comment_is_hidden boolean,
  comment_likes integer,
  comment_dislikes integer,
  author_id uuid,
  author_name text,
  author_banned boolean,
  topic_id uuid,
  topic_title text,
  comment_image_url text
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  return query
  select r.id,
    r.reason,
    r.status,
    r.created_at,
    r.reporter_id,
    coalesce(rp.username, 'unknown'),
    c.id,
    c.body,
    c.side::text,
    c.is_hidden,
    c.likes_count,
    c.dislikes_count,
    c.user_id,
    coalesce(ap.username, 'unknown'),
    exists (select 1 from public.user_bans b where b.user_id = c.user_id),
    t.id,
    t.title,
    c.image_url
  from public.comment_reports r
    join public.comments c on c.id = r.comment_id
    join public.topics t on t.id = c.topic_id
    left join public.profiles rp on rp.id = r.reporter_id
    left join public.profiles ap on ap.id = c.user_id
  where r.status = coalesce(_status, 'open')
  order by r.created_at desc
  limit greatest(1, least(coalesce(_limit, 100), 300));
end; $$;
revoke all on function public.admin_report_queue(public.report_status, integer) from public, anon;
grant execute on function public.admin_report_queue(public.report_status, integer) to authenticated;
