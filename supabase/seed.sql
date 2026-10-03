-- OPTIONAL demo data for YOUR account only. Run AFTER you have signed up / added yourself in
-- Supabase Authentication > Users. It fills the oldest user with sample customers.
-- Safe to skip. Do not run for tester accounts.
do $$
declare uid uuid;
begin
  select id into uid from auth.users order by created_at limit 1;
  if uid is null then raise notice 'No user yet - skipping seed'; return; end if;
  insert into public.customers (user_id, name, customer_type, potential_amount, priority, usual_availability, notes) values
    (uid, 'Sharma Traders',  'Distributor', 80000, 1, 'Mornings',   'Interested in new product'),
    (uid, 'Gupta Medical',   'Retailer',    35000, 2, 'Afternoons', null),
    (uid, 'Mehta Stores',    'Retailer',    20000, 3, 'Anytime',    null),
    (uid, 'Verma Agencies',  'Dealer',      60000, 2, 'After 3 PM', null),
    (uid, 'Khan Enterprises','Dealer',      15000, 4, 'Mornings',   null);
end $$;
