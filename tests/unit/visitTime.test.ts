// C10: visit date/time rules. Run with: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isValidClock, buildPlannedStart, istClockOf, istDateOf, nextSlotToday,
  workingHours, suggestRescheduleTime, nextDay, DEFAULT_WORK_START,
  isTimeSlot, roundUpToSlot, SLOT_MESSAGE, SLOT_MINUTES,
  toClock12, fromClock12, HOUR_OPTIONS_12, MINUTE_OPTIONS,
} from '../../src/lib/visitTime.ts'

// India time = UTC + 5:30. Helper: an instant given as India clock time.
const ist = (date: string, clock: string) => new Date(`${date}T${clock}:00+05:30`)

// ---------- Default time for "Add stop" ----------

test('default add-stop time is the next 5-minute step in India time (C19)', () => {
  assert.equal(nextSlotToday(ist('2026-10-12', '08:12')), '08:15')
  assert.equal(nextSlotToday(ist('2026-10-12', '21:43')), '21:45')
  assert.equal(nextSlotToday(ist('2026-10-12', '08:58')), '09:00')
  assert.equal(nextSlotToday(ist('2026-10-12', '00:00')), '00:05')
})

test('exactly on a step moves to the next one (never "now")', () => {
  assert.equal(nextSlotToday(ist('2026-10-12', '08:15')), '08:20')
  assert.equal(nextSlotToday(ist('2026-10-12', '09:00')), '09:05')
})

test('late at night with no step left today: no default, the user must choose', () => {
  assert.equal(nextSlotToday(ist('2026-10-12', '23:55')), '')
  assert.equal(nextSlotToday(ist('2026-10-12', '23:59')), '')
  assert.equal(nextSlotToday(ist('2026-10-12', '23:54')), '23:55')
})

test('default uses India time even though the instant is stored in UTC', () => {
  // 02:42 UTC = 08:12 India time
  assert.equal(nextSlotToday(new Date('2026-10-12T02:42:00Z')), '08:15')
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

test('rescheduling keeps an in-hours original time, rounded UP to a 5-minute step (C19)', () => {
  const h = workingHours(null, null)
  assert.equal(suggestRescheduleTime('09:00', h), '09:00')
  assert.equal(suggestRescheduleTime('13:35', h), '13:35')
  assert.equal(suggestRescheduleTime('09:32', h), '09:35')
  assert.equal(suggestRescheduleTime('17:51', h), '17:55')
})

test('rounding past the end of the working day falls back to the start of the day', () => {
  const h = workingHours(null, null)                        // 09:00-18:00
  assert.equal(suggestRescheduleTime('17:56', h), '09:00')  // 18:00 is not before the end
  assert.equal(suggestRescheduleTime('17:59', h), '09:00')
})

test('rescheduling uses the salesperson\'s own working hours when saved', () => {
  const h = workingHours('07:30:00', '16:00:00')
  assert.equal(suggestRescheduleTime('07:43', h), '07:45')
  assert.equal(suggestRescheduleTime('17:00', h), '07:30')
})

test('an off-step working-day start is rounded up to the next step', () => {
  const h = workingHours('08:42:00', '17:00:00')
  assert.equal(suggestRescheduleTime('01:07', h), '08:45')
  assert.equal(suggestRescheduleTime(null, h), '08:45')
  assert.equal(suggestRescheduleTime('08:51', h), '08:55')  // inside hours, rounded up
})

test('a working day with no step inside it falls back safely to 09:00', () => {
  const h = workingHours('17:56:00', '17:59:00')
  assert.equal(suggestRescheduleTime('17:57', h), '09:00')
  assert.equal(suggestRescheduleTime(null, h), '09:00')
})

test('every reschedule suggestion is a valid 5-minute step', () => {
  const hourSets = [workingHours(null, null), workingHours('07:30:00', '16:00:00'), workingHours('08:42:00', '17:00:00'), workingHours('17:56:00', '17:59:00')]
  for (const h of hourSets) {
    for (let mins = 0; mins < 24 * 60; mins += 7) {
      const t = `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
      assert.ok(isTimeSlot(suggestRescheduleTime(t, h)), `${t} with ${h.start}-${h.end}`)
    }
  }
})

// ---------- C19: 5-minute steps (replaces C17's 30-minute slots) ----------

test('the step is 5 minutes', () => {
  assert.equal(SLOT_MINUTES, 5)
})

test('only times on a 5-minute step are allowed', () => {
  for (const ok of ['00:00', '00:05', '14:05', '14:10', '14:15', '15:30', '23:55']) assert.equal(isTimeSlot(ok), true, ok)
  for (const bad of ['14:23', '15:29', '15:31', '00:01', '23:59', '', '3:30', '25:00', null, undefined]) {
    assert.equal(isTimeSlot(bad as string | null | undefined), false, String(bad))
  }
})

test('round up to the next step', () => {
  assert.equal(roundUpToSlot('14:23'), '14:25')
  assert.equal(roundUpToSlot('09:35'), '09:35')
  assert.equal(roundUpToSlot('09:56'), '10:00')
  assert.equal(roundUpToSlot('00:00'), '00:00')
  assert.equal(roundUpToSlot('23:55'), '23:55')
  assert.equal(roundUpToSlot('23:56'), null)   // no step left that day
  assert.equal(roundUpToSlot('bad'), null)
})

test('the add-stop default is always a step', () => {
  for (let mins = 0; mins < 24 * 60; mins += 7) {
    const clock = `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
    const t = nextSlotToday(ist('2026-10-12', clock))
    assert.ok(t === '' || isTimeSlot(t), `${clock} -> ${t}`)
  }
})

test('the safety-net message explains the rule plainly', () => {
  assert.match(SLOT_MESSAGE, /5-minute steps/)
})

// ---------- C19: 12-hour picker ----------

test('the picker offers hours 12, 1 ... 11 and minutes 00, 05 ... 55 only', () => {
  assert.deepEqual(HOUR_OPTIONS_12, ['12', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'])
  assert.deepEqual(MINUTE_OPTIONS, ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'])
})

test('24-hour times convert to 12-hour parts', () => {
  assert.deepEqual(toClock12('14:05'), { hour: '2', minute: '05', period: 'PM' })
  assert.deepEqual(toClock12('00:30'), { hour: '12', minute: '30', period: 'AM' })
  assert.deepEqual(toClock12('12:00'), { hour: '12', minute: '00', period: 'PM' })
  assert.deepEqual(toClock12('09:37'), { hour: '9', minute: '37', period: 'AM' })
  assert.equal(toClock12(''), null)
  assert.equal(toClock12('bad'), null)
})

test('12-hour parts convert back to the saved 24-hour format', () => {
  assert.equal(fromClock12('2', '05', 'PM'), '14:05')
  assert.equal(fromClock12('12', '30', 'AM'), '00:30')
  assert.equal(fromClock12('12', '00', 'PM'), '12:00')
  assert.equal(fromClock12('11', '55', 'PM'), '23:55')
  assert.equal(fromClock12('9', '10', 'AM'), '09:10')
})

test('an incomplete or not-offered choice gives no time (nothing is guessed)', () => {
  assert.equal(fromClock12('', '05', 'PM'), '')
  assert.equal(fromClock12('2', '', 'PM'), '')
  assert.equal(fromClock12('2', '05', ''), '')
  assert.equal(fromClock12('2', '23', 'PM'), '')   // 23 minutes is not a step
  assert.equal(fromClock12('13', '00', 'PM'), '')
  assert.equal(fromClock12('0', '00', 'AM'), '')
})

test('every picker choice is a valid step and survives a round trip', () => {
  const seen = new Set<string>()
  for (const p of ['AM', 'PM']) for (const h of HOUR_OPTIONS_12) for (const m of MINUTE_OPTIONS) {
    const t = fromClock12(h, m, p)
    assert.ok(isTimeSlot(t), `${h}:${m} ${p} -> ${t}`)
    assert.deepEqual(toClock12(t), { hour: h, minute: m, period: p })
    seen.add(t)
  }
  assert.equal(seen.size, 24 * 12)   // every 5-minute step of the day, exactly once
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
