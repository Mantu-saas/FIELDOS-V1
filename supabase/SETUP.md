# Supabase database setup (Milestone 1)
Run these in Supabase > SQL Editor > New query. For each file: open it, copy all, paste, click Run.
Order matters:
1. migrations/001_schema.sql  (tables)
2. migrations/002_rls.sql     (privacy rules)
3. migrations/003_delete_my_account.sql
4. tests/rls_isolation_test.sql  (proof test; all 8 rows must say PASS; it leaves no data behind)
5. seed.sql is optional demo data.
