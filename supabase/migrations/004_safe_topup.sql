-- FieldOS migration 004: SAFE TOP-UP. Adds ONLY what is missing. Deletes/changes nothing that exists.
-- Safe to run more than once.

create or replace function public.fieldos_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  customer_type text, phone text, address text,
  latitude numeric(9,6), longitude numeric(9,6),
  potential_amount numeric(14,2) not null default 0 check (potential_amount >= 0),
  priority integer not null default 3 check (priority between 1 and 5),
  usual_availability text, notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- in case a customers table already existed with fewer columns
alter table public.customers
  add column if not exists customer_type text, add column if not exists phone text,
  add column if not exists address text, add column if not exists latitude numeric(9,6),
  add column if not exists longitude numeric(9,6),
  add column if not exists potential_amount numeric(14,2) not null default 0,
  add column if not exists priority integer not null default 3,
  add column if not exists usual_availability text, add column if not exists notes text,
  add column if not exists active boolean not null default true;

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  sale_date date not null default current_date,
  amount numeric(14,2) not null check (amount >= 0),
  status text not null default 'confirmed' check (status in ('confirmed','pending','cancelled')),
  product_category text, notes text,
  created_at timestamptz not null default now()
);
alter table public.sales
  add column if not exists status text not null default 'confirmed',
  add column if not exists product_category text, add column if not exists notes text;

create table if not exists public.visits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  planned_start timestamptz, planned_end timestamptz, actual_start timestamptz, actual_end timestamptz,
  status text not null default 'planned' check (status in ('planned','visited','unavailable','cancelled','rescheduled')),
  sale_amount numeric(14,2) not null default 0 check (sale_amount >= 0),
  lead_amount numeric(14,2) not null default 0 check (lead_amount >= 0),
  collection_amount numeric(14,2) not null default 0 check (collection_amount >= 0),
  result text, notes text, next_action text, follow_up_date date,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.daily_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_date date not null, planned_home_time time,
  energy_level integer check (energy_level between 1 and 10),
  target_for_day numeric(14,2) not null default 0, expected_sales numeric(14,2) not null default 0,
  expected_finish_time time,
  status text not null default 'draft' check (status in ('draft','active','completed','abandoned')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (user_id, plan_date)
);

create table if not exists public.daily_plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.daily_plans(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  sequence integer not null check (sequence >= 1),
  planned_start timestamptz, estimated_duration_minutes integer check (estimated_duration_minutes > 0),
  reason text,
  status text not null default 'planned' check (status in ('planned','done','skipped','moved','call_instead')),
  unique (plan_id, sequence)
);

create table if not exists public.health_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  checkin_date date not null default current_date,
  energy integer check (energy between 1 and 10), stress integer check (stress between 1 and 10),
  sleep_hours numeric(3,1), steps integer, travel_hours numeric(4,1), home_time time, notes text,
  created_at timestamptz not null default now(), unique (user_id, checkin_date)
);

create table if not exists public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  due_date date not null, action text not null,
  expected_value numeric(14,2) not null default 0,
  status text not null default 'open' check (status in ('open','done','dropped')),
  notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.coach_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question text not null, answer text, context_json jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  feedback_date date not null default current_date,
  helped boolean, planning_minutes integer, sales_amount numeric(14,2), visits_completed integer,
  travel_hours numeric(4,1), planned_home_time time, actual_home_time time,
  energy integer, stress integer, friction text, comment text,
  created_at timestamptz not null default now(), unique (user_id, feedback_date)
);

-- Indexes
create index if not exists customers_user_idx on public.customers (user_id, active);
create index if not exists sales_user_date_idx on public.sales (user_id, sale_date);
create index if not exists visits_user_idx on public.visits (user_id, planned_start);
create index if not exists follow_ups_user_due_idx on public.follow_ups (user_id, status, due_date);

-- Privacy rules (RLS) on the FieldOS tables
alter table public.customers enable row level security;
alter table public.sales enable row level security;
alter table public.visits enable row level security;
alter table public.daily_plans enable row level security;
alter table public.daily_plan_items enable row level security;
alter table public.health_checkins enable row level security;
alter table public.follow_ups enable row level security;
alter table public.coach_events enable row level security;
alter table public.feedback enable row level security;

revoke all on public.customers, public.sales, public.visits, public.daily_plans, public.daily_plan_items,
  public.health_checkins, public.follow_ups, public.coach_events, public.feedback from anon;
grant select, insert, update, delete on public.customers, public.sales, public.visits, public.daily_plans,
  public.daily_plan_items, public.health_checkins, public.follow_ups, public.coach_events, public.feedback to authenticated;
grant select, update on public.profiles to authenticated;

-- Helper that creates a policy ONLY if one with that name does not already exist
create or replace function pg_temp.mkpol(t text, cmd text, using_e text, check_e text) returns void
language plpgsql as $$
declare pname text := t || '_' || lower(cmd);
begin
  if exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname=pname) then return; end if;
  execute format('create policy %I on public.%I for %s to authenticated %s %s', pname, t, lower(cmd),
    case when using_e is null then '' else 'using (' || using_e || ')' end,
    case when check_e is null then '' else 'with check (' || check_e || ')' end);
end $$;

do $$
declare
  own text := 'user_id = (select auth.uid())';
  cust text := 'exists (select 1 from public.customers c where c.id = customer_id and c.user_id = (select auth.uid()))';
  plan text := 'exists (select 1 from public.daily_plans p where p.id = plan_id and p.user_id = (select auth.uid()))';
  t text;
begin
  foreach t in array array['customers','health_checkins','coach_events','feedback','daily_plans'] loop
    perform pg_temp.mkpol(t,'SELECT',own,null);
    perform pg_temp.mkpol(t,'INSERT',null,own);
    perform pg_temp.mkpol(t,'UPDATE',own,own);
    perform pg_temp.mkpol(t,'DELETE',own,null);
  end loop;
  foreach t in array array['visits','follow_ups'] loop
    perform pg_temp.mkpol(t,'SELECT',own,null);
    perform pg_temp.mkpol(t,'INSERT',null,own||' and '||cust);
    perform pg_temp.mkpol(t,'UPDATE',own,own||' and '||cust);
    perform pg_temp.mkpol(t,'DELETE',own,null);
  end loop;
  perform pg_temp.mkpol('sales','SELECT',own,null);
  perform pg_temp.mkpol('sales','INSERT',null,own||' and (customer_id is null or '||cust||')');
  perform pg_temp.mkpol('sales','UPDATE',own,own||' and (customer_id is null or '||cust||')');
  perform pg_temp.mkpol('sales','DELETE',own,null);
  perform pg_temp.mkpol('daily_plan_items','SELECT',plan,null);
  perform pg_temp.mkpol('daily_plan_items','INSERT',null,plan||' and '||cust);
  perform pg_temp.mkpol('daily_plan_items','UPDATE',plan,plan||' and '||cust);
  perform pg_temp.mkpol('daily_plan_items','DELETE',plan,null);
end $$;

-- Create an empty profile for new sign-ups (harmless if one already exists)
create or replace function public.fieldos_handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email) on conflict (id) do nothing;
  return new;
end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'fieldos_on_auth_user_created') then
    create trigger fieldos_on_auth_user_created after insert on auth.users
      for each row execute function public.fieldos_handle_new_user();
  end if;
end $$;

notify pgrst, 'reload schema';

-- Result: every table and how many privacy rules it has (each FieldOS table should show 4, daily_plan_items 4, profiles 2)
select t.table_name,
  (select count(*) from pg_policies p where p.schemaname='public' and p.tablename=t.table_name) as privacy_rules
from information_schema.tables t
where t.table_schema='public' and t.table_type='BASE TABLE' order by 1;
