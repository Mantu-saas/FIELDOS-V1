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

// ---------------- 30-minute scheduling slots (C17) ----------------
// Product rule: every visit time that is SAVED (add stop, change time, reschedule) must be
// on the hour or half-hour. Existing records are never rounded or changed.

export const SLOT_MESSAGE = 'Choose a time on the hour or half-hour (for example 3:00 or 3:30).'

export function isHalfHourSlot(time: string | null | undefined): time is string {
  return isValidClock(time) && (time.endsWith(':00') || time.endsWith(':30'))
}

// The first slot at or after a time: 09:35 -> 10:00, 09:30 -> 09:30.
// Returns null if there is no slot left that day (after 23:30).
export function roundUpToSlot(time: string): string | null {
  if (!isValidClock(time)) return null
  const [h, m] = time.split(':').map(Number)
  const mins = Math.ceil((h * 60 + m) / 30) * 30
  if (mins >= 24 * 60) return null
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
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

// Default for "Add stop": the next half-hour in India time, strictly after now
// (08:10 -> 08:30, 08:30 -> 09:00). Returns '' if the next half-hour falls on
// tomorrow, so the salesperson must pick a time for today themselves.
export function nextHalfHourToday(now: Date = new Date()): string {
  const clock = istClockOf(now.toISOString())
  if (!clock) return ''
  const [h, m] = clock.split(':').map(Number)
  const next = (Math.floor((h * 60 + m) / 30) + 1) * 30
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

// Rescheduling default, always a valid half-hour slot (C10 + C17):
// - original time inside working hours (start inclusive, end exclusive): round it UP to a slot
//   (09:35 -> 10:00), as long as that slot is still before the end of the working day;
// - otherwise the first slot at or after the start of the working day (08:45 -> 09:00);
// - if the working day has no slot at all (e.g. 17:45-18:00), fall back to 09:00.
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
