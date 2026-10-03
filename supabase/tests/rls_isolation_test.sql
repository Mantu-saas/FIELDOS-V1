-- PROOF TEST: one user cannot read or change another user's data.
-- Run in Supabase SQL Editor. It creates two fake users, tests, then ROLLS BACK
-- so nothing is left behind. Read the result rows at the bottom.
begin;

-- Two fake users (Asha = A, Ravi = B)
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'asha.test@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'ravi.test@example.com');

-- Give each one customer (done as admin, before we pretend to be a user)
insert into public.customers (id, user_id, name, potential_amount) values
  ('aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Asha Customer', 50000),
  ('bbbbbbbb-1111-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', 'Ravi Customer', 70000);

create temp table results (test text, expected text, actual text);
grant all on results to authenticated;

-- Pretend to be Asha
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);

insert into results select 'T1 Asha sees only her own customers', '1',
  (select count(*) from public.customers)::text;

insert into results select 'T2 Asha cannot see Ravi customer by id', '0',
  (select count(*) from public.customers where id = 'bbbbbbbb-1111-0000-0000-000000000002')::text;

insert into results select 'T3 Asha sees only her own profile', '1',
  (select count(*) from public.profiles)::text;

-- T4: Asha tries to create a customer owned by Ravi -> must be blocked
do $$ begin
  insert into public.customers (user_id, name) values ('bbbbbbbb-0000-0000-0000-000000000002', 'Sneaky');
  insert into results values ('T4 Asha cannot create data as Ravi', 'blocked', 'NOT BLOCKED');
exception when others then
  insert into results values ('T4 Asha cannot create data as Ravi', 'blocked', 'blocked');
end $$;

-- T5: Asha tries to log a visit against Ravi's customer -> must be blocked
do $$ begin
  insert into public.visits (user_id, customer_id) values
    ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-1111-0000-0000-000000000002');
  insert into results values ('T5 Asha cannot attach a visit to Ravi customer', 'blocked', 'NOT BLOCKED');
exception when others then
  insert into results values ('T5 Asha cannot attach a visit to Ravi customer', 'blocked', 'blocked');
end $$;

-- T6: Asha tries to change Ravi's customer -> changes 0 rows
with u as (update public.customers set name = 'Hacked' where id = 'bbbbbbbb-1111-0000-0000-000000000002' returning 1)
insert into results select 'T6 Asha cannot edit Ravi customer (rows changed)', '0', count(*)::text from u;

-- T7: Asha tries to delete Ravi's customer -> deletes 0 rows
with d as (delete from public.customers where id = 'bbbbbbbb-1111-0000-0000-000000000002' returning 1)
insert into results select 'T7 Asha cannot delete Ravi customer (rows deleted)', '0', count(*)::text from d;

-- Not signed in at all
reset role;
set local role anon;
do $$ begin
  perform count(*) from public.customers;
  insert into results values ('T8 Signed-out visitor cannot read customers', 'blocked', 'NOT BLOCKED');
exception when others then
  insert into results values ('T8 Signed-out visitor cannot read customers', 'blocked', 'blocked');
end $$;

reset role;
select test, expected, actual, case when expected = actual then 'PASS' else 'FAIL' end as result
from results order by test;

rollback;
