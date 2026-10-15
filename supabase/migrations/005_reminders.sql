-- R3: phone reminders (Web Push) for the day checklist.
-- Adds: where each phone receives reminders, which reminders were already sent, private keys
-- used only by the server, and a 5-minute timer that runs the "reminders" edge function.
-- Nothing existing is changed. Safe to run twice.
--
-- AFTER running this file, run ONE more statement with your own project's address, e.g.:
--   insert into public.app_secrets(name, value)
--   values ('functions_url', 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/reminders')
--   on conflict (name) do update set value = excluded.value;

-- 1. Phones that turned reminders on (one row per phone/browser)
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  last_sent_at timestamptz
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_select_own on public.push_subscriptions;
create policy push_subscriptions_select_own on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());
drop policy if exists push_subscriptions_delete_own on public.push_subscriptions;
create policy push_subscriptions_delete_own on public.push_subscriptions
  for delete to authenticated using (user_id = auth.uid());
-- No insert/update policy: phones are saved only through save_push_subscription below.

-- Save this phone for the signed-in person. A phone moves to whoever signed in on it last,
-- so a shared or re-used phone never receives someone else's reminders.
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if p_endpoint is null or p_endpoint !~ '^https://' or length(p_endpoint) > 2000
     or coalesce(length(p_p256dh), 0) not between 20 and 200
     or coalesce(length(p_auth), 0) not between 8 and 100 then
    raise exception 'Invalid subscription';
  end if;
  delete from public.push_subscriptions where endpoint = p_endpoint;
  insert into public.push_subscriptions(user_id, endpoint, p256dh, auth)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth);
end;
$$;
revoke all on function public.save_push_subscription(text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;

-- 2. Reminders already sent (so each one is sent once). Server only.
create table if not exists public.reminder_log (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.reminder_log enable row level security;
revoke all on public.reminder_log from anon, authenticated;

-- 3. Server-only keys (never readable by the app: RLS on, no policies, no grants)
create table if not exists public.app_secrets (
  name text primary key,
  value text not null
);
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;

insert into public.app_secrets(name, value)
values ('cron_key', encode(extensions.gen_random_bytes(32), 'hex')),
       ('action_key', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (name) do nothing;

-- 4. Every 5 minutes, ask the "reminders" function to send what is due
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.run_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  fn_url text := (select value from public.app_secrets where name = 'functions_url');
  key text := (select value from public.app_secrets where name = 'cron_key');
begin
  if fn_url is null or key is null then
    return;
  end if;
  perform net.http_post(
    url := fn_url || '?op=send',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', key),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end;
$$;
revoke all on function public.run_reminders() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'swayam-reminders';
select cron.schedule('swayam-reminders', '*/5 * * * *', 'select public.run_reminders()');
