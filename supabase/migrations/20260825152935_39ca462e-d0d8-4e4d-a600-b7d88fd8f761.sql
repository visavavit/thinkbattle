-- Long takes, author edits, and a public edit trail.
--
-- Three things move here:
--   1. The body cap goes from 1000 to 4000 characters. The client already
--      claimed 2000 in its error copy while the column check said 1000 and the
--      textarea said 1000 — every layer now says 4000.
--   2. Authors can revise a take while the debate is still open.
--   3. Every revision keeps the text it replaced in public.comment_edits, which
--      nobody holds INSERT/UPDATE/DELETE on. The trail is written only by the
--      definer trigger below, so an author cannot quietly rewrite history after
--      a take has been liked or replied to.

-- ---------------------------------------------------------------------------
-- 1. Longer bodies
-- ---------------------------------------------------------------------------
alter table public.comments drop constraint if exists comments_body_check;
alter table public.comments
  add constraint comments_body_check check (char_length(body) between 1 and 4000);

-- Same ceiling on the insert path, which reports it in words rather than as a
-- constraint violation. Unchanged from the previous definition apart from the
-- limit and its message.
create or replace function public.guard_comment_spam()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  minute_count integer;
  hour_count integer;
  last_at timestamptz;
  clean text;
begin
  if auth.uid() is null then
    return new;
  end if;

  clean := btrim(new.body);
  if length(clean) < 2 then
    raise exception 'Your comment is too short.' using errcode = '22000';
  end if;
  if length(clean) > 4000 then
    raise exception 'Your comment is too long (4000 characters max).' using errcode = '22000';
  end if;
  if length(clean) >= 8 and length(regexp_replace(lower(clean), '[^[:alnum:]]', '', 'g')) > 0
     and cardinality(array(select distinct unnest(regexp_split_to_array(lower(clean), '')))) <= 2 then
    raise exception 'That looks like spam. Try writing a real take.' using errcode = '22000';
  end if;
  if length(clean) >= 25 and clean = upper(clean) and clean ~ '[A-Z]{15,}' then
    raise exception 'Please turn off caps lock before posting.' using errcode = '22000';
  end if;
  new.body := clean;

  select count(*), max(e.created_at) into minute_count, last_at
    from public.rate_events e
   where e.user_id = new.user_id and e.kind = 'comment'
     and e.created_at > now() - interval '1 minute';

  if last_at is not null and last_at > now() - interval '10 seconds' then
    raise exception 'Slow down — wait a few seconds between comments.' using errcode = '22000';
  end if;
  if minute_count >= 5 then
    raise exception 'You are posting too fast. Try again in a minute.' using errcode = '22000';
  end if;

  select count(*) into hour_count
    from public.rate_events e
   where e.user_id = new.user_id and e.kind = 'comment'
     and e.created_at > now() - interval '1 hour';
  if hour_count >= 40 then
    raise exception 'Hourly comment limit reached. Take a breather.' using errcode = '22000';
  end if;

  if exists (
    select 1 from public.comments c
     where c.user_id = new.user_id
       and c.topic_id = new.topic_id
       and lower(btrim(c.body)) = lower(new.body)
       and c.created_at > now() - interval '1 hour'
  ) then
    raise exception 'You already posted that here.' using errcode = '22000';
  end if;

  return new;
end; $$;
revoke all on function public.guard_comment_spam() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Edit bookkeeping on the take itself
-- ---------------------------------------------------------------------------
-- edited_at drives the "edited" marker; edit_count saves the reader a query
-- just to learn whether opening the history is worth it.
alter table public.comments
  add column if not exists edited_at timestamptz,
  add column if not exists edit_count integer not null default 0;

-- ---------------------------------------------------------------------------
-- 3. The trail
-- ---------------------------------------------------------------------------
-- One row per revision, holding the text that was replaced. Any past version is
-- then the previous_body of the next revision, with the live body as the tail.
create table if not exists public.comment_edits (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments(id) on delete cascade,
  editor_id uuid not null,
  previous_body text not null,
  replaced_at timestamptz not null default now()
);
create index if not exists comment_edits_comment_idx
  on public.comment_edits (comment_id, replaced_at desc);

-- SELECT only, deliberately: the trail is written by the definer trigger below
-- and by nothing else. Without INSERT/UPDATE/DELETE grants there is no policy
-- an author could satisfy to rewrite or drop their own history.
grant select on public.comment_edits to anon, authenticated;
grant all on public.comment_edits to service_role;
alter table public.comment_edits enable row level security;

-- Visible to exactly whoever can read the comment it belongs to: the same
-- published-topic and not-hidden gate that "comments public read" applies.
create policy "comment edits public read" on public.comment_edits for select using (
  exists (
    select 1
      from public.comments c
      join public.topics t on t.id = c.topic_id
     where c.id = comment_edits.comment_id
       and not c.is_hidden
       and t.status = 'published'
  )
);
create policy "authors read own comment edits" on public.comment_edits
  for select to authenticated using (auth.uid() = editor_id);
create policy "admins read all comment edits" on public.comment_edits
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------------
-- 4. The edit guard, which is also the only writer of the trail
-- ---------------------------------------------------------------------------
-- Fires before comments_guard_moderation (trigger order is by name, and
-- 'edit' < 'moderation'), so an identity rewrite is refused before the
-- moderation columns are ever checked.
create or replace function public.guard_comment_edit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  is_admin boolean;
  clean text;
begin
  -- No JWT subject means the service role or a backend job — the bot worker and
  -- the counter backfills both land here and are not authors revising a take.
  if auth.uid() is null then
    return new;
  end if;
  is_admin := public.has_role(auth.uid(), 'admin');

  if not is_admin then
    -- A take is anchored to its author, its topic, its side and its place in
    -- the thread. Letting an edit move any of those would turn "edit" into a
    -- way to launder likes earned on a different argument.
    if new.user_id is distinct from old.user_id
      or new.topic_id is distinct from old.topic_id
      or new.parent_id is distinct from old.parent_id
      or new.side is distinct from old.side
      or new.created_at is distinct from old.created_at then
      raise exception 'Only the text of a comment can be edited.' using errcode = '22000';
    end if;
  end if;

  -- The reaction counters are moved by sync_comment_reactions, a definer
  -- trigger that still runs under the reacting reader's JWT — so an update that
  -- leaves the text alone reaches this point routinely and must pass. What it
  -- must not do is forge the edit marker.
  if new.body is not distinct from old.body then
    if not is_admin then
      new.edited_at := old.edited_at;
      new.edit_count := old.edit_count;
    end if;
    return new;
  end if;

  if not is_admin then
    if auth.uid() is distinct from old.user_id then
      raise exception 'Only the author can edit a comment.' using errcode = '22000';
    end if;
    if old.is_hidden then
      raise exception 'A hidden comment cannot be edited.' using errcode = '22000';
    end if;
    -- Same rule the archive already applies to new takes: once the deadline
    -- passes, what is on screen is the final word.
    if public.topic_is_closed(old.topic_id) then
      raise exception 'This debate has closed. Voting and comments are final.'
        using errcode = '22000';
    end if;

    clean := btrim(new.body);
    if length(clean) < 2 then
      raise exception 'Your comment is too short.' using errcode = '22000';
    end if;
    if length(clean) > 4000 then
      raise exception 'Your comment is too long (4000 characters max).' using errcode = '22000';
    end if;
    if length(clean) >= 25 and clean = upper(clean) and clean ~ '[A-Z]{15,}' then
      raise exception 'Please turn off caps lock before posting.' using errcode = '22000';
    end if;

    -- Trimming stray whitespace is not a revision. Keeping the tidied text
    -- without opening a history entry stops a trailing newline from stamping a
    -- take as edited.
    if clean = btrim(old.body) then
      new.body := clean;
      new.edited_at := old.edited_at;
      new.edit_count := old.edit_count;
      return new;
    end if;

    if (select count(*) from public.comment_edits e
         where e.comment_id = old.id
           and e.replaced_at > now() - interval '1 hour') >= 10 then
      raise exception 'You have edited this comment too many times. Try again later.'
        using errcode = '22000';
    end if;

    new.body := clean;
  end if;

  new.edited_at := now();
  new.edit_count := coalesce(old.edit_count, 0) + 1;

  insert into public.comment_edits (comment_id, editor_id, previous_body)
  values (old.id, auth.uid(), old.body);

  return new;
end; $$;
revoke all on function public.guard_comment_edit() from public, anon, authenticated;

drop trigger if exists comments_guard_edit on public.comments;
create trigger comments_guard_edit
  before update on public.comments
  for each row execute function public.guard_comment_edit();

-- ---------------------------------------------------------------------------
-- 5. Carry the edit marker through the ranked read
-- ---------------------------------------------------------------------------
-- The pinned takes come back from this function rather than from the paged
-- select, so without these two columns a pinned take would always render as
-- never edited. The return type changes, so the function has to be dropped.
drop function if exists public.topic_ranked_comments(uuid, integer);
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
  edited_at timestamptz,
  edit_count integer,
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
    p.hidden_reason, p.created_at, p.edited_at, p.edit_count, p.parent_id, p.is_synthetic
  from pins p
  union all
  select
    r.id, r.topic_id, r.user_id, r.side::text, r.body, r.likes_count,
    r.dislikes_count, r.controversy_score, r.net_score, r.is_hidden,
    r.hidden_reason, r.created_at, r.edited_at, r.edit_count, r.parent_id, r.is_synthetic
  from public.comments r
  where r.topic_id = _topic_id
    and r.parent_id in (select id from pins);
$$;

revoke all on function public.topic_ranked_comments(uuid, integer) from public;
grant execute on function public.topic_ranked_comments(uuid, integer) to anon, authenticated, service_role;