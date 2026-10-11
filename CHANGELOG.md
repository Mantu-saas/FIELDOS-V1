# Changelog
## 2026-10-11 — Fix 6: Trustworthy numbers (branch fix/trusted-numbers, NOT merged, NOT deployed)

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