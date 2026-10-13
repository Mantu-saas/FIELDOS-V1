// Source-level guards for two confirmed wiring bugs. These read the files as text because
// screen tests need React test tooling that the project does not have yet. Replace them with
// real screen tests when that tooling is added.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

const read = (path: string) => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')

test('C1: Shell passes the profile to COACH (otherwise target and home time are always missing)', () => {
  assert.match(read('src/pages/Shell.tsx'), /<CoachPage[^>]*\bprofile=\{profile\}/)
})

test('C2: My Week loads sale status and uses the shared rule that excludes cancelled sales', () => {
  const src = read('src/features/myweek/MyWeekPage.tsx')
  assert.match(src, /\.select\('id,amount,status'\)/)
  assert.match(src, /activeSalesTotal\(sales\)/)
})

test('COACH and TODAY use the shared target maths and sales rule', () => {
  for (const file of ['src/features/coach/CoachPage.tsx', 'src/features/today/TodayPage.tsx']) {
    const src = read(file)
    assert.match(src, /computeTarget\(/, file)
    assert.match(src, /activeSalesTotal\(/, file)
  }
})

test('C12: COACH target answer uses the shared next-move rules with today\'s planned visits', () => {
  const src = read('src/features/coach/CoachPage.tsx')
  assert.match(src, /buildNextMove\(\{/)
  assert.match(src, /plannedTodayIds: new Set\(s\.todayPlanned\.map/)
  assert.doesNotMatch(src, /These three carry/)
})

test('COACH no longer treats energy 3 (Fresh) as low or shows energy out of 10', () => {
  const src = read('src/features/coach/CoachPage.tsx')
  assert.doesNotMatch(src, /energy\s*<=\s*3/)
  // an energy value printed directly as "x/10", e.g. ${s.energy}/10 or {health.energy ?? '—'}/10
  assert.doesNotMatch(src, /energy[^`\n}]{0,15}\}\/10/)
})

// ---------- C10: visit times and rescheduling ----------

test('C10: ROUTE add-stop requires a time and never falls back to "now"', () => {
  const src = read('src/features/route/RoutePage.tsx')
  const addStop = src.slice(src.indexOf('async function addStop'), src.indexOf('async function removeStop'))
  assert.doesNotMatch(addStop, /new Date\(\)\.toISOString\(\)/)
  assert.match(addStop, /if \(!isValidClock\(time\)\)/)
  assert.match(addStop, /buildPlannedStart\(today, time\)/)
  assert.match(src, /setTime\(nextSlotToday\(\)\)/)
  assert.doesNotMatch(src, /Planned time \(optional\)/)
})

test('C10: rescheduling uses the working-hours default and also serves "Rescheduled" visits', () => {
  const src = read('src/features/visits/RescheduleVisit.tsx')
  assert.match(src, /suggestRescheduleTime\(istClockOf\(iso\), hours\)/)
  assert.doesNotMatch(src, /istClock\(/)
  assert.match(src, /visit\.status === 'rescheduled'/)
  // existing safeguards are kept
  assert.match(src, /The new time must be in the future\./)
  assert.match(src, /already has a visit on/)
})

test('C10: choosing "Rescheduled" leads to planning the replacement, without forcing a follow-up task', () => {
  const src = read('src/features/visits/VisitDetail.tsx')
  assert.doesNotMatch(src, /Choose the new date in "Follow-up date" for a rescheduled visit/)
  assert.match(src, /if \(status === 'rescheduled'\) return setPlanReplacement\(true\)/)
  assert.match(src, /visit\.status === 'rescheduled'\) && \(\s*<RescheduleVisit/)
})

test('C10: "Change time" updates only planned_start of this planned visit and confirms one row', () => {
  const src = read('src/features/visits/ChangeVisitTime.tsx')
  assert.match(src, /\.update\(\{ planned_start: plannedStart \}\)/)
  for (const f of [`.eq('id', visit.id)`, `.eq('user_id', userId)`, `.eq('customer_id', visit.customer_id)`, `.eq('status', 'planned')`]) {
    assert.ok(src.includes(f), f)
  }
  assert.match(src, /result\.data\.length !== 1/)
  assert.doesNotMatch(src, /\.delete\(|\.insert\(/)
  assert.match(read('src/features/visits/VisitDetail.tsx'), /<ChangeVisitTime userId=\{userId\} visit=\{visit\}/)
})

// ---------- C19: 5-minute steps in all three save flows (replaces C17's 30-minute slots) ----------

const slotCheckBeforeSave = (file: string, fnStart: string, saveCall: RegExp) => {
  const src = read(file)
  const body = src.slice(src.indexOf(fnStart))
  const check = body.search(/if \(!isTimeSlot\(time\)\)/)
  const save = body.search(saveCall)
  assert.ok(check > 0, `${file}: step check present`)
  assert.ok(save > 0, `${file}: save call present`)
  assert.ok(check < save, `${file}: step check runs before the database save`)
  assert.ok(src.includes('SLOT_MESSAGE'), `${file}: safety-net message kept`)
  // the free time box is replaced by the drop-down picker that offers only allowed times
  assert.match(src, /<TimeSelect\b/, `${file}: uses the drop-down picker`)
  assert.doesNotMatch(src, /type="time"/, `${file}: no free time box`)
  assert.doesNotMatch(src, /isHalfHourSlot|step=\{1800\}/, `${file}: no 30-minute leftovers`)
}

test('C19: Add stop uses the picker and checks the step before inserting', () => {
  slotCheckBeforeSave('src/features/route/RoutePage.tsx', 'async function addStop', /\.from\('visits'\)\.insert\(/)
})

test('C19: Change time uses the picker and checks the step before any database call', () => {
  slotCheckBeforeSave('src/features/visits/ChangeVisitTime.tsx', 'async function save', /\.from\('visits'\)/)
})

test('C19: Reschedule uses the picker and checks the step before any database call', () => {
  slotCheckBeforeSave('src/features/visits/RescheduleVisit.tsx', 'async function saveVisit', /\.from\('visits'\)/)
})

test('C19: the picker offers only hour, 5-minute and AM/PM choices', () => {
  const src = read('src/components/TimeSelect.tsx')
  assert.match(src, /HOUR_OPTIONS_12\.map/)
  assert.match(src, /MINUTE_OPTIONS\.map/)
  assert.match(src, /<option value="AM">AM<\/option>/)
  assert.match(src, /<option value="PM">PM<\/option>/)
  assert.match(src, /onChange\(fromClock12\(/)
  assert.doesNotMatch(src, /<input/)
})

test('C17/C19: no database rule or migration was added (existing records untouched)', () => {
  const files = readdirSync(new URL('../../supabase/migrations/', import.meta.url))
  assert.ok(!files.some(f => /slot|half.?hour|interval/i.test(f)), files.join(', '))
})

test('C18: visit-sale query is scoped to this user, visit-created sales, customers and recording dates', () => {
  const src = read('src/lib/visitSales.ts')
  assert.match(src, /\.from\('sales'\)/)
  assert.match(src, /\.eq\('user_id', userId\)/)
  assert.match(src, /\.eq\('notes', VISIT_SALE_NOTE\)/)
  assert.match(src, /\.in\('customer_id', customerIds\)/)
  assert.match(src, /\.in\('sale_date', dates\)/)
  assert.match(src, /istDateOf\(v\.actual_start\)/)
  assert.doesNotMatch(src, /monthStart/)
})

test('C18: duplicate-visit count is loaded from the database, scoped like the sales', () => {
  const src = read('src/lib/visitSales.ts')
  const peers = src.slice(src.indexOf(".from('visits')"))
  assert.match(peers, /\.select\('id,customer_id,sale_amount,actual_start'\)/)
  assert.match(peers, /\.eq\('user_id', userId\)/)
  assert.match(peers, /\.in\('customer_id', customerIds\)/)
  assert.match(peers, /\.gt\('sale_amount', 0\)/)
  assert.match(peers, /\.gte\('actual_start', from\)/)
  assert.match(peers, /\.lt\('actual_start', to\)/)
  // a failure of either query means no status is claimed
  assert.match(src, /if \(error\) return \{ rows: null, peers: null, error \}/)
  for (const file of ['src/features/route/RoutePage.tsx', 'src/features/coach/CoachPage.tsx']) {
    assert.match(read(file), /visitSaleStates\([^)]*\), [a-zA-Z]+\.rows, [a-zA-Z]+\.peers\)/, file)
  }
})

test('C18: visit detail writes the same note the matching rule looks for', () => {
  // C21: the sale is written by lib/visitRecord.ts, with the note passed in by the screen
  const src = read('src/features/visits/VisitDetail.tsx')
  assert.match(src, /saleNote: VISIT_SALE_NOTE/)
  assert.doesNotMatch(src, /notes: 'From visit'/)
  assert.match(read('src/lib/visitRecord.ts'), /notes: input\.saleNote/)
})

test('C18: visit sale date and actual_start come from the same moment (midnight-safe)', () => {
  // C21: the screen works out `now` and `saleDate` once and passes both to lib/visitRecord.ts
  const src = read('src/features/visits/VisitDetail.tsx')
  assert.match(src, /const now = new Date\(\)\.toISOString\(\)/)
  assert.match(src, /const saleDate = istDateOf\(now\)/)
  assert.match(src, /now, saleDate, saleNote/)
  assert.doesNotMatch(src, /sale_date: today/)
  const lib = read('src/lib/visitRecord.ts')
  assert.match(lib, /actual_start: input\.now/)
  assert.match(lib, /sale_date: input\.saleDate/)
})

test('C18: ROUTE, visit detail and COACH show a visit\'s sale through the shared rule', () => {
  const route = read('src/features/route/RoutePage.tsx')
  assert.match(route, /actual_start/)
  assert.match(route, /loadVisitSales\(userId, loaded\)/)
  assert.match(route, /visitSaleStates\(/)
  assert.match(route, /visitSalesError/)
  assert.match(route, /visitSaleLabel\(saleStateOf\(visit\)/)
  assert.match(route, /saleState=\{saleStateOf\(selectedVisit\)\}/)
  assert.doesNotMatch(route, /' · Sale ' \+ inr/)

  const detail = read('src/features/visits/VisitDetail.tsx')
  assert.match(detail, /visitSaleLabel\(saleState \?\? 'not_found'/)
  assert.doesNotMatch(detail, /<b>Sale:<\/b> \{inr\(Number\(visit\.sale_amount\)\)\}/)

  const coach = read('src/features/coach/CoachPage.tsx')
  assert.match(coach, /select\('id, customer_id, planned_start, actual_start, status, sale_amount, next_action'\)/)
  assert.match(coach, /loadVisitSales\(userId, loadedVisits\)/)
  assert.match(coach, /visitSaleLabel\(visitSaleState\[v\.id\] \?\? 'not_found'/)
  assert.doesNotMatch(coach, /` — Sale \$\{inr\(Number\(v\.sale_amount\)\)\}`/)
})

// ---------------- Fix A: cancelled visits ----------------

test('Fix A: ROUTE numbers, gaps and navigation use only active visits; cancelled are listed apart', () => {
  const src = read('src/features/route/RoutePage.tsx')
  assert.match(src, /splitCancelledVisits<RouteVisit>\(visits\)/)
  assert.match(src, /workVisits\.map\(\(visit, index\)/)            // numbered list
  assert.match(src, /const current = workVisits\[index\]/)          // time gaps
  assert.match(src, /const next = workVisits/)
  assert.match(src, /const pending = workVisits/)                   // Google Maps stops
  assert.doesNotMatch(src, /\bvisits\.map\(\(visit, index\)/)
  // cancelled visits stay visible, clearly marked, and can be opened (to reschedule)
  assert.match(src, /Cancelled today \(\{cancelledVisits\.length\}\)/)
  assert.match(src, /cancelledVisits\.map\(visit =>[\s\S]*?onClick=\{\(\) => setSelected\(visit\.id\)\}[\s\S]*?CANCELLED/)
  assert.match(src, /const selectedVisit = visits\.find/)           // opening uses the full list
  // no new deletes: cancelling never removes data. C21: the only delete ("Remove planned stop")
  // now lives in lib/visitRecord.ts and only removes a visit that is still planned.
  assert.equal((src.match(/\.delete\(\)/g) ?? []).length, 0)
  const lib = read('src/lib/visitRecord.ts')
  assert.equal((lib.match(/\.delete\(\)/g) ?? []).length, 1)
  assert.match(lib, /\.delete\(\)\s*\.eq\('id', visitId\)\s*\.eq\('user_id', userId\)\s*\.eq\('status', 'planned'\)/)
})

test('Fix A: COACH counts today\'s visits without cancelled ones', () => {
  const src = read('src/features/coach/CoachPage.tsx')
  assert.match(src, /const todayActive = todayAll\.filter\(v => !isCancelledVisit\(v\)\)/)
  assert.match(src, /Today's visits: <strong>\{view\.todayActive\.length\}/)
  assert.match(src, /today_visits: s\.todayActive\.length/)
  // planned counts already use the pending rule, which excludes cancelled
  assert.match(src, /const todayPlanned = todayAll\.filter\(isPlannedVisit\)/)
})

test('Fix A (updated in V1): My Week never shows cancelled visits as work; visited ones count as completed', () => {
  const src = read('src/features/myweek/MyWeekPage.tsx')
  assert.match(src, /setWeekVisits\(visits\.filter\(isPlannerVisit\)\)/)   // isPlannerVisit excludes cancelled (weekPlan tests)
  assert.match(src, /dayVisits\.filter\(visit => visit\.status === 'visited'\)\.length/)
})

// ---------------- Fix B: cancelled sales ----------------

test('Fix B: SALES confirms the cancellation with the database before showing it', () => {
  const src = read('src/features/sales/SalesView.tsx')
  const fn = src.slice(src.indexOf('async function cancelSale'), src.indexOf('const total ='))
  assert.match(fn, /\.update\(\{ status: 'cancelled' \}\)\s*\.eq\('id', id\)\s*\.eq\('user_id', userId\)\s*\.select\('id,status'\)/)
  assert.match(fn, /if \(error\) \{[\s\S]*?ok: false[\s\S]*?return/)
  assert.match(fn, /if \(!isSaleCancellationConfirmed\(data, id\)\) \{[\s\S]*?ok: false[\s\S]*?return/)
  // the on-screen change happens only after both checks
  assert.ok(fn.indexOf('markSaleCancelled(') > fn.indexOf('isSaleCancellationConfirmed('))
  assert.match(fn, /if \(cancellingId\) return/)       // no double cancel
})

test('Fix B: SALES shows cancelled sales struck through in red with a CANCELLED label, and uses the shared total rule', () => {
  const src = read('src/features/sales/SalesView.tsx')
  assert.match(src, /className=\{cancelled \? 'cancelled-text' : undefined\}/)
  assert.match(src, /<b className="cancelled-text">\{inr\(Number\(r\.amount\)\)\}<\/b>/)
  assert.match(src, /<span className="cancelled-label">CANCELLED<\/span>/)
  assert.match(src, /const total = activeSalesTotal\(rows\)/)
  // this list only loads the signed-in salesperson's own sales
  assert.match(src, /\.from\('sales'\)\s*\.select\([\s\S]*?\)\s*\.eq\('user_id', userId\)/)
  const css = read('src/styles.css')
  assert.match(css, /\.cancelled-text \{[^}]*color:#b91c1c[^}]*text-decoration:line-through/)
})

// ---------------- Fix C: stress display ----------------

test('Fix C: COACH shows a stress line only when a real 1-10 score is stored', () => {
  const src = read('src/features/coach/CoachPage.tsx')
  assert.match(src, /const stress = validStressScore\(health\?\.stress\)/)
  // My Day card: line only rendered for a valid score; the old "—/10" fallback is gone
  assert.match(src, /\{validStressScore\(health\.stress\) !== null && \(\s*<p>Stress: <strong>\{validStressScore\(health\.stress\)\}\/10<\/strong><\/p>/)
  assert.doesNotMatch(src, /\?\? '—'\}\/10/)
  assert.doesNotMatch(src, /Stress \$\{s\.stress \?\? '—'\}\/10/)
  assert.match(src, /if \(s\.stress !== null\) r \+= ` · Stress \$\{s\.stress\}\/10`/)
  // the rest of the wellbeing line and advice stays
  assert.match(src, /Energy: <strong>\{energyLabel\(health\.energy\)\}<\/strong>/)
  assert.match(src, /STRESS CHECK/)
})

test('Fix C: no new HEALTH question, scale or database column was added for stress', () => {
  const health = read('src/features/health/HealthPage.tsx')
  assert.doesNotMatch(health, /onClick=\{\(\) => setStress|onChange=\{[^}]*setStress/)
  const files = readdirSync(new URL('../../supabase/migrations/', import.meta.url))
  assert.ok(!files.some(f => /stress/i.test(f)), files.join(', '))
})

// ---------- C20: one visit per customer per day ----------

test('C20: Add stop uses the shared rule on screen AND re-checks the database before inserting', () => {
  const src = read('src/features/route/RoutePage.tsx')
  const addStop = src.slice(src.indexOf('async function addStop'), src.indexOf('async function removeStop'))
  assert.match(addStop, /blocksNewStopToday\(visit\)/)
  assert.doesNotMatch(addStop, /visit\.status === 'planned'/)       // the old planned-only check is gone
  const recheck = addStop.search(/\.in\('status', \[\.\.\.STOP_BLOCKING_STATUSES\]\)/)
  const insert = addStop.search(/\.from\('visits'\)\.insert\(/)
  assert.ok(recheck > 0 && insert > 0 && recheck < insert, 'database re-check runs before the insert')
  assert.ok(addStop.includes(".eq('user_id', userId)") && addStop.includes(".eq('customer_id', custId)"))
  assert.match(addStop, /sameDayVisitMessage\(customerName\)/)
  assert.match(addStop, /The stop was not added\./)              // a failed check never adds the stop
})

test('SALES: the "Sale cancelled" note is cleared when you edit or save another sale', () => {
  const src = read('src/features/sales/SalesView.tsx')
  const startEdit = src.slice(src.indexOf('function startEdit'), src.indexOf('async function save'))
  const save = src.slice(src.indexOf('async function save'), src.indexOf('async function cancelSale'))
  assert.match(startEdit, /setListMsg\(null\)/)
  assert.match(save, /setListMsg\(null\)/)
})

// ---------- V1 reliability ----------

test('V1: Change time and Reschedule use the same one-visit-per-day rule as Add stop', () => {
  for (const file of ['src/features/visits/ChangeVisitTime.tsx', 'src/features/visits/RescheduleVisit.tsx']) {
    const src = read(file)
    assert.match(src, /\.in\('status', \[\.\.\.STOP_BLOCKING_STATUSES\]\)/, file)
    assert.doesNotMatch(src, /\.eq\('status', 'planned'\)\s*\n\s*\.gte\('planned_start'/, `${file}: old planned-only check gone`)
  }
  // Reschedule: the original visit never blocks its own replacement
  assert.match(read('src/features/visits/RescheduleVisit.tsx'), /\.neq\('id', visit\.id\)/)
  // Change time: the visit being moved never blocks itself
  assert.match(read('src/features/visits/ChangeVisitTime.tsx'), /\.neq\('id', visit\.id\)/)
})

test('V1: HEALTH saves and loads the check-in for the India date, like TODAY and COACH', () => {
  const src = read('src/features/health/HealthPage.tsx')
  assert.match(src, /useMemo\(\(\) => todayIST\(\), \[\]\)/)
  assert.doesNotMatch(src, /getTimezoneOffset/)
})

test('V1: My Week shows one time-ordered list with clash warnings, and events can be cancelled safely', () => {
  const src = read('src/features/myweek/MyWeekPage.tsx')
  assert.match(src, /dayTimeline<PersonalEvent, WeekVisit, FollowUpRow>\(/)
  assert.match(src, /dayClashes\(dayEvents, dayVisits, formatTimeIST\)/)
  assert.match(src, /changeEventStatus\(event, 'cancelled'\)/)
  assert.match(src, /window\.confirm\(`Cancel "/)
  assert.match(src, /\.select\('id,status'\)/)                       // the change is confirmed by the database
  assert.match(src, /data\.length !== 1 \|\| data\[0\]\.status !== nextStatus/)
  assert.match(src, /setWeekVisits\(visits\.filter\(isPlannerVisit\)\)/)
})

// ---------- C21: safe record/remove and rescheduling history ----------

test('C21: Record visit goes through recordVisit only (no direct visit update or sale insert on the screen)', () => {
  const src = read('src/features/visits/VisitDetail.tsx')
  assert.match(src, /recordVisit\(supabase, \{/)
  assert.doesNotMatch(src, /\.from\('visits'\)\.update\(/)
  assert.doesNotMatch(src, /\.from\('sales'\)\.insert\(/)
  assert.doesNotMatch(src, /\.from\('follow_ups'\)\.insert\(/)
  assert.match(src, /ALREADY_RECORDED_MESSAGE/)
  assert.match(src, /if \(busy\) return/)
})

test('C21: recordVisit only updates a still-planned visit of this user and checks one row changed', () => {
  const src = read('src/lib/visitRecord.ts')
  const fn = src.slice(src.indexOf('export async function recordVisit'), src.indexOf('export type RemoveStopResult'))
  assert.match(fn, /\.eq\('user_id', input\.userId\)/)
  assert.match(fn, /\.eq\('status', 'planned'\)/)
  assert.ok(fn.indexOf("update.data.length !== 1") < fn.indexOf(".from('sales')"), 'row check before the sale')
})

test('C21: Remove on ROUTE goes through removePlannedStop (never deletes a recorded visit)', () => {
  const src = read('src/features/route/RoutePage.tsx')
  assert.match(src, /removePlannedStop\(supabase, userId, id\)/)
  assert.doesNotMatch(src, /\.delete\(\)/)
})

test('C21: recording keeps the rescheduling history line', () => {
  assert.match(read('src/features/visits/VisitDetail.tsx'), /notes: notesAfterRecording\(visit\.notes, notes\)/)
})

test('C21: Reschedule saves the history line with the shared helper', () => {
  const src = read('src/features/visits/RescheduleVisit.tsx')
  assert.match(src, /const marker = rescheduleMarker\(/)
  assert.match(src, /\.eq\('notes', marker\)/)
})

test('C21: My Week and the visit screen show history in plain words, not the raw stored text', () => {
  const week = read('src/features/myweek/MyWeekPage.tsx')
  assert.match(week, /visitNoteLines\(visit\.notes\)/)
  assert.doesNotMatch(week, /\{visit\.notes\}/)
  const detail = read('src/features/visits/VisitDetail.tsx')
  assert.doesNotMatch(detail, /\{visit\.notes\}/)
  assert.match(detail, /visitNoteLines\(pre\.lastVisit\.notes\)/)
})
