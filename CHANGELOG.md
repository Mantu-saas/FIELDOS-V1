# Changelog
## 2026-10-12 — C20: one visit per customer per day + SALES message fix (same branch as C19, NOT merged, NOT deployed)

- Found in PR #19 browser testing: ROUTE allowed a second stop (and a second "Visited") for Test Shop 1 on the same day, because only a still-planned stop blocked a new one.
- Product rule (Product Owner): a new stop is blocked while the customer already has a visit today that is planned, visited or rescheduled. A cancelled visit or "customer unavailable" still allows another try.
- Message: "<customer> already has a visit today. Open it instead of adding a new stop."
- Add stop checks the list on screen AND re-checks the database just before saving (in case another phone recorded a visit). If that check fails, the stop is not added.
- Not covered: existing duplicate visits are left as they are; no database rule (a database-level guarantee would need a separate migration decision).
- SALES: the "Sale cancelled…" note now disappears when you edit or save another sale.
- Verification: 120/120 tests pass. Local build/type check BLOCKED (packages cannot be downloaded). Browser: NOT TESTED.

## 2026-10-12 — C19: 5-minute visit times with a 12-hour picker (branch fix/c19-five-minute-times, NOT merged, NOT deployed)

- Product decision (Product Owner, during PR #19 browser testing): visit times move in 5-minute steps (3:00, 3:05, 3:10 ...), replacing C17's :00/:30 slots. Found because the free time box accepted 2:23 and then showed a red "hour or half-hour" message.
- New `src/components/TimeSelect.tsx`: three drop-downs (Hour 12, 1 ... 11 / Minutes 00, 05 ... 55 / AM or PM). Only allowed times can be picked, so no red correction message in normal use.
- Used in all three save flows: ROUTE Add stop, Change time, Reschedule. The app's own step check stays as a safety net before any database call.
- Defaults: Add stop pre-fills the next 5-minute step after now (21:43 -> 21:45); Reschedule rounds an in-hours time up to the next step (09:32 -> 09:35).
- An existing time that is not on a step (e.g. 9:37) shows its hour and AM/PM with the minutes left blank to choose. Existing visits are not rounded or changed; no database rule, migration or data change.
- Not changed: other time boxes that are not visit times (onboarding working hours, customer best time, My Week events).
- Verification: tests pass (C17 tests replaced by C19 tests). Local build/type check BLOCKED (packages cannot be downloaded). Browser: NOT TESTED.

## 2026-10-12 — C17: 30-minute visit slots (branch fix/c17-half-hour-slots, NOT merged, NOT deployed)

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