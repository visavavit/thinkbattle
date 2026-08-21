create table if not exists public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

grant all on public.app_settings to service_role;
alter table public.app_settings enable row level security;
-- intentionally no policies: only service_role / security-definer code may read it

create or replace function public.set_app_setting(_key text, _value text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.app_settings(key, value) values (_key, _value)
  on conflict (key) do update set value = excluded.value, updated_at = now();
end; $$;

revoke all on function public.set_app_setting(text, text) from public, anon, authenticated;
grant execute on function public.set_app_setting(text, text) to service_role, sandbox_exec;

select cron.unschedule('bot-audience-tick') where exists (select 1 from cron.job where jobname = 'bot-audience-tick');

select cron.schedule(
  'bot-audience-tick',
  '* * * * *',
  $job$
  select net.http_post(
    url := 'https://toktiang.com/api/public/bots/tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-bot-tick-secret', (select value from public.app_settings where key = 'bot_tick_secret')
    ),
    body := '{}'::jsonb
  )
  where exists (select 1 from public.app_settings where key = 'bot_tick_secret');
  $job$
);