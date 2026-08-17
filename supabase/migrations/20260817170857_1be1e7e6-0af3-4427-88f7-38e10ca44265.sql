create table if not exists public.rate_events (
  id bigserial primary key,
  user_id uuid not null,
  kind text not null,
  created_at timestamptz not null default now()
);
grant select on public.rate_events to authenticated;
grant all on public.rate_events to service_role;
alter table public.rate_events enable row level security;
create policy "read own rate events" on public.rate_events for select to authenticated using (auth.uid() = user_id);
create index if not exists rate_events_user_kind_time on public.rate_events (user_id, kind, created_at desc);

create or replace function public.log_rate_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.rate_events(user_id, kind) values (new.user_id, tg_argv[0]);
  return null;
end; $$;

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
  if length(clean) > 2000 then
    raise exception 'Your comment is too long (2000 characters max).' using errcode = '22000';
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

drop trigger if exists comments_log_rate on public.comments;
create trigger comments_log_rate after insert on public.comments
for each row execute function public.log_rate_event('comment');

create or replace function public.guard_topic_spam()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  new.title := btrim(new.title);
  if length(new.title) < 5 then
    raise exception 'Give your topic a real title.' using errcode = '22000';
  end if;
  if (select count(*) from public.rate_events e
       where e.user_id = new.submitted_by and e.kind = 'topic'
         and e.created_at > now() - interval '1 hour') >= 5 then
    raise exception 'You have suggested too many topics this hour.' using errcode = '22000';
  end if;
  if exists (select 1 from public.topics t
              where t.submitted_by = new.submitted_by
                and lower(btrim(t.title)) = lower(new.title)
                and t.created_at > now() - interval '1 day') then
    raise exception 'You already suggested that topic.' using errcode = '22000';
  end if;
  return new;
end; $$;

create or replace function public.log_topic_rate_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.submitted_by is not null then
    insert into public.rate_events(user_id, kind) values (new.submitted_by, 'topic');
  end if;
  return null;
end; $$;

drop trigger if exists topics_log_rate on public.topics;
create trigger topics_log_rate after insert on public.topics
for each row execute function public.log_topic_rate_event();

create or replace function public.guard_report_spam()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if exists (select 1 from public.comment_reports r
              where r.reporter_id = new.reporter_id and r.comment_id = new.comment_id) then
    raise exception 'You already reported this comment.' using errcode = '22000';
  end if;
  if (select count(*) from public.rate_events e
       where e.user_id = new.reporter_id and e.kind = 'report'
         and e.created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Too many reports in a short time.' using errcode = '22000';
  end if;
  return new;
end; $$;

create or replace function public.log_report_rate_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.rate_events(user_id, kind) values (new.reporter_id, 'report');
  return null;
end; $$;

drop trigger if exists reports_log_rate on public.comment_reports;
create trigger reports_log_rate after insert on public.comment_reports
for each row execute function public.log_report_rate_event();

create or replace function public.guard_reaction_spam()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if (select count(*) from public.rate_events e
       where e.user_id = new.user_id and e.kind = 'reaction'
         and e.created_at > now() - interval '1 minute') >= 120 then
    raise exception 'Too many reactions too quickly.' using errcode = '22000';
  end if;
  return new;
end; $$;

drop trigger if exists comment_reactions_log_rate on public.comment_reactions;
create trigger comment_reactions_log_rate after insert on public.comment_reactions
for each row execute function public.log_rate_event('reaction');