-- 1. markers
alter table public.profiles add column if not exists is_synthetic boolean not null default false;
alter table public.votes add column if not exists is_synthetic boolean not null default false;
alter table public.comments add column if not exists is_synthetic boolean not null default false;

-- 2. persona pool
create table public.bot_personas (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id) on delete cascade,
  tone text not null default 'casual',
  verbosity smallint not null default 2,
  activity numeric not null default 1,
  created_at timestamptz not null default now()
);
grant select on public.bot_personas to authenticated;
grant all on public.bot_personas to service_role;
alter table public.bot_personas enable row level security;
create policy "admins read personas" on public.bot_personas for select to authenticated
  using (public.has_role(auth.uid(),'admin'));

-- 3. campaigns
create table public.bot_campaigns (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.topics(id) on delete cascade,
  total_votes integer not null check (total_votes between 1 and 5000),
  duration_minutes integer not null check (duration_minutes between 5 and 20160),
  target_pct_a integer not null check (target_pct_a between 0 and 100),
  jitter integer not null default 12 check (jitter between 0 and 40),
  comments_target integer not null default 0 check (comments_target between 0 and 300),
  reactions_target integer not null default 0 check (reactions_target between 0 and 3000),
  tone text not null default 'casual',
  status text not null default 'running' check (status in ('running','paused','stopped','done','error')),
  error_message text,
  delivered_votes integer not null default 0,
  delivered_comments integer not null default 0,
  delivered_reactions integer not null default 0,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index bot_campaigns_status_idx on public.bot_campaigns(status);
grant select on public.bot_campaigns to authenticated;
grant all on public.bot_campaigns to service_role;
alter table public.bot_campaigns enable row level security;
create policy "admins manage campaigns" on public.bot_campaigns for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- 4. planned actions (idempotent delivery ledger)
create table public.bot_actions (
  id bigserial primary key,
  campaign_id uuid not null references public.bot_campaigns(id) on delete cascade,
  persona_id uuid not null references public.bot_personas(id) on delete cascade,
  kind text not null check (kind in ('vote','comment','reaction')),
  choice char(1) check (choice in ('a','b')),
  payload jsonb not null default '{}'::jsonb,
  run_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','claimed','done','skipped','failed')),
  attempts smallint not null default 0,
  claimed_at timestamptz,
  done_at timestamptz,
  error text
);
create index bot_actions_due_idx on public.bot_actions(status, run_at);
create index bot_actions_campaign_idx on public.bot_actions(campaign_id, kind, status);
grant select on public.bot_actions to authenticated;
grant all on public.bot_actions to service_role;
grant usage, select on sequence public.bot_actions_id_seq to service_role;
alter table public.bot_actions enable row level security;
create policy "admins read actions" on public.bot_actions for select to authenticated
  using (public.has_role(auth.uid(),'admin'));

-- 5. single-flight lease for the worker
create table public.job_locks (
  name text primary key,
  locked_until timestamptz not null,
  updated_at timestamptz not null default now()
);
grant all on public.job_locks to service_role;
alter table public.job_locks enable row level security;

-- 6. seed a believable persona pool
with first_parts as (
  select unnest(array['mint','ploy','tofu','bank','pond','nine','gigi','max','oat','june',
                      'sunny','kiko','arun','lila','noon','pea','tam','rio','koko','benz',
                      'ice','nam','fern','joy','bas','mook','pim','tao','vee','ying']) as w
), second_parts as (
  select unnest(array['w','x','_dev','.hq','wut','byte','soda','89','92','07',
                      'tion','ish','oid','lah','man','one','zz','kid','said','room']) as w
)
insert into public.profiles (id, username, created_at, is_synthetic)
select gen_random_uuid(),
       f.w || s.w,
       now() - (random() * interval '400 days'),
       true
from first_parts f cross join second_parts s
order by random()
limit 400;

insert into public.bot_personas (profile_id, tone, verbosity, activity)
select p.id,
       (array['calm','casual','spicy'])[1 + floor(random()*3)::int],
       1 + floor(random()*3)::int,
       0.4 + random() * 1.6
from public.profiles p
where p.is_synthetic and not exists (select 1 from public.bot_personas b where b.profile_id = p.id);

-- 7. admin reporting
create or replace function public.admin_campaign_overview()
returns table (
  id uuid, topic_id uuid, topic_title text, status text, tone text,
  total_votes integer, delivered_votes integer,
  comments_target integer, delivered_comments integer,
  reactions_target integer, delivered_reactions integer,
  target_pct_a integer, jitter integer,
  starts_at timestamptz, ends_at timestamptz, error_message text,
  pending_actions bigint, next_run_at timestamptz,
  real_votes bigint, synthetic_votes bigint,
  real_comments bigint, synthetic_comments bigint,
  live_pct_a integer
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(),'admin') then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  return query
  select c.id, c.topic_id, t.title, c.status, c.tone,
    c.total_votes, c.delivered_votes,
    c.comments_target, c.delivered_comments,
    c.reactions_target, c.delivered_reactions,
    c.target_pct_a, c.jitter,
    c.starts_at, c.ends_at, c.error_message,
    (select count(*) from public.bot_actions a where a.campaign_id = c.id and a.status = 'pending'),
    (select min(a.run_at) from public.bot_actions a where a.campaign_id = c.id and a.status = 'pending'),
    (select count(*) from public.votes v where v.topic_id = c.topic_id and not v.is_synthetic),
    (select count(*) from public.votes v where v.topic_id = c.topic_id and v.is_synthetic),
    (select count(*) from public.comments m where m.topic_id = c.topic_id and not m.is_synthetic),
    (select count(*) from public.comments m where m.topic_id = c.topic_id and m.is_synthetic),
    case when (t.votes_a + t.votes_b) = 0 then 50
         else round(100.0 * t.votes_a / (t.votes_a + t.votes_b))::int end
  from public.bot_campaigns c
    join public.topics t on t.id = c.topic_id
  order by c.created_at desc;
end; $$;
revoke all on function public.admin_campaign_overview() from public, anon;
grant execute on function public.admin_campaign_overview() to authenticated;

-- 8. purge everything a campaign produced
create or replace function public.admin_purge_campaign(_campaign_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare _topic uuid;
begin
  if not public.has_role(auth.uid(),'admin') then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
  select topic_id into _topic from public.bot_campaigns where id = _campaign_id;
  if _topic is null then return; end if;

  delete from public.comment_reactions r
   where r.user_id in (
     select p.profile_id from public.bot_personas p
      join public.bot_actions a on a.persona_id = p.id
     where a.campaign_id = _campaign_id)
     and r.comment_id in (select id from public.comments where topic_id = _topic);

  delete from public.comments m
   where m.topic_id = _topic and m.is_synthetic
     and m.user_id in (
       select p.profile_id from public.bot_personas p
        join public.bot_actions a on a.persona_id = p.id
       where a.campaign_id = _campaign_id);

  delete from public.votes v
   where v.topic_id = _topic and v.is_synthetic
     and v.user_id in (
       select p.profile_id from public.bot_personas p
        join public.bot_actions a on a.persona_id = p.id
       where a.campaign_id = _campaign_id);

  delete from public.bot_campaigns where id = _campaign_id;
end; $$;
revoke all on function public.admin_purge_campaign(uuid) from public, anon;
grant execute on function public.admin_purge_campaign(uuid) to authenticated;