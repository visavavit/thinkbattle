-- Server-side search for /browse.
--
-- NOT YET EXECUTED. Written and reviewed, never run: the session that authored
-- it had no database to run it against. Apply to a branch or staging project
-- first and take a backup.
--
-- The problem: fetchFeedRows() ends in .limit(60) and /browse then filters
-- those rows in the browser (matchesText in routes/browse.tsx). Past 60
-- published topics the rest silently stop existing — no error, no empty
-- state, just absence — and search cannot find what was never loaded.
--
-- Two constraints shaped this:
--
--   1. Thai does not tokenise. to_tsvector cannot segment Thai, which is
--      written without spaces between words, so full-text search treats a
--      whole phrase as one token and matches almost nothing. pg_trgm is
--      character-based and works acceptably on Thai, so that is what backs
--      the index here.
--
--   2. topic_cards is a view, and views cannot be indexed. Its `tags` column
--      is a correlated array_agg and category_name comes from a left join, so
--      searching those through the view could never use an index — yet the
--      client search covers tags and category today, and dropping them would
--      be a regression.
--
-- So: one denormalised search_text column on topics, maintained by triggers,
-- with a single GIN trigram index over it. That is the same trade migration
-- 20260818093000 made for comments_count / votes_a / votes_b / trending_score
-- — a sync trigger in exchange for removing per-row correlated work from
-- every read.

create extension if not exists pg_trgm;

alter table public.topics add column if not exists search_text text;

-- Everything the browser used to concatenate client-side, in one column:
-- title, blurb, both choices, the category name and every tag name.
create or replace function public.topic_search_text(_topic_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select concat_ws(' ',
    t.title,
    coalesce(t.description, ''),
    t.choice_a,
    t.choice_b,
    coalesce(c.name, ''),
    coalesce((
      select string_agg(tg.name, ' ' order by tg.name)
      from public.topic_tags tt
      join public.tags tg on tg.id = tt.tag_id
      where tt.topic_id = t.id
    ), '')
  )
  from public.topics t
  left join public.categories c on c.id = t.category_id
  where t.id = _topic_id;
$$;

create or replace function public.refresh_topic_search_text(_topic_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.topics
     set search_text = public.topic_search_text(_topic_id)
   where id = _topic_id;
$$;

-- The topic's own columns. BEFORE, so the value lands in the same write
-- rather than costing a second UPDATE (and a second trigger pass).
create or replace function public.sync_topic_search_text()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.search_text := concat_ws(' ',
    new.title,
    coalesce(new.description, ''),
    new.choice_a,
    new.choice_b,
    coalesce((select c.name from public.categories c where c.id = new.category_id), ''),
    coalesce((
      select string_agg(tg.name, ' ' order by tg.name)
      from public.topic_tags tt
      join public.tags tg on tg.id = tt.tag_id
      where tt.topic_id = new.id
    ), '')
  );
  return new;
end; $$;

drop trigger if exists topics_sync_search_text on public.topics;
create trigger topics_sync_search_text
before insert or update of title, description, choice_a, choice_b, category_id
on public.topics
for each row execute function public.sync_topic_search_text();

-- Tag attach/detach. AFTER, because the row has to exist before the
-- string_agg above can see it.
create or replace function public.sync_search_text_from_topic_tags()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.refresh_topic_search_text(coalesce(new.topic_id, old.topic_id));
  return null;
end; $$;

drop trigger if exists topic_tags_sync_search_text on public.topic_tags;
create trigger topic_tags_sync_search_text
after insert or delete on public.topic_tags
for each row execute function public.sync_search_text_from_topic_tags();

-- A rename in the taxonomy has to reach every topic carrying that name,
-- otherwise search quietly keeps matching the old one.
create or replace function public.sync_search_text_from_tag_rename()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.name is distinct from old.name then
    update public.topics t
       set search_text = public.topic_search_text(t.id)
     where exists (select 1 from public.topic_tags tt
                    where tt.topic_id = t.id and tt.tag_id = new.id);
  end if;
  return null;
end; $$;

drop trigger if exists tags_sync_search_text on public.tags;
create trigger tags_sync_search_text
after update of name on public.tags
for each row execute function public.sync_search_text_from_tag_rename();

create or replace function public.sync_search_text_from_category_rename()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.name is distinct from old.name then
    update public.topics t
       set search_text = public.topic_search_text(t.id)
     where t.category_id = new.id;
  end if;
  return null;
end; $$;

drop trigger if exists categories_sync_search_text on public.categories;
create trigger categories_sync_search_text
after update of name on public.categories
for each row execute function public.sync_search_text_from_category_rename();

-- Backfill every existing row once.
update public.topics set search_text = public.topic_search_text(id);

-- gin_trgm_ops is what makes ILIKE '%needle%' index-assisted. Partial on
-- published, because /browse only ever searches published topics and the
-- pending queue is small and admin-only.
create index if not exists topics_search_text_trgm
  on public.topics using gin (search_text gin_trgm_ops)
  where status = 'published';

-- Keyset pagination needs the sort column paired with id as a tiebreak, or a
-- page boundary landing inside a tie skips or repeats a row.
create index if not exists topics_published_recent_keyset
  on public.topics (published_at desc, id desc) where status = 'published';
create index if not exists topics_published_votes_keyset
  on public.topics (total_votes desc, id desc) where status = 'published';
create index if not exists topics_published_trending_keyset
  on public.topics (trending_score desc, id desc) where status = 'published';

-- Re-declare the feed view with search_text exposed, so the read path can
-- filter on it. security_invoker stays on: the view must keep inheriting the
-- caller's row-level policies rather than running as its owner.
create or replace view public.topic_cards
with (security_invoker = on) as
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
    t.is_featured,
    t.closes_at,
    t.search_text
   from topics t
     left join categories c on c.id = t.category_id;

grant select on public.topic_cards to anon, authenticated;

-- `from public, anon, authenticated`, not `from public` alone. Supabase's
-- default privileges grant EXECUTE on new functions in this schema to anon and
-- authenticated explicitly, and revoking the PUBLIC pseudo-role does not remove
-- an explicit role grant — so the shorter form would leave both of these
-- callable over PostgREST RPC. They are SECURITY DEFINER: topic_search_text
-- would return the text of an unpublished topic past its read policy, and
-- refresh_topic_search_text is an UPDATE on topics that anon holds no grant for.
--
-- The `revoke ... from public` + explicit `grant` form used elsewhere in this
-- repo is the deliberate-exposure case (topic_ranked_comments, site_flags).
-- These two are internal: the triggers below call them as the definer anyway.
revoke all on function public.topic_search_text(uuid) from public, anon, authenticated;
revoke all on function public.refresh_topic_search_text(uuid) from public, anon, authenticated;

-- Trigger functions cannot be reached over RPC, but the repo revokes them all
-- the same (see 20260817040655) and consistency here is worth more than the
-- two saved lines.
revoke all on function public.sync_topic_search_text() from public, anon, authenticated;
revoke all on function public.sync_search_text_from_topic_tags() from public, anon, authenticated;
revoke all on function public.sync_search_text_from_tag_rename() from public, anon, authenticated;
revoke all on function public.sync_search_text_from_category_rename() from public, anon, authenticated;
