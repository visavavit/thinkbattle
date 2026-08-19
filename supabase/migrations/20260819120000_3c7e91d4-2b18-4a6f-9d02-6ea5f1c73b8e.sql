-- ---------------------------------------------------------------------------
-- Notifications: someone replied to your take, liked it, dumped on it, or the
-- topic you suggested went live.
--
-- Rows are written only by SECURITY DEFINER triggers — clients never insert.
-- A recipient can read their own, mark them read, and delete them; that is all.
-- ---------------------------------------------------------------------------

create type public.notification_kind as enum ('reply', 'like', 'dislike', 'topic_published');

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  -- who is being told
  user_id uuid not null,
  -- who did it; null when the platform itself is the actor (topic_published)
  actor_id uuid,
  kind public.notification_kind not null,
  topic_id uuid not null references public.topics(id) on delete cascade,
  -- what to scroll to: the reply for 'reply', your own take for like/dislike
  comment_id uuid references public.comments(id) on delete cascade,
  -- for 'reply' only: the take that was replied to, so the UI can show context
  parent_comment_id uuid references public.comments(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_created_idx on public.notifications (user_id, created_at desc);
-- the badge count hits this one on every page load, so keep it partial and tiny
create index notifications_user_unread_idx on public.notifications (user_id) where read_at is null;

-- One reaction notification per person per comment: flipping like -> dislike
-- rewrites the row instead of stacking a second one, and un-reacting deletes it.
create unique index notifications_reaction_uniq
  on public.notifications (comment_id, actor_id) where kind in ('like', 'dislike');
create unique index notifications_reply_uniq
  on public.notifications (comment_id) where kind = 'reply';
create unique index notifications_topic_published_uniq
  on public.notifications (user_id, topic_id) where kind = 'topic_published';

grant select, delete on public.notifications to authenticated;
-- read_at is the only column a client may write, so grant it alone
grant update (read_at) on public.notifications to authenticated;
grant all on public.notifications to service_role;

alter table public.notifications enable row level security;

create policy "read own notifications" on public.notifications
  for select to authenticated using (auth.uid() = user_id);
create policy "mark own notifications read" on public.notifications
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own notifications" on public.notifications
  for delete to authenticated using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- Never notify yourself, and never write rows for a synthetic profile: the bot
-- audience does not read its inbox, and reactions aimed at bot takes would
-- otherwise be the bulk of this table.
--
-- Note the asymmetry: a *bot* acting on a *real* user's take does notify, which
-- matches how synthetic comments and votes already surface as ordinary activity.
-- To silence that, add an is_synthetic check on _actor here.
create or replace function public.notify_wanted(_recipient uuid, _actor uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select _recipient is not null
     and (_actor is null or _actor <> _recipient)
     and exists (select 1 from public.profiles p where p.id = _recipient and not p.is_synthetic)
$$;

create or replace function public.notify_on_reply()
returns trigger language plpgsql security definer set search_path = public as $$
declare _parent_author uuid;
begin
  if new.parent_id is null then
    return null;
  end if;
  select user_id into _parent_author from public.comments where id = new.parent_id;
  if not public.notify_wanted(_parent_author, new.user_id) then
    return null;
  end if;
  insert into public.notifications (user_id, actor_id, kind, topic_id, comment_id, parent_comment_id)
  values (_parent_author, new.user_id, 'reply', new.topic_id, new.id, new.parent_id)
  on conflict do nothing;
  return null;
end; $$;

create trigger comments_notify_reply
  after insert on public.comments
  for each row execute function public.notify_on_reply();

create or replace function public.notify_on_reaction()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  _author uuid;
  _topic uuid;
  _kind public.notification_kind;
begin
  -- taking a reaction back retracts the notification with it
  if tg_op = 'DELETE' then
    delete from public.notifications
     where kind in ('like', 'dislike')
       and comment_id = old.comment_id
       and actor_id = old.user_id;
    return null;
  end if;

  select c.user_id, c.topic_id into _author, _topic
    from public.comments c where c.id = new.comment_id;
  if not public.notify_wanted(_author, new.user_id) then
    return null;
  end if;

  _kind := (case when new.value = 1 then 'like' else 'dislike' end)::public.notification_kind;

  insert into public.notifications (user_id, actor_id, kind, topic_id, comment_id)
  values (_author, new.user_id, _kind, _topic, new.comment_id)
  on conflict (comment_id, actor_id) where kind in ('like', 'dislike')
  do update set
    kind = excluded.kind,
    created_at = now(),
    -- a genuine flip is news again; re-saving the same reaction is not
    read_at = case when notifications.kind = excluded.kind then notifications.read_at else null end;
  return null;
end; $$;

create trigger comment_reactions_notify
  after insert or update or delete on public.comment_reactions
  for each row execute function public.notify_on_reaction();

create or replace function public.notify_on_topic_published()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'published'
     and old.status is distinct from 'published'
     and new.submitted_by is not null
     and public.notify_wanted(new.submitted_by, null) then
    insert into public.notifications (user_id, actor_id, kind, topic_id)
    values (new.submitted_by, null, 'topic_published', new.id)
    on conflict do nothing;
  end if;
  return null;
end; $$;

-- Vote tallies and comment counts rewrite this table on every interaction, so
-- scope the trigger to status changes rather than paying for it on each vote.
create trigger topics_notify_published
  after update of status on public.topics
  for each row
  when (new.status = 'published' and old.status is distinct from 'published')
  execute function public.notify_on_topic_published();

revoke all on function public.notify_wanted(uuid, uuid) from public, anon, authenticated;
revoke all on function public.notify_on_reply() from public, anon, authenticated;
revoke all on function public.notify_on_reaction() from public, anon, authenticated;
revoke all on function public.notify_on_topic_published() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Read model: everything the bell needs in one round trip.
-- security_invoker keeps the caller's RLS, so this only ever yields own rows.
-- ---------------------------------------------------------------------------
create view public.notification_feed with (security_invoker = on) as
select
  n.id,
  n.user_id,
  n.kind,
  n.topic_id,
  n.comment_id,
  n.parent_comment_id,
  n.read_at,
  n.created_at,
  n.actor_id,
  ap.username   as actor_name,
  ap.avatar_url as actor_avatar,
  t.title       as topic_title,
  sc.body       as subject_body,
  sc.side       as subject_side,
  pc.body       as context_body
from public.notifications n
left join public.profiles ap on ap.id = n.actor_id
left join public.topics   t  on t.id  = n.topic_id
left join public.comments sc on sc.id = n.comment_id
left join public.comments pc on pc.id = n.parent_comment_id;

grant select on public.notification_feed to authenticated;

-- live badge updates; RLS still filters the stream per subscriber
alter publication supabase_realtime add table public.notifications;
