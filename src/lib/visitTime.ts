// Visit date/time rules (C10). Pure functions, no imports, so Node's test runner can load them.
// All times are India time (Asia/Kolkata, +05:30), matching how visits are already stored.
// Used by ROUTE (add stop), RescheduleVisit and ChangeVisitTime. Tests: tests/unit/visitTime.test.ts

const IST = 'Asia/Kolkata'
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/
const DATE = /^\d{4}-\d{2}-\d{2}$/

// Used only when the profile has no valid working hours saved (matches onboarding's defaults).
export const DEFAULT_WORK_START = '09:00'
export const DEFAULT_WORK_END = '18:00'

export function isValidClock(time: string | null | undefined): time is string {
  return typeof time === 'string' && CLOCK.test(time)
}

// ---------------- 5-minute scheduling steps (C19, replaces C17's 30-minute slots) ----------------
// Product rule: every visit time that is SAVED (add stop, change time, reschedule) must be
// on a 5-minute step (3:00, 3:05, 3:10 ...). Existing records are never rounded or changed.
// The screens offer only these steps (TimeSelect), so the check below is a safety net.

export const SLOT_MINUTES = 5

export const SLOT_MESSAGE = 'Choose a time in 5-minute steps (for example 3:05 or 3:10).'

export function isTimeSlot(time: string | null | undefined): time is string {
  return isValidClock(time) && Number(time.slice(3, 5)) % SLOT_MINUTES === 0
}

// The first step at or after a time: 09:32 -> 09:35, 09:35 -> 09:35.
// Returns null if there is no step left that day (after 23:55).
export function roundUpToSlot(time: string): string | null {
  if (!isValidClock(time)) return null
  const [h, m] = time.split(':').map(Number)
  const mins = Math.ceil((h * 60 + m) / SLOT_MINUTES) * SLOT_MINUTES
  if (mins >= 24 * 60) return null
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
}

// ---------------- 12-hour display for the time picker (C19) ----------------

export type Period = 'AM' | 'PM'
export type Clock12 = { hour: string; minute: string; period: Period }

export const HOUR_OPTIONS_12 = ['12', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11']
export const MINUTE_OPTIONS = Array.from({ length: 60 / SLOT_MINUTES }, (_, i) =>
  String(i * SLOT_MINUTES).padStart(2, '0'))

// "14:05" -> { hour: '2', minute: '05', period: 'PM' }; "00:30" -> 12:30 AM; null if invalid.
export function toClock12(time: string | null | undefined): Clock12 | null {
  if (!isValidClock(time)) return null
  const h = Number(time.slice(0, 2))
  return { hour: String(h % 12 === 0 ? 12 : h % 12), minute: time.slice(3, 5), period: h < 12 ? 'AM' : 'PM' }
}

// { hour: '2', minute: '05', period: 'PM' } -> "14:05"; '' if any part is missing or not offered.
export function fromClock12(hour: string, minute: string, period: string): string {
  if (!HOUR_OPTIONS_12.includes(hour) || !MINUTE_OPTIONS.includes(minute)) return ''
  if (period !== 'AM' && period !== 'PM') return ''
  const h = (Number(hour) % 12) + (period === 'PM' ? 12 : 0)
  return `${String(h).padStart(2, '0')}:${minute}`
}

// "2026-10-12" + "09:30" -> "2026-10-12T09:30:00+05:30", or null if either part is invalid.
export function buildPlannedStart(date: string, time: string): string | null {
  if (!DATE.test(date) || !isValidClock(time)) return null
  const stamp = `${date}T${time}:00+05:30`
  const ms = new Date(stamp).getTime()
  if (!Number.isFinite(ms)) return null
  // Reject impossible dates (e.g. 2026-02-30) that JavaScript would silently roll over
  const roundTrip = new Intl.DateTimeFormat('en-CA', { timeZone: IST }).format(new Date(ms))
  return roundTrip === date ? stamp : null
}

// India clock time of a stored timestamp as "HH:MM", or null if missing/invalid.
export function istClockOf(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: IST, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d)
  const h = parts.find(p => p.type === 'hour')?.value
  const m = parts.find(p => p.type === 'minute')?.value
  return h && m ? `${h}:${m}` : null
}

// India calendar date of a stored timestamp as "YYYY-MM-DD", or null if missing/invalid.
export function istDateOf(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat('en-CA', { timeZone: IST }).format(d)
}

// Default for "Add stop": the next 5-minute step in India time, strictly after now
// (08:12 -> 08:15, 08:15 -> 08:20). Returns '' if the next step falls on
// tomorrow, so the salesperson must pick a time for today themselves.
export function nextSlotToday(now: Date = new Date()): string {
  const clock = istClockOf(now.toISOString())
  if (!clock) return ''
  const [h, m] = clock.split(':').map(Number)
  const next = (Math.floor((h * 60 + m) / SLOT_MINUTES) + 1) * SLOT_MINUTES
  if (next >= 24 * 60) return ''
  return `${String(Math.floor(next / 60)).padStart(2, '0')}:${String(next % 60).padStart(2, '0')}`
}

// Working hours from the profile ("09:00:00" style values), falling back to 09:00-18:00
// if missing or invalid (for example, an end time before the start time).
export function workingHours(start?: string | null, end?: string | null): { start: string; end: string } {
  const s = start?.slice(0, 5)
  const e = end?.slice(0, 5)
  if (isValidClock(s) && isValidClock(e) && s < e) return { start: s, end: e }
  return { start: DEFAULT_WORK_START, end: DEFAULT_WORK_END }
}

// Rescheduling default, always a valid 5-minute step (C10 + C19):
// - original time inside working hours (start inclusive, end exclusive): round it UP to a step
//   (09:32 -> 09:35), as long as that step is still before the end of the working day;
// - otherwise the first step at or after the start of the working day (08:42 -> 08:45);
// - if the working day has no step at all (e.g. 17:56-17:59), fall back to 09:00.
export function suggestRescheduleTime(originalClock: string | null, hours: { start: string; end: string }): string {
  const startSlot = roundUpToSlot(hours.start)
  const dayStart = startSlot && startSlot < hours.end ? startSlot : DEFAULT_WORK_START
  if (isValidClock(originalClock) && originalClock >= hours.start && originalClock < hours.end) {
    const slot = roundUpToSlot(originalClock)
    if (slot && slot < hours.end) return slot
  }
  return dayStart
}

// The day after a "YYYY-MM-DD" date.
export function nextDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
}
