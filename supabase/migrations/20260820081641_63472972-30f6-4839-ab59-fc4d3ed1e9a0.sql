-- ---------------------------------------------------------------------------
-- Feed read path: denormalise the per-card counts and make the sorts indexable.
--
-- topic_cards previously computed comments_count and wild_takes_count with a
-- correlated COUNT over public.comments for every row it returned, and derived
-- trending_score from now() inline. A 60-row feed therefore ran 120 counts over
-- the comments table, and the ORDER BY could never use an index because the
-- sort key was a volatile expression — so every feed request full-scanned and
-- sorted every published topic.
--
-- Both counts are now columns on public.topics maintained by trigger, and
-- trending_score is a stored column refreshed on a schedule. The view becomes a
-- scan of topics plus the category join and the (small, PK-indexed) tag lookup.
-- ---------------------------------------------------------------------------

-- 1. Stored counters ---------------------------------------------------------

alter table public.topics
  add column if not exists comments_count integer not null default 0,
  add column if not exists wild_takes_count integer not null default 0,
  -- numeric, not double precision: topic_cards already exposes trending_score
  -- as numeric and CREATE OR REPLACE VIEW cannot change a column's type.
  add column if not exists trending_score numeric not null default 0;

-- total_votes was computed in the view on every read. As a stored generated
-- column it can carry an index, which is what the "Top Voted" tab sorts on.
alter table public.topics
  add column if not exists total_votes integer
  generated always as (votes_a + votes_b) stored;

-- 2. Keeping the comment counters in sync ------------------------------------

create or replace function public.sync_topic_comment_counts() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  old_topic uuid;
  new_topic uuid;
  old_visible int := 0;
  new_visible int := 0;
  old_wild int := 0;
  new_wild int := 0;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    old_topic := old.topic_id;
    old_visible := (not old.is_hidden)::int;
    old_wild := ((not old.is_hidden) and old.controversy_score >= 6)::int;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    new_topic := new.topic_id;
    new_visible := (not new.is_hidden)::int;
    new_wild := ((not new.is_hidden) and new.controversy_score >= 6)::int;
  end if;

  if old_topic is not distinct from new_topic then
    if new_visible <> old_visible or new_wild <> old_wild then
      update public.topics
         set comments_count = comments_count + (new_visible - old_visible),
             wild_takes_count = wild_takes_count + (new_wild - old_wild)
       where id = coalesce(new_topic, old_topic);
    end if;
  else
    if old_topic is not null then
      update public.topics
         set comments_count = comments_count - old_visible,
             wild_takes_count = wild_takes_count - old_wild
       where id = old_topic;
    end if;
    if new_topic is not null then
      update public.topics
         set comments_count = comments_count + new_visible,
             wild_takes_count = wild_takes_count + new_wild
       where id = new_topic;
    end if;
  end if;

  return null;
end; $$;

drop trigger if exists comments_sync_topic_counts on public.comments;
create trigger comments_sync_topic_counts
  after insert or update or delete on public.comments
  for each row execute function public.sync_topic_comment_counts();

-- 3. Backfill from the live data --------------------------------------------

update public.topics t
   set comments_count = coalesce(c.visible, 0),
       wild_takes_count = coalesce(c.wild, 0)
  from (
    select topic_id,
           count(*) filter (where not is_hidden) as visible,
           count(*) filter (where not is_hidden and controversy_score >= 6) as wild
      from public.comments
     group by topic_id
  ) c
 where c.topic_id = t.id;

update public.topics t
   set comments_count = 0, wild_takes_count = 0
 where not exists (select 1 from public.comments cm where cm.topic_id = t.id)
   and (t.comments_count <> 0 or t.wild_takes_count <> 0);

-- 4. Trending score ----------------------------------------------------------

create or replace function public.refresh_trending_scores() returns void
language sql security definer set search_path = public as $$
  update public.topics t
     set trending_score = (t.votes_a + t.votes_b + 1)::numeric
         / power(
             2::numeric
             + extract(epoch from (now() - coalesce(t.published_at, t.created_at))) / 3600.0,
             1.2
           )
   where t.status = 'published';
$$;
revoke all on function public.refresh_trending_scores() from public, anon, authenticated;

select public.refresh_trending_scores();

create or replace function public.seed_trending_score() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status = 'published'
     and (tg_op = 'INSERT' or old.status is distinct from new.status
          or old.published_at is distinct from new.published_at) then
    new.trending_score := (new.votes_a + new.votes_b + 1)::numeric
      / power(
          2::numeric
          + extract(epoch from (now() - coalesce(new.published_at, new.created_at))) / 3600.0,
          1.2
        );
  end if;
  return new;
end; $$;

drop trigger if exists topics_seed_trending on public.topics;
create trigger topics_seed_trending
  before insert or update on public.topics
  for each row execute function public.seed_trending_score();

select cron.unschedule('refresh-trending-scores')
 where exists (select 1 from cron.job where jobname = 'refresh-trending-scores');

select cron.schedule(
  'refresh-trending-scores',
  '* * * * *',
  $$ select public.refresh_trending_scores(); $$
);

-- 5. Indexes for the three feed sorts ----------------------------------------

create index if not exists topics_published_recent_idx
  on public.topics (published_at desc) where status = 'published';
create index if not exists topics_published_votes_idx
  on public.topics (total_votes desc) where status = 'published';
create index if not exists topics_published_trending_idx
  on public.topics (trending_score desc) where status = 'published';

create index if not exists comments_topic_created_idx
  on public.comments (topic_id, created_at desc);

-- 6. The view now just reads the columns -------------------------------------

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
    t.total_votes,
        case
            when t.total_votes = 0 then 50::numeric
            else round(100.0 * t.votes_a::numeric / t.total_votes::numeric)
        end as pct_a,
    coalesce(( select array_agg(tg.name order by tg.name) as array_agg
           from topic_tags tt
             join tags tg on tg.id = tt.tag_id
          where tt.topic_id = t.id), '{}'::text[]) as tags,
    t.comments_count::bigint as comments_count,
    t.wild_takes_count::bigint as wild_takes_count,
    t.trending_score,
    t.cover_image_url,
    t.is_featured
   from topics t
     left join categories c on c.id = t.category_id;

alter view public.topic_cards set (security_invoker = on);
grant select on public.topic_cards to anon, authenticated;