create or replace function public.admin_set_featured(_topic_id uuid default null)
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

create or replace function public.admin_user_directory(
  _search text default null,
  _limit integer default 60
)
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