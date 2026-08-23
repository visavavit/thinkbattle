-- Ranked comment reads must see the whole debate, not just the page of newest
-- takes the client happens to hold. The discussion pages top-level comments by
-- created_at, so before this the "Top take" badge only ever meant "top of the
-- last 50" — on a busy topic the genuinely most-liked take never even loaded.

-- The controversy score is already a stored generated column; give the net
-- score the same treatment so both rankings can be served from an index.
alter table public.comments
  add column if not exists net_score integer
  generated always as (likes_count - dislikes_count) stored;

-- Partial indexes: only top-level, non-hidden takes are ever ranked.
create index if not exists comments_top_pins_idx
  on public.comments (topic_id, side, net_score desc, likes_count desc, created_at desc)
  where parent_id is null and not is_hidden;

create index if not exists comments_wild_pins_idx
  on public.comments (topic_id, side, controversy_score desc, created_at desc)
  where parent_id is null and not is_hidden;

-- Returns, per side, the top _per_side takes by net score and the top _per_side
-- by controversy, plus every reply belonging to those takes — a pinned take
-- fetched from outside the loaded page would otherwise render with an empty
-- reply thread, which reads as "nobody answered this".
--
-- security invoker, deliberately: this returns comment bodies, so it inherits
-- the "comments public read" policy that gates on topics.status = 'published'
-- rather than bypassing it the way the definer helpers next door do.
create or replace function public.topic_ranked_comments(_topic_id uuid, _per_side integer default 3)
returns table(
  id uuid,
  topic_id uuid,
  user_id uuid,
  side text,
  body text,
  likes_count integer,
  dislikes_count integer,
  controversy_score integer,
  net_score integer,
  is_hidden boolean,
  hidden_reason text,
  created_at timestamptz,
  parent_id uuid,
  is_synthetic boolean
)
language sql stable security invoker set search_path = public as $$
  with ranked as (
    select
      c.*,
      row_number() over (
        partition by c.side
        order by c.net_score desc, c.likes_count desc, c.created_at desc
      ) as top_rank,
      row_number() over (
        partition by c.side
        order by c.controversy_score desc, (c.likes_count + c.dislikes_count) desc, c.created_at desc
      ) as wild_rank
    from public.comments c
    where c.topic_id = _topic_id
      and c.parent_id is null
      and not c.is_hidden
  ),
  pins as (
    select * from ranked
    where top_rank <= greatest(_per_side, 0) or wild_rank <= greatest(_per_side, 0)
  )
  select
    p.id, p.topic_id, p.user_id, p.side::text, p.body, p.likes_count,
    p.dislikes_count, p.controversy_score, p.net_score, p.is_hidden,
    p.hidden_reason, p.created_at, p.parent_id, p.is_synthetic
  from pins p
  union all
  select
    r.id, r.topic_id, r.user_id, r.side::text, r.body, r.likes_count,
    r.dislikes_count, r.controversy_score, r.net_score, r.is_hidden,
    r.hidden_reason, r.created_at, r.parent_id, r.is_synthetic
  from public.comments r
  where r.topic_id = _topic_id
    and r.parent_id in (select id from pins);
$$;

revoke all on function public.topic_ranked_comments(uuid, integer) from public;
grant execute on function public.topic_ranked_comments(uuid, integer) to anon, authenticated, service_role;
