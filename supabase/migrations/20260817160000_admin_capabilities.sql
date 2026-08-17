-- ============================================================================
-- Admin capabilities: moderation, bans, reports, audit trail and insight RPCs
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Missing table privileges
--    RLS already granted admins "for all" on these tables, but the table-level
--    GRANTs were never issued, so every admin write failed with
--    "permission denied for table ...". RLS still gates who may act.
-- ---------------------------------------------------------------------------
grant update, delete on public.topics to authenticated;
grant insert, update, delete on public.categories to authenticated;
grant insert, update, delete on public.tags to authenticated;
grant update on public.topic_tags to authenticated;
grant insert, update, delete on public.user_roles to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Bans
--    Kept in a dedicated table rather than a profiles column: profiles carries
--    a self-update policy, so a banned user could lift their own ban.
-- ---------------------------------------------------------------------------
create table if not exists public.user_bans (
  user_id uuid primary key,
  reason text,
  banned_by uuid not null,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.user_bans to authenticated;
grant all on public.user_bans to service_role;
alter table public.user_bans enable row level security;

create or replace function public.is_banned(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_bans where user_id = _user_id)
$$;
revoke all on function public.is_banned(uuid) from public, anon;
grant execute on function public.is_banned(uuid) to authenticated;

create policy "read own ban" on public.user_bans
  for select to authenticated using (auth.uid() = user_id);
create policy "admins manage bans" on public.user_bans
  for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin') and banned_by = auth.uid());

-- an admin can never be banned — demote first, then ban
create or replace function public.protect_admin_from_ban()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.has_role(new.user_id, 'admin') then
    raise exception 'Admins cannot be banned. Revoke the admin role first.';
  end if;
  return new;
end; $$;
revoke all on function public.protect_admin_from_ban() from public, anon, authenticated;
create trigger user_bans_protect_admins
  before insert or update on public.user_bans
  for each row execute function public.protect_admin_from_ban();

-- the platform must never be left without an admin
create or replace function public.protect_last_admin()
returns trigger language plpgsql security definer set search_path = public as $$
declare remaining integer;
begin
  if old.role = 'admin' and (tg_op = 'DELETE' or new.role <> 'admin') then
    select count(*) into remaining
      from public.user_roles
     where role = 'admin' and user_id <> old.user_id;
    if remaining = 0 then
      raise exception 'Cannot remove the last admin.';
    end if;
  end if;
  return case tg_op when 'DELETE' then old else new end;
end; $$;
revoke all on function public.protect_last_admin() from public, anon, authenticated;
create trigger user_roles_protect_last_admin
  before update or delete on public.user_roles
  for each row execute function public.protect_last_admin();

-- ---------------------------------------------------------------------------
-- 2. Comment moderation (soft hide instead of destructive delete)
-- ---------------------------------------------------------------------------
alter table public.comments
  add column if not exists is_hidden boolean not null default false,
  add column if not exists hidden_reason text,
  add column if not exists hidden_by uuid,
  add column if not exists hidden_at timestamptz;
create index if not exists comments_hidden_idx on public.comments (topic_id) where is_hidden;

drop policy if exists "comments public read" on public.comments;
create policy "comments public read" on public.comments for select using (
  is_hidden = false
  and exists (select 1 from public.topics t where t.id = topic_id and t.status = 'published')
);
create policy "read own comments" on public.comments
  for select to authenticated using (auth.uid() = user_id);
create policy "admins read all comments" on public.comments
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "admins moderate comments" on public.comments
  for update to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- authors keep their "edit own comment" policy, but must not be able to
-- un-hide themselves through it
create or replace function public.guard_comment_moderation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- no JWT subject means the service role or a backend job: let it through.
  -- anon only holds SELECT on comments, so it can never reach this trigger.
  -- current_user is deliberately not used here: inside a security definer
  -- function it resolves to the function owner, not the caller.
  if auth.uid() is null or public.has_role(auth.uid(), 'admin') then
    return new;
  end if;
  if new.is_hidden is distinct from old.is_hidden
    or new.hidden_reason is distinct from old.hidden_reason
    or new.hidden_by is distinct from old.hidden_by
    or new.hidden_at is distinct from old.hidden_at then
    raise exception 'Only admins can change moderation fields.';
  end if;
  return new;
end; $$;
revoke all on function public.guard_comment_moderation() from public, anon, authenticated;
create trigger comments_guard_moderation
  before update on public.comments
  for each row execute function public.guard_comment_moderation();

-- ---------------------------------------------------------------------------
-- 3. Topic curation: featured headliner + review metadata
-- ---------------------------------------------------------------------------
alter table public.topics
  add column if not exists is_featured boolean not null default false,
  add column if not exists moderation_note text,
  add column if not exists reviewed_by uuid,
  add column if not exists reviewed_at timestamptz;
create unique index if not exists topics_single_featured_idx
  on public.topics (is_featured) where is_featured;

-- ---------------------------------------------------------------------------
-- 4. User-filed comment reports -> admin moderation queue
-- ---------------------------------------------------------------------------
create type public.report_status as enum ('open', 'resolved', 'dismissed');

create table if not exists public.comment_reports (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments(id) on delete cascade,
  reporter_id uuid not null,
  reason text not null check (char_length(reason) between 1 and 300),
  status public.report_status not null default 'open',
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (comment_id, reporter_id)
);
create index if not exists comment_reports_status_idx on public.comment_reports (status, created_at desc);
grant select, insert, update on public.comment_reports to authenticated;
grant all on public.comment_reports to service_role;
alter table public.comment_reports enable row level security;

create policy "read own reports" on public.comment_reports
  for select to authenticated using (auth.uid() = reporter_id);
create policy "admins read reports" on public.comment_reports
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "report a comment" on public.comment_reports
  for insert to authenticated
  with check (
    auth.uid() = reporter_id
    and status = 'open'
    and not public.is_banned(auth.uid())
  );
create policy "admins resolve reports" on public.comment_reports
  for update to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------------
-- 5. Audit trail — append only, admin readable
-- ---------------------------------------------------------------------------
create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  summary text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_log_created_idx on public.admin_audit_log (created_at desc);
grant select, insert on public.admin_audit_log to authenticated;
grant all on public.admin_audit_log to service_role;
alter table public.admin_audit_log enable row level security;

create policy "admins read audit log" on public.admin_audit_log
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));
create policy "admins append audit log" on public.admin_audit_log
  for insert to authenticated
  with check (public.has_role(auth.uid(), 'admin') and actor_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 6. Banned users lose write access everywhere
-- ---------------------------------------------------------------------------
drop policy if exists "users suggest topics" on public.topics;
create policy "users suggest topics" on public.topics
  for insert to authenticated
  with check (
    auth.uid() = submitted_by
    and status = 'pending'
    and not public.is_banned(auth.uid())
  );

drop policy if exists "cast own vote" on public.votes;
create policy "cast own vote" on public.votes
  for insert to authenticated
  with check (auth.uid() = user_id and not public.is_banned(auth.uid()));

drop policy if exists "switch own vote" on public.votes;
create policy "switch own vote" on public.votes
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and not public.is_banned(auth.uid()));

drop policy if exists "comment after voting" on public.comments;
create policy "comment after voting" on public.comments
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and not public.is_banned(auth.uid())
    and exists (
      select 1 from public.votes v
       where v.topic_id = comments.topic_id
         and v.user_id = auth.uid()
         and v.choice = comments.side
    )
  );

drop policy if exists "insert own reaction" on public.comment_reactions;
create policy "insert own reaction" on public.comment_reactions
  for insert to authenticated
  with check (auth.uid() = user_id and not public.is_banned(auth.uid()));

drop policy if exists "update own reaction" on public.comment_reactions;
create policy "update own reaction" on public.comment_reactions
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and not public.is_banned(auth.uid()));

-- ---------------------------------------------------------------------------
-- 7. Feed view: hidden comments stop counting, featured flag exposed
-- ---------------------------------------------------------------------------
create or replace view public.topic_cards as
 select t.id,
    t.title,
    t.description,
    t.choice_a,
    t.choice_b,
    t.status,
    t.submitted_by,
    t.votes_a,
    t.votes_b,
    t.created_at,
    t.published_at,
    c.name as category_name,
    c.slug as category_slug,
    c.emoji as category_emoji,
    t.category_id,
    t.votes_a + t.votes_b as total_votes,
        case
            when (t.votes_a + t.votes_b) = 0 then 50::numeric
            else round(100.0 * t.votes_a::numeric / (t.votes_a + t.votes_b)::numeric)
        end as pct_a,
    coalesce(( select array_agg(tg.name order by tg.name) as array_agg
           from topic_tags tt
             join tags tg on tg.id = tt.tag_id
          where tt.topic_id = t.id), '{}'::text[]) as tags,
    ( select count(*) as count
           from comments cm
          where cm.topic_id = t.id and cm.is_hidden = false) as comments_count,
    ( select count(*) as count
           from comments cm
          where cm.topic_id = t.id and cm.is_hidden = false and cm.controversy_score >= 6) as wild_takes_count,
    (t.votes_a + t.votes_b + 1)::numeric / power(2::numeric + extract(epoch from now() - coalesce(t.published_at, t.created_at)) / 3600.0, 1.2) as trending_score,
    t.cover_image_url,
    t.is_featured
   from topics t
     left join categories c on c.id = t.category_id;

-- ---------------------------------------------------------------------------
-- 8. Admin insight RPCs
--    security definer so an admin can see aggregates over rows that per-user
--    RLS hides (votes, other people's activity) without opening those tables.
-- ---------------------------------------------------------------------------
create or replace function public.admin_dashboard_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'topics_published', (select count(*) from public.topics where status = 'published'),
    'topics_pending',   (select count(*) from public.topics where status = 'pending'),
    'topics_rejected',  (select count(*) from public.topics where status = 'rejected'),
    'votes_total',      (select count(*) from public.votes),
    'votes_24h',        (select count(*) from public.votes where created_at > now() - interval '24 hours'),
    'comments_total',   (select count(*) from public.comments where is_hidden = false),
    'comments_24h',     (select count(*) from public.comments where is_hidden = false and created_at > now() - interval '24 hours'),
    'comments_hidden',  (select count(*) from public.comments where is_hidden),
    'reports_open',     (select count(*) from public.comment_reports where status = 'open'),
    'users_total',      (select count(*) from public.profiles),
    'users_banned',     (select count(*) from public.user_bans),
    'admins_total',     (select count(*) from public.user_roles where role = 'admin')
  ) into result;
  return result;
end; $$;
revoke all on function public.admin_dashboard_stats() from public, anon;
grant execute on function public.admin_dashboard_stats() to authenticated;

-- feature a topic as the Headliner. one statement so the "only one featured"
-- index can never be tripped by a half-applied swap. pass null to clear.
create or replace function public.admin_set_featured(_topic_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  update public.topics
     set is_featured = false
   where is_featured and (_topic_id is null or id <> _topic_id);
  if _topic_id is not null then
    update public.topics
       set is_featured = true
     where id = _topic_id and status = 'published';
  end if;
end; $$;
revoke all on function public.admin_set_featured(uuid) from public, anon;
grant execute on function public.admin_set_featured(uuid) to authenticated;

create or replace function public.admin_activity_series(_days integer default 14)
returns table (day date, vote_count bigint, comment_count bigint, signup_count bigint)
language plpgsql stable security definer set search_path = public as $$
declare span integer := greatest(1, least(coalesce(_days, 14), 90));
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  return query
  select d::date,
    (select count(*) from public.votes v where v.created_at >= d and v.created_at < d + interval '1 day'),
    (select count(*) from public.comments c where c.created_at >= d and c.created_at < d + interval '1 day'),
    (select count(*) from public.profiles p where p.created_at >= d and p.created_at < d + interval '1 day')
  from generate_series(
    date_trunc('day', now()) - make_interval(days => span - 1),
    date_trunc('day', now()),
    interval '1 day'
  ) d
  order by d;
end; $$;
revoke all on function public.admin_activity_series(integer) from public, anon;
grant execute on function public.admin_activity_series(integer) to authenticated;

create or replace function public.admin_user_directory(_search text default null, _limit integer default 60)
returns table (
  id uuid,
  username text,
  avatar_url text,
  created_at timestamptz,
  is_admin boolean,
  is_banned boolean,
  ban_reason text,
  votes_count bigint,
  comments_count bigint,
  hidden_comments_count bigint,
  topics_count bigint,
  reports_against bigint
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  return query
  select p.id,
    p.username,
    p.avatar_url,
    p.created_at,
    exists (select 1 from public.user_roles r where r.user_id = p.id and r.role = 'admin'),
    exists (select 1 from public.user_bans b where b.user_id = p.id),
    (select b.reason from public.user_bans b where b.user_id = p.id),
    (select count(*) from public.votes v where v.user_id = p.id),
    (select count(*) from public.comments c where c.user_id = p.id),
    (select count(*) from public.comments c where c.user_id = p.id and c.is_hidden),
    (select count(*) from public.topics t where t.submitted_by = p.id),
    (select count(*) from public.comment_reports cr
       join public.comments c on c.id = cr.comment_id
      where c.user_id = p.id)
  from public.profiles p
  where _search is null or _search = '' or p.username ilike '%' || _search || '%'
  order by p.created_at desc
  limit greatest(1, least(coalesce(_limit, 60), 200));
end; $$;
revoke all on function public.admin_user_directory(text, integer) from public, anon;
grant execute on function public.admin_user_directory(text, integer) to authenticated;

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
  topic_title text
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
    t.title
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
  open_reports bigint
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'admin') then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  return query
  select c.id,
    c.body,
    c.side::text,
    c.created_at,
    c.is_hidden,
    c.hidden_reason,
    c.likes_count,
    c.dislikes_count,
    c.controversy_score,
    c.user_id,
    coalesce(p.username, 'unknown'),
    exists (select 1 from public.user_bans b where b.user_id = c.user_id),
    t.id,
    t.title,
    (select count(*) from public.comment_reports r where r.comment_id = c.id and r.status = 'open')
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
