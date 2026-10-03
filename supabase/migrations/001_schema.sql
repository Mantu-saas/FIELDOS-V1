-- FieldOS V1 schema. Migration 001. Run once in Supabase SQL Editor.
-- Money amounts are in INR. Times use Asia/Kolkata by default.

-- Keeps updated_at current automatically
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- 1. profiles (one row per user; id = auth user id)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  phone text,
  role text,
  city text,
  monthly_target numeric(14,2) not null default 0 check (monthly_target >= 0),
  preferred_home_time time,
  work_start_time time,
  work_end_time time,
  timezone text not null default 'Asia/Kolkata',
  onboarding_complete boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. customers
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  customer_type text,
  phone text,
  address text,
  latitude numeric(9,6) check (latitude between -90 and 90),
  longitude numeric(9,6) check (longitude between -180 and 180),
  potential_amount numeric(14,2) not null default 0 check (potential_amount >= 0),
  priority integer not null default 3 check (priority between 1 and 5), -- 1 = highest
  usual_availability text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. sales
create table public.sales (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  sale_date date not null default current_date,
  amount numeric(14,2) not null check (amount >= 0),
  status text not null default 'confirmed' check (status in ('confirmed','pending','cancelled')),
  product_category text,
  notes text,
  created_at timestamptz not null default now()
);

-- 4. visits
create table public.visits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  planned_start timestamptz,
  planned_end timestamptz,
  actual_start timestamptz,
  actual_end timestamptz,
  status text not null default 'planned'
    check (status in ('planned','visited','unavailable','cancelled','rescheduled')),
  sale_amount numeric(14,2) not null default 0 check (sale_amount >= 0),
  lead_amount numeric(14,2) not null default 0 check (lead_amount >= 0),
  collection_amount numeric(14,2) not null default 0 check (collection_amount >= 0),
  result text,
  notes text,
  next_action text,
  follow_up_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 5. daily_plans
create table public.daily_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_date date not null,
  planned_home_time time,
  energy_level integer check (energy_level between 1 and 10),
  target_for_day numeric(14,2) not null default 0 check (target_for_day >= 0),
  expected_sales numeric(14,2) not null default 0 check (expected_sales >= 0),
  expected_finish_time time,
  status text not null default 'draft' check (status in ('draft','active','completed','abandoned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, plan_date)
);

-- 6. daily_plan_items (ownership comes from the parent plan)
create table public.daily_plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.daily_plans(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  sequence integer not null check (sequence >= 1),
  planned_start timestamptz,
  estimated_duration_minutes integer check (estimated_duration_minutes > 0),
  reason text,
  status text not null default 'planned'
    check (status in ('planned','done','skipped','moved','call_instead')),
  unique (plan_id, sequence)
);

-- 7. health_checkins
create table public.health_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  checkin_date date not null default current_date,
  energy integer check (energy between 1 and 10),
  stress integer check (stress between 1 and 10),
  sleep_hours numeric(3,1) check (sleep_hours between 0 and 24),
  steps integer check (steps >= 0),
  travel_hours numeric(4,1) check (travel_hours between 0 and 24),
  home_time time,
  notes text,
  created_at timestamptz not null default now(),
  unique (user_id, checkin_date)
);

-- 8. follow_ups
create table public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  due_date date not null,
  action text not null,
  expected_value numeric(14,2) not null default 0 check (expected_value >= 0),
  status text not null default 'open' check (status in ('open','done','dropped')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 9. coach_events
create table public.coach_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question text not null,
  answer text,
  context_json jsonb,
  created_at timestamptz not null default now()
);

-- 10. feedback (pilot)
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  feedback_date date not null default current_date,
  helped boolean,
  planning_minutes integer check (planning_minutes >= 0),
  sales_amount numeric(14,2) check (sales_amount >= 0),
  visits_completed integer check (visits_completed >= 0),
  travel_hours numeric(4,1) check (travel_hours between 0 and 24),
  planned_home_time time,
  actual_home_time time,
  energy integer check (energy between 1 and 10),
  stress integer check (stress between 1 and 10),
  friction text,
  comment text,
  created_at timestamptz not null default now(),
  unique (user_id, feedback_date)
);

-- Indexes (speed up the screens we will build)
create index customers_user_idx on public.customers (user_id, active);
create index sales_user_date_idx on public.sales (user_id, sale_date);
create index sales_customer_idx on public.sales (customer_id);
create index visits_user_idx on public.visits (user_id, planned_start);
create index visits_customer_idx on public.visits (customer_id);
create index plan_items_plan_idx on public.daily_plan_items (plan_id, sequence);
create index follow_ups_user_due_idx on public.follow_ups (user_id, status, due_date);
create index coach_events_user_idx on public.coach_events (user_id, created_at desc);

-- updated_at triggers
create trigger trg_profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
create trigger trg_customers_updated before update on public.customers for each row execute function public.set_updated_at();
create trigger trg_visits_updated before update on public.visits for each row execute function public.set_updated_at();
create trigger trg_daily_plans_updated before update on public.daily_plans for each row execute function public.set_updated_at();
create trigger trg_follow_ups_updated before update on public.follow_ups for each row execute function public.set_updated_at();

-- Auto-create an empty profile when someone signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
