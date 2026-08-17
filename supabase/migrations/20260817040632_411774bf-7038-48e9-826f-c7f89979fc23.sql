-- roles
create type public.app_role as enum ('admin','user');
create type public.topic_status as enum ('pending','published','rejected');

create table public.profiles (
  id uuid primary key,
  username text not null,
  avatar_url text,
  created_at timestamptz not null default now()
);
grant select on public.profiles to anon;
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "profiles readable by all" on public.profiles for select using (true);
create policy "own profile insert" on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "own profile update" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create policy "read own roles" on public.user_roles for select to authenticated using (auth.uid() = user_id);
create policy "admins read all roles" on public.user_roles for select to authenticated using (public.has_role(auth.uid(),'admin'));
create policy "admins manage roles" on public.user_roles for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  emoji text not null default '🔥',
  created_at timestamptz not null default now()
);
grant select on public.categories to anon;
grant select on public.categories to authenticated;
grant all on public.categories to service_role;
alter table public.categories enable row level security;
create policy "categories public read" on public.categories for select using (true);
create policy "admins manage categories" on public.categories for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);
grant select on public.tags to anon;
grant select on public.tags to authenticated;
grant all on public.tags to service_role;
alter table public.tags enable row level security;
create policy "tags public read" on public.tags for select using (true);
create policy "admins manage tags" on public.tags for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create table public.topics (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  choice_a text not null,
  choice_b text not null,
  category_id uuid references public.categories(id) on delete set null,
  status public.topic_status not null default 'pending',
  submitted_by uuid,
  votes_a integer not null default 0,
  votes_b integer not null default 0,
  published_at timestamptz,
  created_at timestamptz not null default now()
);
create index topics_status_idx on public.topics(status);
grant select on public.topics to anon;
grant select, insert on public.topics to authenticated;
grant all on public.topics to service_role;
alter table public.topics enable row level security;
create policy "published topics public read" on public.topics for select using (status = 'published');
create policy "own suggestions read" on public.topics for select to authenticated using (auth.uid() = submitted_by);
create policy "admins read all topics" on public.topics for select to authenticated using (public.has_role(auth.uid(),'admin'));
create policy "users suggest topics" on public.topics for insert to authenticated with check (auth.uid() = submitted_by and status = 'pending');
create policy "admins manage topics" on public.topics for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create table public.topic_tags (
  topic_id uuid not null references public.topics(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (topic_id, tag_id)
);
grant select on public.topic_tags to anon;
grant select, insert, delete on public.topic_tags to authenticated;
grant all on public.topic_tags to service_role;
alter table public.topic_tags enable row level security;
create policy "topic_tags public read" on public.topic_tags for select using (true);
create policy "admins manage topic_tags" on public.topic_tags for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
create policy "suggester tags own topic" on public.topic_tags for insert to authenticated with check (exists (select 1 from public.topics t where t.id = topic_id and t.submitted_by = auth.uid()));

create table public.votes (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.topics(id) on delete cascade,
  user_id uuid not null,
  choice char(1) not null check (choice in ('a','b')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (topic_id, user_id)
);
create index votes_topic_created_idx on public.votes(topic_id, created_at desc);
grant select, insert, update, delete on public.votes to authenticated;
grant all on public.votes to service_role;
alter table public.votes enable row level security;
create policy "read own votes" on public.votes for select to authenticated using (auth.uid() = user_id);
create policy "cast own vote" on public.votes for insert to authenticated with check (auth.uid() = user_id);
create policy "switch own vote" on public.votes for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own vote" on public.votes for delete to authenticated using (auth.uid() = user_id);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.topics(id) on delete cascade,
  user_id uuid not null,
  side char(1) not null check (side in ('a','b')),
  body text not null check (char_length(body) between 1 and 1000),
  likes_count integer not null default 0,
  dislikes_count integer not null default 0,
  controversy_score integer generated always as ((likes_count + dislikes_count) - abs(likes_count - dislikes_count)) stored,
  created_at timestamptz not null default now()
);
create index comments_topic_side_idx on public.comments(topic_id, side);
grant select on public.comments to anon;
grant select, insert, update, delete on public.comments to authenticated;
grant all on public.comments to service_role;
alter table public.comments enable row level security;
create policy "comments public read" on public.comments for select using (
  exists (select 1 from public.topics t where t.id = topic_id and t.status = 'published')
);
create policy "comment after voting" on public.comments for insert to authenticated with check (
  auth.uid() = user_id
  and exists (select 1 from public.votes v where v.topic_id = comments.topic_id and v.user_id = auth.uid() and v.choice = comments.side)
);
create policy "edit own comment" on public.comments for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own comment" on public.comments for delete to authenticated using (auth.uid() = user_id);
create policy "admins delete comments" on public.comments for delete to authenticated using (public.has_role(auth.uid(),'admin'));

create table public.comment_reactions (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id uuid not null,
  value smallint not null check (value in (1,-1)),
  created_at timestamptz not null default now(),
  unique (comment_id, user_id)
);
grant select, insert, update, delete on public.comment_reactions to authenticated;
grant all on public.comment_reactions to service_role;
alter table public.comment_reactions enable row level security;
create policy "read own reactions" on public.comment_reactions for select to authenticated using (auth.uid() = user_id);
create policy "insert own reaction" on public.comment_reactions for insert to authenticated with check (auth.uid() = user_id);
create policy "update own reaction" on public.comment_reactions for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own reaction" on public.comment_reactions for delete to authenticated using (auth.uid() = user_id);

-- triggers keeping tallies in sync
create or replace function public.sync_topic_votes() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.topics set votes_a = votes_a + (new.choice='a')::int, votes_b = votes_b + (new.choice='b')::int where id = new.topic_id;
  elsif tg_op = 'UPDATE' then
    if new.choice <> old.choice then
      update public.topics
        set votes_a = votes_a + (new.choice='a')::int - (old.choice='a')::int,
            votes_b = votes_b + (new.choice='b')::int - (old.choice='b')::int
      where id = new.topic_id;
      delete from public.comments c where c.topic_id = new.topic_id and c.user_id = new.user_id and c.side = old.choice;
    end if;
  elsif tg_op = 'DELETE' then
    update public.topics set votes_a = votes_a - (old.choice='a')::int, votes_b = votes_b - (old.choice='b')::int where id = old.topic_id;
  end if;
  return null;
end; $$;
create trigger votes_sync after insert or update or delete on public.votes for each row execute function public.sync_topic_votes();

create or replace function public.touch_vote() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;
create trigger votes_touch before update on public.votes for each row execute function public.touch_vote();

create or replace function public.sync_comment_reactions() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.comments set likes_count = likes_count + (new.value=1)::int, dislikes_count = dislikes_count + (new.value=-1)::int where id = new.comment_id;
  elsif tg_op = 'UPDATE' then
    update public.comments
      set likes_count = likes_count + (new.value=1)::int - (old.value=1)::int,
          dislikes_count = dislikes_count + (new.value=-1)::int - (old.value=-1)::int
    where id = new.comment_id;
  elsif tg_op = 'DELETE' then
    update public.comments set likes_count = likes_count - (old.value=1)::int, dislikes_count = dislikes_count - (old.value=-1)::int where id = old.comment_id;
  end if;
  return null;
end; $$;
create trigger comment_reactions_sync after insert or update or delete on public.comment_reactions for each row execute function public.sync_comment_reactions();

-- feed view
create view public.topic_cards with (security_invoker = on) as
select
  t.id, t.title, t.description, t.choice_a, t.choice_b, t.status, t.submitted_by,
  t.votes_a, t.votes_b, t.created_at, t.published_at,
  c.name as category_name, c.slug as category_slug, c.emoji as category_emoji, t.category_id,
  (t.votes_a + t.votes_b) as total_votes,
  case when (t.votes_a + t.votes_b) = 0 then 50
       else round(100.0 * t.votes_a / (t.votes_a + t.votes_b)) end as pct_a,
  coalesce((select array_agg(tg.name order by tg.name) from public.topic_tags tt join public.tags tg on tg.id = tt.tag_id where tt.topic_id = t.id), '{}') as tags,
  (select count(*) from public.comments cm where cm.topic_id = t.id) as comments_count,
  (select count(*) from public.comments cm where cm.topic_id = t.id and cm.controversy_score >= 6) as wild_takes_count,
  ((t.votes_a + t.votes_b + 1)::numeric / power(2 + extract(epoch from (now() - coalesce(t.published_at, t.created_at))) / 3600.0, 1.2)) as trending_score
from public.topics t
left join public.categories c on c.id = t.category_id;
grant select on public.topic_cards to anon, authenticated;

alter publication supabase_realtime add table public.topics;
alter publication supabase_realtime add table public.comments;
alter publication supabase_realtime add table public.votes;

-- seed data
insert into public.categories (name, slug, emoji) values
  ('Tech','tech','💻'),('Pop Culture','pop-culture','🎬'),('Food','food','🍕'),('Life','life','🌍'),('Sports','sports','🏟️');
insert into public.tags (name, slug) values
  ('hot','hot'),('controversial','controversial'),('daily','daily'),('nostalgia','nostalgia'),('unhinged','unhinged'),('classic','classic');

insert into public.profiles (id, username) values
  ('11111111-1111-4111-8111-111111111111','ChaosGremlin'),
  ('22222222-2222-4222-8222-222222222222','TabsSupremacy'),
  ('33333333-3333-4333-8333-333333333333','MidnightTakes'),
  ('44444444-4444-4444-8444-444444444444','PineappleDefender'),
  ('55555555-5555-4555-8555-555555555555','ColdBrewCleric');

with cat as (select slug, id from public.categories),
ins as (
  insert into public.topics (title, description, choice_a, choice_b, category_id, status, published_at)
  values
    ('Tabs or Spaces?','The war that never ends.','Tabs','Spaces',(select id from cat where slug='tech'),'published', now() - interval '3 hours'),
    ('Pineapple on pizza?','Sweet crime or sweet genius?','Absolutely','Never',(select id from cat where slug='food'),'published', now() - interval '9 hours'),
    ('Is a hot dog a sandwich?','Structural integrity debate.','Yes','No',(select id from cat where slug='food'),'published', now() - interval '26 hours'),
    ('Android or iPhone?','Pick your tribe.','Android','iPhone',(select id from cat where slug='tech'),'published', now() - interval '2 hours'),
    ('Cats or Dogs?','Eternal.','Cats','Dogs',(select id from cat where slug='life'),'published', now() - interval '50 hours'),
    ('Movies at home or in theaters?','Popcorn economics.','At home','Theaters',(select id from cat where slug='pop-culture'),'published', now() - interval '14 hours'),
    ('Should AI write your emails?','Delegate or drown.','Let it cook','Write them yourself',(select id from cat where slug='tech'),'published', now() - interval '5 hours'),
    ('Morning workout or night workout?','When do you suffer?','Morning','Night',(select id from cat where slug='sports'),'published', now() - interval '31 hours')
  returning id, title
)
insert into public.topic_tags (topic_id, tag_id)
select i.id, tg.id from ins i join public.tags tg on tg.slug in ('hot','controversial');

-- seed votes (fake voter uuids)
insert into public.votes (topic_id, user_id, choice)
select t.id, ('00000000-0000-4000-8000-' || lpad((row_number() over (partition by t.id order by g))::text || substr(md5(t.id::text),1,6), 12, '0'))::uuid,
       case when random() < (case t.title when 'Tabs or Spaces?' then 0.52 when 'Pineapple on pizza?' then 0.48 when 'Cats or Dogs?' then 0.5 when 'Android or iPhone?' then 0.3 else 0.65 end) then 'a' else 'b' end
from public.topics t cross join generate_series(1, 120) g
where t.status = 'published';

insert into public.comments (topic_id, user_id, side, body, created_at)
select t.id, p.id, s.side, s.body, now() - (random() * interval '20 hours')
from public.topics t
cross join lateral (
  values
    ('a','This is objectively correct and I will not be elaborating.'),
    ('a','Been on this side for a decade. Zero regrets, infinite peace.'),
    ('a','Everyone on the other side needs to touch grass immediately.'),
    ('b','Absolutely unhinged take from the other column. Genuinely stunned.'),
    ('b','The other side is coping so hard right now it is almost art.'),
    ('b','I switched last year and my life materially improved. Facts only.')
) as s(side, body)
join public.profiles p on true
where t.status = 'published' and p.id = (
  case s.body when 'This is objectively correct and I will not be elaborating.' then '11111111-1111-4111-8111-111111111111'::uuid
              when 'Been on this side for a decade. Zero regrets, infinite peace.' then '22222222-2222-4222-8222-222222222222'::uuid
              when 'Everyone on the other side needs to touch grass immediately.' then '33333333-3333-4333-8333-333333333333'::uuid
              when 'Absolutely unhinged take from the other column. Genuinely stunned.' then '44444444-4444-4444-8444-444444444444'::uuid
              when 'The other side is coping so hard right now it is almost art.' then '55555555-5555-4555-8555-555555555555'::uuid
              else '11111111-1111-4111-8111-111111111111'::uuid end);

update public.comments c
set likes_count = v.l, dislikes_count = v.d
from (select id, (10 + floor(random()*60))::int as l, (2 + floor(random()*55))::int as d from public.comments) v
where v.id = c.id;
