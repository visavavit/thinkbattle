create extension if not exists pg_trgm;

alter table public.topics add column if not exists search_text text;

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

update public.topics set search_text = public.topic_search_text(id);

create index if not exists topics_search_text_trgm
  on public.topics using gin (search_text gin_trgm_ops)
  where status = 'published';

create index if not exists topics_published_recent_keyset
  on public.topics (published_at desc, id desc) where status = 'published';
create index if not exists topics_published_votes_keyset
  on public.topics (total_votes desc, id desc) where status = 'published';
create index if not exists topics_published_trending_keyset
  on public.topics (trending_score desc, id desc) where status = 'published';

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
    t.trending_score,
    t.cover_image_url,
    t.is_featured,
    t.closes_at,
    t.search_text
   from topics t
     left join categories c on c.id = t.category_id;

grant select on public.topic_cards to anon, authenticated;

revoke all on function public.topic_search_text(uuid) from public, anon, authenticated;
revoke all on function public.refresh_topic_search_text(uuid) from public, anon, authenticated;
revoke all on function public.sync_topic_search_text() from public, anon, authenticated;
revoke all on function public.sync_search_text_from_topic_tags() from public, anon, authenticated;
revoke all on function public.sync_search_text_from_tag_rename() from public, anon, authenticated;
revoke all on function public.sync_search_text_from_category_rename() from public, anon, authenticated;