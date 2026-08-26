-- Minimal stand-ins for what a Supabase project provides, so the repo's own
-- migration history can be replayed against a plain Postgres.
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
do $$ begin create role supabase_admin nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticator noinherit login; exception when duplicate_object then null; end $$;
grant anon, authenticated, service_role to authenticator;

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- The test harness sets request.jwt.claim.sub to impersonate a caller.
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'authenticated');
$$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select '{}'::jsonb;
$$;
grant usage on schema auth to anon, authenticated, service_role;

-- pg_cron / pg_net are not installable here; the migrations only schedule jobs
-- with them, which is not what any of this is testing.
create schema if not exists cron;
create table if not exists cron.job (jobid bigserial primary key, jobname text, schedule text, command text);
create or replace function cron.schedule(jobname text, schedule text, command text)
returns bigint language sql as $$
  insert into cron.job (jobname, schedule, command) values ($1, $2, $3) returning jobid;
$$;
create or replace function cron.unschedule(jobname text) returns boolean language sql as $$
  delete from cron.job where job.jobname = $1; select true;
$$;
create schema if not exists net;
create or replace function net.http_post(url text, headers jsonb default '{}'::jsonb, body jsonb default '{}'::jsonb)
returns bigint language sql as $$ select 1::bigint; $$;
do $$ begin create role sandbox_exec nologin; exception when duplicate_object then null; end $$;
