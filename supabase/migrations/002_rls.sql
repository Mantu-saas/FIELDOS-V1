-- FieldOS V1 privacy rules (Row Level Security). Migration 002. Run after 001.
-- Rule: a signed-in user can only touch rows that belong to them.

alter table public.profiles          enable row level security;
alter table public.customers         enable row level security;
alter table public.sales             enable row level security;
alter table public.visits            enable row level security;
alter table public.daily_plans       enable row level security;
alter table public.daily_plan_items  enable row level security;
alter table public.health_checkins   enable row level security;
alter table public.follow_ups        enable row level security;
alter table public.coach_events      enable row level security;
alter table public.feedback          enable row level security;

-- No access at all for anonymous (not signed in) visitors
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- profiles: id is the user id. No insert policy: the signup trigger creates the row.
create policy profiles_select on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Simple tables: direct user_id ownership
do $$
declare t text;
begin
  foreach t in array array['customers','health_checkins','coach_events','feedback'] loop
    execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))', t||'_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t||'_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t||'_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t||'_delete', t);
  end loop;
end $$;

-- Tables that point at a customer: ALSO check that the customer is yours,
-- so nobody can attach their record to another person's customer.
do $$
declare t text;
begin
  foreach t in array array['visits','follow_ups'] loop
    execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))', t||'_select', t);
    execute format($p$create policy %I on public.%I for insert to authenticated with check (
      user_id = (select auth.uid())
      and exists (select 1 from public.customers c where c.id = customer_id and c.user_id = (select auth.uid())))$p$, t||'_insert', t);
    execute format($p$create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (
      user_id = (select auth.uid())
      and exists (select 1 from public.customers c where c.id = customer_id and c.user_id = (select auth.uid())))$p$, t||'_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t||'_delete', t);
  end loop;
end $$;

-- sales: customer is optional, so check it only when present
create policy sales_select on public.sales for select to authenticated using (user_id = (select auth.uid()));
create policy sales_insert on public.sales for insert to authenticated with check (
  user_id = (select auth.uid())
  and (customer_id is null or exists (select 1 from public.customers c where c.id = customer_id and c.user_id = (select auth.uid()))));
create policy sales_update on public.sales for update to authenticated using (user_id = (select auth.uid())) with check (
  user_id = (select auth.uid())
  and (customer_id is null or exists (select 1 from public.customers c where c.id = customer_id and c.user_id = (select auth.uid()))));
create policy sales_delete on public.sales for delete to authenticated using (user_id = (select auth.uid()));

-- daily_plans: direct ownership
create policy daily_plans_select on public.daily_plans for select to authenticated using (user_id = (select auth.uid()));
create policy daily_plans_insert on public.daily_plans for insert to authenticated with check (user_id = (select auth.uid()));
create policy daily_plans_update on public.daily_plans for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy daily_plans_delete on public.daily_plans for delete to authenticated using (user_id = (select auth.uid()));

-- daily_plan_items: ownership comes from the plan; the customer must be yours too
create policy plan_items_select on public.daily_plan_items for select to authenticated using (
  exists (select 1 from public.daily_plans p where p.id = plan_id and p.user_id = (select auth.uid())));
create policy plan_items_insert on public.daily_plan_items for insert to authenticated with check (
  exists (select 1 from public.daily_plans p where p.id = plan_id and p.user_id = (select auth.uid()))
  and exists (select 1 from public.customers c where c.id = customer_id and c.user_id = (select auth.uid())));
create policy plan_items_update on public.daily_plan_items for update to authenticated using (
  exists (select 1 from public.daily_plans p where p.id = plan_id and p.user_id = (select auth.uid())))
  with check (
  exists (select 1 from public.daily_plans p where p.id = plan_id and p.user_id = (select auth.uid()))
  and exists (select 1 from public.customers c where c.id = customer_id and c.user_id = (select auth.uid())));
create policy plan_items_delete on public.daily_plan_items for delete to authenticated using (
  exists (select 1 from public.daily_plans p where p.id = plan_id and p.user_id = (select auth.uid())));
