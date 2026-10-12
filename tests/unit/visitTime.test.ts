// C10: visit date/time rules. Run with: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isValidClock, buildPlannedStart, istClockOf, istDateOf, nextHalfHourToday,
  workingHours, suggestRescheduleTime, nextDay, DEFAULT_WORK_START,
  isHalfHourSlot, roundUpToSlot, SLOT_MESSAGE,
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

test('rescheduling keeps an in-hours original time, rounded UP to a half-hour slot (C17)', () => {
  const h = workingHours(null, null)
  assert.equal(suggestRescheduleTime('09:00', h), '09:00')
  assert.equal(suggestRescheduleTime('13:30', h), '13:30')
  assert.equal(suggestRescheduleTime('09:35', h), '10:00')
  assert.equal(suggestRescheduleTime('17:29', h), '17:30')
})

test('rounding past the end of the working day falls back to the start of the day', () => {
  const h = workingHours(null, null)                        // 09:00-18:00
  assert.equal(suggestRescheduleTime('17:45', h), '09:00')  // 18:00 is not before the end
  assert.equal(suggestRescheduleTime('17:59', h), '09:00')
})

test('rescheduling uses the salesperson\'s own working hours when saved', () => {
  const h = workingHours('07:30:00', '16:00:00')
  assert.equal(suggestRescheduleTime('07:45', h), '08:00')
  assert.equal(suggestRescheduleTime('17:00', h), '07:30')
})

test('an off-slot working-day start is rounded up to the next slot', () => {
  const h = workingHours('08:45:00', '17:00:00')
  assert.equal(suggestRescheduleTime('01:07', h), '09:00')
  assert.equal(suggestRescheduleTime(null, h), '09:00')
  assert.equal(suggestRescheduleTime('08:50', h), '09:00')  // inside hours, rounded up
})

test('a working day with no slot inside it falls back safely to 09:00', () => {
  const h = workingHours('17:45:00', '18:00:00')
  assert.equal(suggestRescheduleTime('17:50', h), '09:00')
  assert.equal(suggestRescheduleTime(null, h), '09:00')
})

test('every reschedule suggestion is a valid half-hour slot', () => {
  const hourSets = [workingHours(null, null), workingHours('07:30:00', '16:00:00'), workingHours('08:45:00', '17:00:00'), workingHours('17:45:00', '18:00:00')]
  for (const h of hourSets) {
    for (let mins = 0; mins < 24 * 60; mins += 7) {
      const t = `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
      assert.ok(isHalfHourSlot(suggestRescheduleTime(t, h)), `${t} with ${h.start}-${h.end}`)
    }
  }
})

// ---------- C17: 30-minute slots ----------

test('only :00 and :30 count as half-hour slots', () => {
  for (const ok of ['00:00', '00:30', '15:00', '15:30', '23:30']) assert.equal(isHalfHourSlot(ok), true, ok)
  for (const bad of ['15:12', '15:29', '15:31', '00:01', '23:59', '', '3:30', '25:00', null, undefined]) {
    assert.equal(isHalfHourSlot(bad as string | null | undefined), false, String(bad))
  }
})

test('round up to the next slot', () => {
  assert.equal(roundUpToSlot('09:35'), '10:00')
  assert.equal(roundUpToSlot('09:30'), '09:30')
  assert.equal(roundUpToSlot('09:01'), '09:30')
  assert.equal(roundUpToSlot('00:00'), '00:00')
  assert.equal(roundUpToSlot('23:30'), '23:30')
  assert.equal(roundUpToSlot('23:45'), null)   // no slot left that day
  assert.equal(roundUpToSlot('bad'), null)
})

test('the add-stop default is always a slot', () => {
  for (let mins = 0; mins < 24 * 60; mins += 7) {
    const clock = `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
    const t = nextHalfHourToday(ist('2026-10-12', clock))
    assert.ok(t === '' || isHalfHourSlot(t), `${clock} -> ${t}`)
  }
})

test('the slot message explains the rule plainly', () => {
  assert.match(SLOT_MESSAGE, /hour or half-hour/)
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
