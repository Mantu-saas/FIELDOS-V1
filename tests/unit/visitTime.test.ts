// C10: visit date/time rules. Run with: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isValidClock, buildPlannedStart, istClockOf, istDateOf, nextHalfHourToday,
  workingHours, suggestRescheduleTime, nextDay, DEFAULT_WORK_START,
} from '../../src/lib/visitTime.ts'

// India time = UTC + 5:30. Helper: an instant given as India clock time.
const ist = (date: string, clock: string) => new Date(`${date}T${clock}:00+05:30`)

// ---------- Default time for "Add stop" ----------

test('default add-stop time is the next half-hour in India time', () => {
  assert.equal(nextHalfHourToday(ist('2026-10-12', '08:10')), '08:30')
  assert.equal(nextHalfHourToday(ist('2026-10-12', '08:45')), '09:00')
  assert.equal(nextHalfHourToday(ist('2026-10-12', '00:00')), '00:30')
  assert.equal(nextHalfHourToday(ist('2026-10-12', '13:29')), '13:30')
})

test('exactly on a half-hour moves to the next one (never "now")', () => {
  assert.equal(nextHalfHourToday(ist('2026-10-12', '08:30')), '09:00')
  assert.equal(nextHalfHourToday(ist('2026-10-12', '09:00')), '09:30')
})

test('late at night with no half-hour left today: no default, the user must choose', () => {
  assert.equal(nextHalfHourToday(ist('2026-10-12', '23:30')), '')
  assert.equal(nextHalfHourToday(ist('2026-10-12', '23:59')), '')
  assert.equal(nextHalfHourToday(ist('2026-10-12', '23:29')), '23:30')
})

test('default uses India time even though the instant is stored in UTC', () => {
  // 02:40 UTC = 08:10 India time
  assert.equal(nextHalfHourToday(new Date('2026-10-12T02:40:00Z')), '08:30')
})

// ---------- Missing / invalid time validation ----------

test('missing or malformed times are rejected', () => {
  for (const bad of ['', '9:30', '24:00', '12:60', 'abc', null, undefined]) {
    assert.equal(isValidClock(bad as string | null | undefined), false, String(bad))
  }
  assert.equal(isValidClock('00:00'), true)
  assert.equal(isValidClock('23:59'), true)
})

test('planned start is built with the India offset, or null when invalid (no silent "now")', () => {
  assert.equal(buildPlannedStart('2026-10-12', '09:30'), '2026-10-12T09:30:00+05:30')
  assert.equal(buildPlannedStart('2026-10-12', ''), null)
  assert.equal(buildPlannedStart('2026-10-12', '25:00'), null)
  assert.equal(buildPlannedStart('12-10-2026', '09:30'), null)
  assert.equal(buildPlannedStart('2026-02-30', '09:30'), null)   // impossible date, not rolled into March
  assert.equal(buildPlannedStart('2026-12-31', '23:59'), '2026-12-31T23:59:00+05:30')
})

test('stored timestamps read back as the same India clock time and date', () => {
  const stamp = buildPlannedStart('2026-10-12', '09:35')!
  assert.equal(istClockOf(stamp), '09:35')
  assert.equal(istDateOf(stamp), '2026-10-12')
  // The real 1:07 AM case: 2026-10-11T19:37:00Z is 01:07 on 12 Oct in India
  assert.equal(istClockOf('2026-10-11T19:37:40Z'), '01:07')
  assert.equal(istDateOf('2026-10-11T19:37:40Z'), '2026-10-12')
  assert.equal(istClockOf(null), null)
  assert.equal(istClockOf('not a date'), null)
})

// ---------- Working hours and rescheduling defaults ----------

test('working hours come from the profile, with 09:00-18:00 as the fallback', () => {
  assert.deepEqual(workingHours('08:30:00', '17:30:00'), { start: '08:30', end: '17:30' })
  assert.deepEqual(workingHours(null, null), { start: '09:00', end: '18:00' })
  assert.deepEqual(workingHours('18:00:00', '09:00:00'), { start: '09:00', end: '18:00' }) // end before start
  assert.deepEqual(workingHours('bad', '18:00'), { start: '09:00', end: '18:00' })
  assert.equal(DEFAULT_WORK_START, '09:00')
})

test('rescheduling never carries over an out-of-hours time like 1:07 AM', () => {
  const h = workingHours(null, null)
  assert.equal(suggestRescheduleTime('01:07', h), '09:00')
  assert.equal(suggestRescheduleTime('08:59', h), '09:00')
  assert.equal(suggestRescheduleTime('18:00', h), '09:00')   // end is exclusive
  assert.equal(suggestRescheduleTime('22:15', h), '09:00')
})

test('rescheduling keeps an original time that is within working hours', () => {
  const h = workingHours(null, null)
  assert.equal(suggestRescheduleTime('09:00', h), '09:00')
  assert.equal(suggestRescheduleTime('09:35', h), '09:35')
  assert.equal(suggestRescheduleTime('17:59', h), '17:59')
})

test('rescheduling uses the salesperson\'s own working hours when saved', () => {
  const h = workingHours('07:30:00', '16:00:00')
  assert.equal(suggestRescheduleTime('07:45', h), '07:45')
  assert.equal(suggestRescheduleTime('17:00', h), '07:30')
})

test('no original time: suggest the start of the working day', () => {
  assert.equal(suggestRescheduleTime(null, workingHours(null, null)), '09:00')
  assert.equal(suggestRescheduleTime('', workingHours(null, null)), '09:00')
})

test('next day handles month ends', () => {
  assert.equal(nextDay('2026-10-12'), '2026-10-13')
  assert.equal(nextDay('2026-10-31'), '2026-11-01')
  assert.equal(nextDay('2026-12-31'), '2027-01-01')
})
