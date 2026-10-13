# Changelog
## 2026-10-13 — R2: plan other days, edit customers (branch release/r2-plan-edit, NOT merged, NOT deployed)

- Asked by the founder on day 1 of real use: plan doctors on other days, and edit what was entered.
- ROUTE: day switcher (Previous · day · Next, "Back to today"). Stops can be added for today or any future day; past days show what was planned and recorded. Loading, adding and the one-visit-per-day re-check all use the day shown.
- Visit detail: a visit planned for a future day can be moved (Change time or date) or removed, but not recorded ahead of time; the screen and the save both refuse.
- Customers: "Edit customer" (name, type, phone, address, potential, priority, best time, and a new Notes field). Saves only this user's customer and reports success only when the database confirms it.
- TODAY: the "Plan tomorrow" hint now matches ROUTE ("ROUTE, then Next").
- My Week: each planned doctor visit has "Change time or date" right under it, so a visit can be moved to another day or time without going to ROUTE (same safe move as ROUTE: same visit, never copied, blocked if that doctor is already booked that day).
- No database change. Verification: 190/190 unit tests pass; full build and browser not yet run (the Cloudflare preview builds it).

## 2026-10-13 — R1: pilot release (branch release/r1-pilot, NOT merged, NOT deployed)

- Combines fix/v1-reliability and C21 (fix/c21-visit-record-guard); their 4 overlapping files were resolved by keeping both sides.
- C21 database rules proven on the real test database by a rolled-back test (13 Oct): a stale second recording, a stale Remove and any action on another account's visit are all refused; no second sale; nothing was left behind (before/after snapshots identical).
- TODAY: new "Next action" card at the top, from fixed rules on the user's own data (src/lib/nextAction.ts): record a missed visit → wrap up near home time → overdue/due follow-up → next visit → plan tomorrow. Shows the reason and counts; shows an error instead of guessing when data can't load.
- TODAY: the "date" message now appears only for real dates ("date night", "dinner date"…), not for "Update stock" or "Due date"; cancelled personal events no longer shape the day's message.
- LIFE: "Your data" privacy note for pilot users.
- Production database structure checked read-only (13 Oct, from the founder's export): all tables and fields the app needs are present; privacy rules on for every table.
- Verification: unit tests pass (see commit). Full build/type check and browser: see the release notes for what could and could not be run.
## 2026-10-13 — C21: safe "Record visit" / "Remove", and rescheduling history kept (branch fix/c21-visit-record-guard, NOT pushed, NOT merged, NOT deployed)

- Found in the Archana / Debasis investigation (read-only). "Rescheduled from 2026-10-11 (Cancelled)" is the replacement visit's own note, written on purpose by Reschedule; the original visit is never changed.
- Fix 1: "Record visit" now records a visit only while it is still planned and belongs to this user, and confirms exactly one visit changed. Only then are the sale and follow-up added. A visit already recorded (another phone, old screen) shows "This visit was already recorded… Nothing was saved" — no second sale, no second follow-up, no overwritten result.
- Fix 1: ROUTE "Remove" deletes a stop only while it is still planned. A visit recorded meanwhile is kept and the route refreshes with a message.
- Fix 2: recording a replacement visit keeps its "Rescheduled from …" line first, with the typed note after it (it used to be erased). The stored wording is unchanged, so existing visits still match.
- Fix 2: My Week and the visit screen show it in plain words: "Moved here from Sun 11 Oct. That visit was cancelled."
- New: src/lib/visitRecord.ts, src/lib/visitHistory.ts (+ tests). No database, migration or Supabase change.
- Verification: 153/153 tests pass (120 existing + 33 new; 3 older text checks moved to the new file location). Strict type check of the new files and syntax check of every changed file pass. Full build/type check BLOCKED (packages cannot be downloaded). Browser: NOT TESTED.
## 2026-10-12 — C20: one visit per customer per day + SALES message fix (same branch as C19, NOT merged, NOT deployed)

## 2026-10-13 — V1 reliability: My Week timeline, one-visit-per-day everywhere, HEALTH date (branch fix/v1-reliability, NOT merged, NOT deployed)

- My Week: each day is now ONE list in time order — all-day events, then events and visits by start time, then follow-ups due that day (new `src/lib/weekPlan.ts`). Before, events, visits and follow-ups were shown in three separate groups.
- My Week: time-clash warning when open events and planned visits overlap (a visit counts as 15 minutes, the same planning default as ROUTE). Cancelled, completed, all-day items and visits already done never warn.
- My Week: personal events can now be cancelled ("Cancel event", with a confirmation) and restored. Before, there was no way to cancel an event. Cancelled events stay visible, crossed out, and are not counted as work. Status changes are accepted only when the database returns the changed event.
- My Week: visits already done now stay on their day as completed (they used to disappear); cancelled, unavailable and rescheduled visits are still left out.
- Change time and Reschedule now use the same one-visit-per-day rule as Add stop (planned, visited or rescheduled blocks; cancelled or unavailable does not). Before, they only blocked a second PLANNED visit, so a visit could be moved onto a day the customer was already visited. The visit being moved, or the original being rescheduled, never blocks itself.
- HEALTH saves and loads the check-in for the India date (same as TODAY and COACH) instead of the phone's own time zone.
- Not changed: database, migrations, data, existing duplicate visits, production settings.
- Verification: 132/132 tests pass (12 new). Local build BLOCKED (packages cannot be downloaded). Browser: NOT TESTED.

## 2026-10-12 — C18 + Fixes A/B/C: cancelled sales and visits (PR #19; merged and deployed as 2f41c9f)

- ROUTE and COACH say when a visit's sale was cancelled in SALES and is not counted; cancelled visits are set apart in "Cancelled today"; SALES confirms a cancellation with the database and shows it red and struck through; COACH shows a stress line only for a valid 1-10 score.
- Verification: tests pass; Cloudflare preview build passed; browser-tested on the preview with the test database.

## 2026-10-12 — C20: one visit per customer per day + SALES message fix (PR #20; merged and deployed as 794cead)

- Found in PR #19 browser testing: ROUTE allowed a second stop (and a second "Visited") for Test Shop 1 on the same day, because only a still-planned stop blocked a new one.
- Product rule (Product Owner): a new stop is blocked while the customer already has a visit today that is planned, visited or rescheduled. A cancelled visit or "customer unavailable" still allows another try.
- Message: "<customer> already has a visit today. Open it instead of adding a new stop."
- Add stop checks the list on screen AND re-checks the database just before saving (in case another phone recorded a visit). If that check fails, the stop is not added.
- Not covered: existing duplicate visits are left as they are; no database rule (a database-level guarantee would need a separate migration decision).
- SALES: the "Sale cancelled…" note now disappears when you edit or save another sale.
- Verification: 120/120 tests pass. Cloudflare preview build passed. Browser-tested on the preview with the test database (Add stop picker, block, Change time, move to tomorrow, SALES message on save).

## 2026-10-12 — C19: 5-minute visit times with a 12-hour picker (PR #20; merged and deployed as 794cead)

- Product decision (Product Owner, during PR #19 browser testing): visit times move in 5-minute steps (3:00, 3:05, 3:10 ...), replacing C17's :00/:30 slots. Found because the free time box accepted 2:23 and then showed a red "hour or half-hour" message.
- New `src/components/TimeSelect.tsx`: three drop-downs (Hour 12, 1 ... 11 / Minutes 00, 05 ... 55 / AM or PM). Only allowed times can be picked, so no red correction message in normal use.
- Used in all three save flows: ROUTE Add stop, Change time, Reschedule. The app's own step check stays as a safety net before any database call.
- Defaults: Add stop pre-fills the next 5-minute step after now (21:43 -> 21:45); Reschedule rounds an in-hours time up to the next step (09:32 -> 09:35).
- An existing time that is not on a step (e.g. 9:37) shows its hour and AM/PM with the minutes left blank to choose. Existing visits are not rounded or changed; no database rule, migration or data change.
- Not changed: other time boxes that are not visit times (onboarding working hours, customer best time, My Week events).
- Verification: tests pass (C17 tests replaced by C19 tests). Local build/type check BLOCKED (packages cannot be downloaded). Browser: NOT TESTED.

## 2026-10-12 — C17: 30-minute visit slots (PR #18; merged as fbe091f; replaced by C19)

- Product rule: every saved visit time must be on :00 or :30, in Add stop (including earlier-today logging), Change time and Reschedule.
- The app's own check blocks off-slot times before any database call; `step={1800}` on time boxes is only a picker hint.
- Reschedule suggestions are always slots: 09:35 -> 10:00; rounding past the end of the working day -> work start; off-slot work start (08:45) -> 09:00; a working day with no slot -> 09:00.
- Existing visits are not rounded or changed; no database rule, migration or data change.
- Verification: 64/64 tests pass (12 new). Build: Cloudflare preview. Browser: NOT TESTED.

## 2026-10-12 — C10: Visit times and rescheduling (PR #17; merged and deployed as e1710ab)

- Root cause (confirmed from live data): ROUTE stops added without a time were stamped with "now" (two visits at 01:07 on 11 Oct), and rescheduling copied that time to 12 Oct.
- New `src/lib/visitTime.ts`: India-time helpers (next half-hour default, time/date validation, working-hours rescheduling default).
- ROUTE "Add stop": planned time is required, prefilled with the next half-hour; no silent "now"; double-tap guarded.
- Rescheduling: an original time outside working hours (profile work start/end, default 09:00-18:00) is replaced by the work start time; times inside working hours are kept. Existing past-time and same-day duplicate checks kept.
- "Rescheduled" result now leads straight to planning the replacement visit (reusing the existing flow) and no longer forces a follow-up task.
- New "Change time or date" on planned visits (`ChangeVisitTime.tsx`): updates only that visit's planned_start, filtered by visit, user, customer and planned status; success only if exactly one row changed.
- Unchanged: database schema, RLS, existing visits.
- Verification: 52/52 tests pass (17 new). Local build BLOCKED (packages cannot be downloaded); verified by the Cloudflare preview build. Browser: NOT TESTED.
- C12 (PR #16): merged and deployed 2026-10-12 as 59da26f.

## 2026-10-12 — C12: COACH "best next move" (PR #16)

- New `src/lib/coachRules.ts`: the target answer's "BEST NEXT MOVE" section, as testable rules.
- The follow-up sentence now matches the number listed ("This follow-up carries", "These 2 follow-ups carry"), replacing the fixed "These three carry".
- Overdue follow-ups with no expected value are listed (oldest first, up to 3) instead of being ignored. No amount is invented for them.
- New-visit suggestions skip customers already on today's route or already listed for an overdue follow-up. A planned customer with an overdue follow-up is still shown, marked "already on today's route".
- Unchanged: target maths, selling days, database, data, visit times.
- Verification: 35/35 tests pass (19 new). Type-check: no new errors versus main. Local `npm run build`: BLOCKED (packages cannot be downloaded); to be verified by the Cloudflare preview build. Browser: NOT TESTED.

## 2026-10-11 — Fix 6: Trustworthy numbers (PR #15; merged and deployed 2026-10-12 as 89630cb)

- New `src/lib/rules.ts`: one shared rule for active sales, pending visits and the HEALTH 0-3 energy scale.
- COACH now receives the profile (`src/pages/Shell.tsx`), so target and home-time answers use real values (C1).
- My Week sales summary excludes cancelled sales (C2).
- COACH uses TODAY's target maths (`lib/targetMath.ts`); no pace verdict before the first completed selling day (C5).
- COACH treats only Tired/Drained as low energy and shows energy as words, not "/10" (C3).
- COACH no longer counts rescheduled visits as still planned for today (C4).
- Added `npm test` (Node built-in runner, no new packages) with 16 unit and wiring tests.
- Verification: 16/16 tests pass locally; type-check shows no new errors versus main (stand-in library types).
  Full `npm run build`: BLOCKED locally (packages cannot be downloaded); to be verified by a Cloudflare preview build.
  Browser testing: NOT TESTED.
## 2026-10-10 — Fix 4: Coach answers and loading state verified

- Updated `src/features/coach/CoachPage.tsx` with the reviewed Coach fix.
- Build verification: `npm run build` passed; TypeScript and Vite completed successfully, with 88 modules transformed.
- Browser test passed: “How can I improve my performance?” returned personalized recommendations.
- Browser test passed: “Who should I visit tomorrow?” returned a question-specific customer ranking after refreshing the page.
- Ask Coach displayed answers instead of remaining stuck on “Thinking…”.
- Scope: These two questions were tested. Other Coach questions have not yet been fully tested.
## 2026-10-02 - Milestone 0
- Created repository skeleton, base docs and .env.example. No app code.

## 2026-10-02 - Milestone 1 (Database), written, NOT yet run
- Added migrations 001 schema, 002 RLS, 003 delete_my_account, RLS isolation test, optional seed, SETUP.md.
## 2026-10-10 - Fix 5: Visit status clarity (build and browser tests pending)

- Added a Coach answer that separates pending, visited, unavailable, rescheduled and cancelled visits.
- Rescheduled visits are not counted as pending for today.
- Preserved the existing Coach answer and loading-state handling.
- Verification status: NOT YET VERIFIED. Run `npm run build` and test the visit-status questions in the browser before merging.