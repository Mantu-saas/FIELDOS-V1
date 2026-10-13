// C21: rescheduling history on a visit (Fix 2).
// A replacement visit carries one history line in its notes:
//   "Rescheduled from 2026-10-11 (Cancelled)"
// The stored wording is unchanged from earlier versions, so existing visits and the
// "Existing planned visits from this record" lookup keep working.
// This file makes sure that line is KEPT when the replacement visit is recorded, and shows it
// in plain words ("Moved here from Sun 11 Oct. That visit was cancelled.").
//
// Pure functions, no imports, so Node's test runner can load them. Tests: tests/unit/visitHistory.test.ts

export type RescheduleOutcome = 'Unavailable' | 'Cancelled' | 'Rescheduled'

export type RescheduleHistory = { fromDate: string; outcome: RescheduleOutcome }

const MARKER = /^Rescheduled from (\d{4}-\d{2}-\d{2}) \((Unavailable|Cancelled|Rescheduled)\)$/

// The history line saved on a new replacement visit (same text as before C21).
export function rescheduleMarker(originalDate: string, outcomeLabel: string): string {
  return `Rescheduled from ${originalDate} (${outcomeLabel})`
}

// Splits saved notes into the history line (if the first line is one) and the salesperson's own note.
export function splitVisitNotes(notes: string | null | undefined): {
  history: RescheduleHistory | null
  historyLine: string | null
  note: string | null
} {
  const text = (notes ?? '').trim()
  if (!text) return { history: null, historyLine: null, note: null }

  const newline = text.indexOf('\n')
  const first = (newline === -1 ? text : text.slice(0, newline)).trim()
  const rest = newline === -1 ? '' : text.slice(newline + 1).trim()
  const match = first.match(MARKER)

  if (!match) return { history: null, historyLine: null, note: text }

  return {
    history: { fromDate: match[1], outcome: match[2] as RescheduleOutcome },
    historyLine: first,
    note: rest || null
  }
}

// Notes to save when a visit is recorded: the history line (if any) stays first,
// followed by whatever the salesperson typed. Nothing typed keeps just the history line.
export function notesAfterRecording(existingNotes: string | null | undefined, typedNote: string | null | undefined): string | null {
  const { historyLine } = splitVisitNotes(existingNotes)
  const typed = (typedNote ?? '').trim()
  if (historyLine && typed) return `${historyLine}\n${typed}`
  return historyLine ?? (typed || null)
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// "2026-10-11" -> "Sun 11 Oct" (a calendar date, so no time zone is involved)
export function shortDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const day = new Date(Date.UTC(y, m - 1, d))
  if (Number.isNaN(day.getTime())) return date
  return `${WEEKDAYS[day.getUTCDay()]} ${day.getUTCDate()} ${MONTHS[day.getUTCMonth()]}`
}

const OUTCOME_TEXT: Record<RescheduleOutcome, string> = {
  Cancelled: 'That visit was cancelled.',
  Unavailable: 'The customer was unavailable that day.',
  Rescheduled: 'That visit was marked as rescheduled.'
}

// "Moved here from Sun 11 Oct. That visit was cancelled."
export function rescheduleHistoryText(history: RescheduleHistory): string {
  return `Moved here from ${shortDay(history.fromDate)}. ${OUTCOME_TEXT[history.outcome]}`
}

// The lines to show under a visit: the history in plain words, then the salesperson's note.
export function visitNoteLines(notes: string | null | undefined): string[] {
  const { history, note } = splitVisitNotes(notes)
  const lines: string[] = []
  if (history) lines.push(rescheduleHistoryText(history))
  if (note) lines.push(note)
  return lines
}
