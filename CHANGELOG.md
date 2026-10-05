# Changelog
## 2026-10-02 - Milestone 0
- Created repository skeleton, base docs and .env.example. No app code.

## 2026-10-02 - Milestone 1 (Database), written, NOT yet run
- Added migrations 001 schema, 002 RLS, 003 delete_my_account, RLS isolation test, optional seed, SETUP.md.

## 2026-10-02 - Milestone 2 (App skeleton + Auth + Onboarding), written, NOT yet built or tested
- Vite/React/TS PWA, Swayam theme, email+password auth, onboarding saving to profiles, 5-tab shell, Cloudflare notes.

## 2026-10-04 - Fix 1 (written, NOT yet built or tested)
- supabase.ts: trims env values, detects missing/wrong/secret keys. App.tsx and Onboarding.tsx now show the real Supabase error text.

## 2026-10-04 - Fix 2 (written, NOT yet built or tested)
- App.tsx: profile loads once per user id, so background login refresh no longer resets the onboarding form.

## 2026-10-05 - Milestone 3 (Customers, Sales, TODAY target math), written, NOT yet built or tested
- Added customers (add/list/detail/navigate/call/remove), sales entry, TODAY dashboard with target math, migration 004 safe top-up.

## 2026-10-05 - Milestone 4 (Route, Visits, Record Visit, Follow-ups), written, NOT yet built or tested
- Added ROUTE tab (today stops, Google Maps links), pre-visit card, visit recording (also creates sale and follow-up), follow-ups list. Shell.tsx and format.ts/types got small additions only.

## 2026-10-05 - Milestone 5 (Health check-in, End of day, rule-based Coach), written, NOT yet built or tested
- HEALTH: check-in + end-of-day review (saves to health_checkins and feedback). COACH: 7 rule-based questions using only user data, history in coach_events.
