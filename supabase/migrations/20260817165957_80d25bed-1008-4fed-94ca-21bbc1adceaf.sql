-- Comment flood + spam guard
create or replace function public.guard_comment_spam()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count integer;
  hour_count integer;
  last_at timestamptz;
  clean text;
begin
  if auth.uid() is null or public.has_role(auth.uid(), 'admin') then
    return new;
  end if;

  clean := btrim(new.body);
  if length(clean) < 2 then
    raise exception 'Your comment is too short.' using errcode = '22000';
  end if;
  if length(clean) > 2000 then
    raise exception 'Your comment is too long (2000 characters max).' using errcode = '22000';
  end if;
  -- single character spam e.g. "aaaaaaaaaa" or "!!!!!!!!!!"
  if length(clean) >= 8 and length(regexp_replace(lower(clean), '[^[:alnum:]]', '', 'g')) > 0
     and cardinality(array(select distinct unnest(regexp_split_to_array(lower(clean), '')))) <= 2 then
    raise exception 'That looks like spam. Try writing a real take.' using errcode = '22000';
  end if;
  -- shouting spam: long, all caps, no lowercase at all
  if length(clean) >= 25 and clean = upper(clean) and clean ~ '[A-Z]{15,}' then
    raise exception 'Please turn off caps lock before posting.' using errcode = '22000';
  end if;
  new.body := clean;

  select count(*), max(c.created_at)
    into recent_count, last_at
    from public.comments c
   where c.user_id = new.user_id
     and c.created_at > now() - interval '1 minute';

  if last_at is not null and last_at > now() - interval '10 seconds' then
    raise exception 'Slow down — wait a few seconds between comments.' using errcode = '22000';
  end if;
  if recent_count >= 5 then
    raise exception 'You are posting too fast. Try again in a minute.' using errcode = '22000';
  end if;

  select count(*) into hour_count
    from public.comments c
   where c.user_id = new.user_id
     and c.created_at > now() - interval '1 hour';
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
end;
$$;

drop trigger if exists comments_guard_spam on public.comments;
create trigger comments_guard_spam
  before insert on public.comments
  for each row execute function public.guard_comment_spam();

-- Topic suggestion flood guard
create or replace function public.guard_topic_spam()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.has_role(auth.uid(), 'admin') then
    return new;
  end if;
  new.title := btrim(new.title);
  if length(new.title) < 5 then
    raise exception 'Give your topic a real title.' using errcode = '22000';
  end if;
  if (select count(*) from public.topics t
       where t.submitted_by = new.submitted_by
         and t.created_at > now() - interval '1 hour') >= 5 then
    raise exception 'You have suggested too many topics this hour.' using errcode = '22000';
  end if;
  if exists (select 1 from public.topics t
              where t.submitted_by = new.submitted_by
                and lower(btrim(t.title)) = lower(new.title)
                and t.created_at > now() - interval '1 day') then
    raise exception 'You already suggested that topic.' using errcode = '22000';
  end if;
  return new;
end;
$$;

drop trigger if exists topics_guard_spam on public.topics;
create trigger topics_guard_spam
  before insert on public.topics
  for each row execute function public.guard_topic_spam();

-- Report flood guard
create or replace function public.guard_report_spam()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.has_role(auth.uid(), 'admin') then
    return new;
  end if;
  if exists (select 1 from public.comment_reports r
              where r.reporter_id = new.reporter_id
                and r.comment_id = new.comment_id) then
    raise exception 'You already reported this comment.' using errcode = '22000';
  end if;
  if (select count(*) from public.comment_reports r
       where r.reporter_id = new.reporter_id
         and r.created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Too many reports in a short time.' using errcode = '22000';
  end if;
  return new;
end;
$$;

drop trigger if exists reports_guard_spam on public.comment_reports;
create trigger reports_guard_spam
  before insert on public.comment_reports
  for each row execute function public.guard_report_spam();

-- Reaction bombing guard
create or replace function public.guard_reaction_spam()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.has_role(auth.uid(), 'admin') then
    return new;
  end if;
  if (select count(*) from public.comment_reactions cr
       where cr.user_id = new.user_id
         and cr.created_at > now() - interval '1 minute') >= 120 then
    raise exception 'Too many reactions too quickly.' using errcode = '22000';
  end if;
  return new;
end;
$$;

drop trigger if exists comment_reactions_guard_spam on public.comment_reactions;
create trigger comment_reactions_guard_spam
  before insert on public.comment_reactions
  for each row execute function public.guard_reaction_spam();

create index if not exists comments_user_created_idx on public.comments (user_id, created_at desc);
create index if not exists reports_reporter_created_idx on public.comment_reports (reporter_id, created_at desc);
create index if not exists reactions_user_created_idx on public.comment_reactions (user_id, created_at desc);