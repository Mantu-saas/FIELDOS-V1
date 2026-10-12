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
  assert.match(src, /setTime\(nextHalfHourToday\(\)\)/)
  assert.doesNotMatch(src, /Planned time \(optional\)/)
})

test('C10: rescheduling uses the working-hours default and also serves "Rescheduled" visits', () => {
  const src = read('src/features/visits/RescheduleVisit.tsx')
  assert.match(src, /suggestRescheduleTime\(istClockOf\(iso\), hours\)/)
  assert.doesNotMatch(src, /istClock\(/)
  assert.match(src, /visit\.status === 'rescheduled'/)
  // existing safeguards are kept
  assert.match(src, /The new time must be in the future\./)
  assert.match(src, /already has a planned visit on/)
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

// ---------- C17: 30-minute slots in all three save flows ----------

const slotCheckBeforeSave = (file: string, fnStart: string, saveCall: RegExp) => {
  const src = read(file)
  const body = src.slice(src.indexOf(fnStart))
  const check = body.search(/if \(!isHalfHourSlot\(time\)\)/)
  const save = body.search(saveCall)
  assert.ok(check > 0, `${file}: slot check present`)
  assert.ok(save > 0, `${file}: save call present`)
  assert.ok(check < save, `${file}: slot check runs before the database save`)
  assert.ok(src.includes('SLOT_MESSAGE'), `${file}: shows the slot message`)
  assert.ok(src.includes('step={1800}'), `${file}: picker hint`)
}

test('C17: Add stop blocks off-slot times before inserting', () => {
  slotCheckBeforeSave('src/features/route/RoutePage.tsx', 'async function addStop', /\.from\('visits'\)\.insert\(/)
})

test('C17: Change time blocks off-slot times before any database call', () => {
  slotCheckBeforeSave('src/features/visits/ChangeVisitTime.tsx', 'async function save', /\.from\('visits'\)/)
})

test('C17: Reschedule blocks off-slot times before any database call', () => {
  slotCheckBeforeSave('src/features/visits/RescheduleVisit.tsx', 'async function saveVisit', /\.from\('visits'\)/)
})

test('C17: no database rule or migration was added (existing records untouched)', () => {
  const files = readdirSync(new URL('../../supabase/migrations/', import.meta.url))
  assert.ok(!files.some(f => /slot|half.?hour|interval/i.test(f)), files.join(', '))
})
