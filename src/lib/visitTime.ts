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

// Rescheduling default: keep the original visit's time only if it was inside working
// hours (start inclusive, end exclusive); otherwise suggest the start of the working day.
export function suggestRescheduleTime(originalClock: string | null, hours: { start: string; end: string }): string {
  if (isValidClock(originalClock) && originalClock >= hours.start && originalClock < hours.end) {
    return originalClock
  }
  return hours.start
}

// The day after a "YYYY-MM-DD" date.
export function nextDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
}
