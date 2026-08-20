-- ---------------------------------------------------------------------------
-- Topic expiry
--
-- A debate can carry a closing date. Once it passes the result stays fully
-- readable — the split, the tallies, every take on both sides — but voting,
-- commenting, replying and reacting are over. closes_at NULL means the debate
-- runs indefinitely, which is what every existing topic keeps.
--
-- Enforcement is a trigger rather than an RLS policy for two reasons. It holds
-- on every write path, including the bot worker's service-role client, which
-- RLS does not touch — a synthetic vote landing after the deadline would move
-- a result that is supposed to be final. And it fails with a message that says
-- the debate is closed, instead of a generic row-level-security error that the
-- UI can only report as a permission problem.
-- ---------------------------------------------------------------------------

alter table public.topics
  add column if not exists closes_at timestamptz;

comment on column public.topics.closes_at is
  'When voting and discussion close. NULL means the topic never expires.';

-- Backs the admin table's "closing soon" ordering and any future sweep over
-- topics that have just expired. Partial: only published topics with a
-- deadline are ever looked up this way.
create index if not exists topics_closes_at_idx
  on public.topics (closes_at)
  where status = 'published' and closes_at is not null;

-- ---------------------------------------------------------------------------
-- Is this topic past its deadline?
-- ---------------------------------------------------------------------------

create or replace function public.topic_is_closed(_topic_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select t.closes_at is not null and t.closes_at <= now()
       from public.topics t
      where t.id = _topic_id),
    false
  );
$$;
grant execute on function public.topic_is_closed(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Guards
--
-- Two functions rather than one because the row reaching the trigger carries
-- the topic differently: votes and comments hold topic_id, a reaction only
-- knows which comment it is on.
-- ---------------------------------------------------------------------------

create or replace function public.guard_topic_closed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
begin
  target := case when tg_op = 'DELETE' then old.topic_id else new.topic_id end;

  if target is not null and public.topic_is_closed(target) then
    raise exception 'This debate has closed. Voting and comments are final.'
      using errcode = '22000';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.guard_reaction_topic_closed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
begin
  select c.topic_id into target
    from public.comments c
   where c.id = case when tg_op = 'DELETE' then old.comment_id else new.comment_id end;

  if target is not null and public.topic_is_closed(target) then
    raise exception 'This debate has closed. Voting and comments are final.'
      using errcode = '22000';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- Votes: casting, switching and withdrawing all move the final result, so all
-- three are shut once the deadline passes.
drop trigger if exists votes_guard_closed on public.votes;
create trigger votes_guard_closed
  before insert or update or delete on public.votes
  for each row execute function public.guard_topic_closed();

-- Comments: only new takes and replies are blocked. Moderation still has to
-- work on a closed debate, and hiding or deleting a comment is an UPDATE or a
-- DELETE — those stay open.
drop trigger if exists comments_guard_closed on public.comments;
create trigger comments_guard_closed
  before insert on public.comments
  for each row execute function public.guard_topic_closed();

-- Reactions rank the takes, and the Wild Takes order is part of the archived
-- result, so they freeze with everything else.
drop trigger if exists comment_reactions_guard_closed on public.comment_reactions;
create trigger comment_reactions_guard_closed
  before insert or update or delete on public.comment_reactions
  for each row execute function public.guard_reaction_topic_closed();

-- ---------------------------------------------------------------------------
-- Feed read path
--
-- closes_at is appended to topic_cards so a card can show its countdown, and
-- so the topic page knows it is closed without a second query. The client
-- compares it against its own clock rather than reading a stored is_closed
-- flag: these reads are cached for up to five minutes, and a topic must flip
-- to closed the moment the deadline passes, not when the cache turns over.
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
    t.closes_at
   from topics t
     left join categories c on c.id = t.category_id;

alter view public.topic_cards set (security_invoker = on);
grant select on public.topic_cards to anon, authenticated;

-- ---------------------------------------------------------------------------
-- A closed debate fades out of trending
--
-- A topic no one can vote on any more should not sit at the top of the feed
-- inviting votes the guard then rejects. But dropping it to zero the instant
-- it closes is too blunt, and the curve says why: the decay is anchored on
-- published_at, so a week-long debate has already fallen down the tab by the
-- time its deadline arrives — zeroing it changes almost nothing. The topic it
-- does affect is the short one. A 24-hour debate is still scoring near its
-- peak when it closes, and that is exactly the moment its outcome is most
-- worth reading.
--
-- So closed topics are damped rather than erased: a quarter score puts them
-- below the live debates while leaving the just-concluded ones on the page,
-- and the ordinary age decay retires them within about a day. They stay
-- reachable everywhere else regardless — Newest, Top Voted, Browse and their
-- own pages are unchanged.
-- ---------------------------------------------------------------------------

-- Weight applied to a topic past its deadline. Not a hard zero; see above.
create or replace function public.closed_trending_weight(_closes_at timestamptz)
returns numeric
language sql
-- stable, not immutable: it reads now(), and an immutable label would let the
-- planner fold the weight to a constant computed once
stable
as $$
  select case when _closes_at is not null and _closes_at <= now() then 0.25 else 1 end::numeric;
$$;

create or replace function public.refresh_trending_scores() returns void
language sql security definer set search_path = public as $$
  update public.topics t
     set trending_score = (t.votes_a + t.votes_b + 1)::numeric
         / power(
             2::numeric
             + extract(epoch from (now() - coalesce(t.published_at, t.created_at))) / 3600.0,
             1.2
           )
         * public.closed_trending_weight(t.closes_at)
   where t.status = 'published';
$$;
revoke all on function public.refresh_trending_scores() from public, anon, authenticated;

create or replace function public.seed_trending_score() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.status = 'published'
     and (tg_op = 'INSERT' or old.status is distinct from new.status
          or old.published_at is distinct from new.published_at
          or old.closes_at is distinct from new.closes_at) then
    new.trending_score := (new.votes_a + new.votes_b + 1)::numeric
      / power(
          2::numeric
          + extract(epoch from (now() - coalesce(new.published_at, new.created_at))) / 3600.0,
          1.2
        )
      * public.closed_trending_weight(new.closes_at);
  end if;
  return new;
end; $$;

select public.refresh_trending_scores();
