-- 1. Backfill missing profiles for real signed-up users
insert into public.profiles (id, username)
select u.id,
       coalesce(u.raw_user_meta_data->>'username', u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1), 'debater')
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;

-- 2. Notifications must not depend on a profile row existing
create or replace function public.notify_wanted(_recipient uuid, _actor uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select _recipient is not null
     and (_actor is null or _actor <> _recipient)
     and not exists (
       select 1 from public.profiles p where p.id = _recipient and p.is_synthetic
     )
$$;
revoke all on function public.notify_wanted(uuid, uuid) from public, anon, authenticated;

-- 3. Backfill notifications for activity that happened before this fix
insert into public.notifications (user_id, actor_id, kind, topic_id, comment_id, parent_comment_id, created_at)
select pc.user_id, c.user_id, 'reply', c.topic_id, c.id, c.parent_id, c.created_at
from public.comments c
join public.comments pc on pc.id = c.parent_id
where c.parent_id is not null
  and public.notify_wanted(pc.user_id, c.user_id)
on conflict do nothing;

insert into public.notifications (user_id, actor_id, kind, topic_id, comment_id, created_at)
select c.user_id, cr.user_id,
       (case when cr.value = 1 then 'like' else 'dislike' end)::public.notification_kind,
       c.topic_id, c.id, cr.created_at
from public.comment_reactions cr
join public.comments c on c.id = cr.comment_id
where public.notify_wanted(c.user_id, cr.user_id)
on conflict do nothing;
