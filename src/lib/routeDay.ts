// R2: ROUTE can show any day, not only today.
// Rules: stops can be added for today or a future day; a visit can be recorded on its own day
// or later (never ahead of time); past days are for looking back.
// Pure functions, no imports, so Node's test runner can load them. Tests: tests/unit/routeDay.test.ts

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function utc(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

// "2026-10-13" + 1 -> "2026-10-14" (calendar dates, no time zone involved)
export function shiftDay(date: string, days: number): string {
  return new Date(utc(date) + days * 864e5).toISOString().slice(0, 10)
}

// "Today", "Tomorrow", "Yesterday", or "Thu 16 Oct"
export function dayLabel(day: string, today: string): string {
  const diff = Math.round((utc(day) - utc(today)) / 864e5)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  const d = new Date(utc(day))
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

// Planning: stops can be added for today or any later day
export function canAddStopOn(day: string, today: string): boolean {
  return day >= today
}

// Recording: a visit can be recorded on its day or afterwards, never in advance
export function canRecordOn(day: string, today: string): boolean {
  return day <= today
}
