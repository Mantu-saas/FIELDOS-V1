// R3: which phone reminders are due right now. One set of rules, used in two places:
//   - the server (supabase/functions/reminders) decides what to send every 5 minutes
//   - the unit tests (tests/unit/reminderRules.test.ts)
// The server keeps an exact copy of this file (a test checks the copies match).
// Pure functions, no imports. Every time is India time (Asia/Kolkata).
//
// Rules:
//   visit   15 minutes before its planned time. Mentions any money to collect / open
//           follow-ups for that customer, so a payment is never forgotten at the clinic.
//   event   its own reminder (15 min, 30 min, 1 hour, 1 day before). "No reminder" and
//           all-day events get no timed alert (they are in the morning message).
//   morning one message with the day: 60 min before work start (default 8:30 AM).
//   evening 8:00 PM: what is left today, tomorrow's start, and a journey checklist
//           when tomorrow has travel.
// A reminder that is late (phone off, server busy) is still sent within its window,
// never hours later. Each reminder has a key; a key is sent only once. Moving an item to
// a new time gives it a new key, so the new time gets its own reminder.

export type RVisit = { id: string; customer_id: string; status: string; planned_start: string | null; name: string }
export type RFollowUp = { id: string; customer_id: string; due_date: string; action: string; expected_value: number; status: string; name: string }
export type REvent = { id: string; title: string; category: string; starts_at: string; all_day: boolean; status: string; reminder_minutes: number | null }

export type AlertAction = { action: 'done' | 'later'; title: string }
export type Alert = {
  key: string
  title: string
  body: string
  actions: AlertAction[]
  target: { kind: 'visit' | 'event'; id: string } | null
}

const IST = 'Asia/Kolkata'
export const VISIT_LEAD_MINUTES = 15
export const ITEM_WINDOW_MINUTES = 60
export const DIGEST_WINDOW_MINUTES = 180
export const DEFAULT_MORNING = 8 * 60 + 30
export const EVENING = 20 * 60
const TRAVEL_WORDS = /\b(travel|journey|trip|train|flight|bus|ticket|station|airport|tour|out ?station)\b/i

export function istDay(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: IST }).format(d)
}

export function istMinutes(d: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: IST, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d)
  return Number(parts.find(p => p.type === 'hour')?.value) * 60 + Number(parts.find(p => p.type === 'minute')?.value)
}

export function clock(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

export function nextDate(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
}

export function rupees(n: number): string {
  return '₹' + Math.round(n).toLocaleString('en-IN')
}

function time(iso: string | null): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : t
}

// Money and open tasks waiting at this customer (follow-ups due on or before the visit day)
export function collectNote(customerId: string, visitDay: string, followUps: RFollowUp[]): string {
  const open = followUps.filter(f => f.customer_id === customerId && f.status === 'open' && f.due_date <= visitDay)
  if (!open.length) return ''
  return open
    .map(f => (Number(f.expected_value) > 0 ? `Collect/ask ${rupees(Number(f.expected_value))}: ${f.action}` : `Also: ${f.action}`))
    .join('\n')
}

export function isTravel(e: REvent): boolean {
  return e.category === 'travel' || TRAVEL_WORDS.test(e.title)
}

// "09:30:00" -> morning message 60 minutes earlier (never before 6:00 AM); default 8:30 AM
export function morningMinutes(workStart: string | null | undefined): number {
  const m = /^([01]\d|2[0-3]):([0-5]\d)/.exec(workStart ?? '')
  if (!m) return DEFAULT_MORNING
  return Math.max(6 * 60, Number(m[1]) * 60 + Number(m[2]) - 60)
}

type DayData = {
  visits: RVisit[]
  followUps: RFollowUp[]
  events: REvent[]
}

function onDay<T>(items: T[], day: string, at: (x: T) => string | null): T[] {
  return items.filter(x => {
    const t = time(at(x))
    return t !== null && istDay(new Date(t)) === day
  })
}

function byTime<T>(items: T[], at: (x: T) => string | null): T[] {
  return [...items].sort((a, b) => (time(at(a)) ?? 0) - (time(at(b)) ?? 0))
}

export function morningMessage(day: string, data: DayData): { title: string; body: string } {
  const visits = byTime(onDay(data.visits, day, v => v.planned_start).filter(v => v.status === 'planned'), v => v.planned_start)
  const events = byTime(onDay(data.events, day, e => e.starts_at).filter(e => e.status === 'planned'), e => e.starts_at)
  const due = data.followUps.filter(f => f.status === 'open' && f.due_date <= day)
  const money = due.reduce((s, f) => s + Number(f.expected_value || 0), 0)

  const lines: string[] = []
  if (visits.length) {
    const first = visits[0]
    lines.push(`${visits.length} visit${visits.length === 1 ? '' : 's'}, first ${first.name} at ${clock(istMinutes(new Date(first.planned_start as string)))}`)
  }
  for (const e of events.slice(0, 3)) {
    lines.push(e.all_day ? `${e.title} (all day)` : `${e.title} at ${clock(istMinutes(new Date(e.starts_at)))}`)
  }
  if (events.length > 3) lines.push(`+${events.length - 3} more`)
  if (due.length) lines.push(`${due.length} follow-up${due.length === 1 ? '' : 's'} due${money > 0 ? `, ${rupees(money)} to collect/ask` : ''}`)

  if (!lines.length) return { title: 'Good morning', body: 'Nothing planned for today yet. Open Swayam and add your visits.' }
  return { title: 'Your day', body: lines.join('\n') }
}

export function eveningMessage(day: string, nowMs: number, data: DayData): { title: string; body: string } {
  const tomorrow = nextDate(day)
  const leftVisits = onDay(data.visits, day, v => v.planned_start).filter(v => v.status === 'planned')
  const leftEvents = onDay(data.events, day, e => e.starts_at).filter(e => e.status === 'planned' && (e.all_day || (time(e.starts_at) ?? 0) <= nowMs))
  const leftFollowUps = data.followUps.filter(f => f.status === 'open' && f.due_date <= day)
  const left = leftVisits.length + leftEvents.length + leftFollowUps.length

  const tVisits = byTime(onDay(data.visits, tomorrow, v => v.planned_start).filter(v => v.status === 'planned'), v => v.planned_start)
  const tEvents = byTime(onDay(data.events, tomorrow, e => e.starts_at).filter(e => e.status === 'planned'), e => e.starts_at)
  const trip = tEvents.find(isTravel)

  const lines: string[] = []
  if (left) lines.push(`${left} item${left === 1 ? '' : 's'} from today not done. Tick them or move them.`)
  if (trip) {
    lines.push(`Journey tomorrow: ${trip.title}${trip.all_day ? '' : ' at ' + clock(istMinutes(new Date(trip.starts_at)))}.`)
    lines.push('Ticket ready? Bag packed? Alarm set? Sleep early.')
  }
  if (tVisits.length) {
    const first = tVisits[0]
    lines.push(`Tomorrow: ${tVisits.length} visit${tVisits.length === 1 ? '' : 's'}, first ${first.name} at ${clock(istMinutes(new Date(first.planned_start as string)))}.`)
  }
  const otherEvents = tEvents.filter(e => e !== trip)
  if (otherEvents.length) lines.push(`Also tomorrow: ${otherEvents.slice(0, 2).map(e => e.title).join(', ')}${otherEvents.length > 2 ? '…' : ''}`)
  if (!tVisits.length && !tEvents.length) lines.push('Nothing planned for tomorrow yet. Plan it now in 2 minutes.')

  return { title: trip ? 'Get ready for tomorrow' : 'Evening check', body: lines.join('\n') }
}

export function remindersDue(input: {
  now: Date
  visits: RVisit[]
  followUps: RFollowUp[]
  events: REvent[]
  workStart: string | null | undefined
  sent: Set<string>
}): Alert[] {
  const nowMs = input.now.getTime()
  const today = istDay(input.now)
  const nowMin = istMinutes(input.now)
  const out: Alert[] = []
  const minute = 60_000

  for (const v of input.visits) {
    const at = time(v.planned_start)
    if (v.status !== 'planned' || at === null) continue
    const target = at - VISIT_LEAD_MINUTES * minute
    const until = Math.min(target + ITEM_WINDOW_MINUTES * minute, at + 30 * minute)
    if (nowMs < target || nowMs > until) continue
    const key = `visit:${v.id}:${at}`
    if (input.sent.has(key)) continue
    const note = collectNote(v.customer_id, istDay(new Date(at)), input.followUps)
    out.push({
      key,
      title: `${v.name} at ${clock(istMinutes(new Date(at)))}`,
      body: note || 'Time to leave for this visit.',
      actions: [{ action: 'later', title: '+30 min' }],
      target: { kind: 'visit', id: v.id }
    })
  }

  for (const e of input.events) {
    const at = time(e.starts_at)
    if (e.status !== 'planned' || at === null || e.all_day || e.reminder_minutes === null || e.reminder_minutes < 0) continue
    const target = at - e.reminder_minutes * minute
    if (nowMs < target || nowMs > target + ITEM_WINDOW_MINUTES * minute) continue
    const key = `event:${e.id}:${at}`
    if (input.sent.has(key)) continue
    const when = clock(istMinutes(new Date(at)))
    const dayWord = istDay(new Date(at)) === today ? '' : ' tomorrow'
    out.push({
      key,
      title: e.title,
      body: `At ${when}${dayWord}.` + (isTravel(e) && dayWord ? ' Ticket, bag and alarm ready?' : ''),
      actions: [{ action: 'done', title: 'Done' }, { action: 'later', title: '+30 min' }],
      target: { kind: 'event', id: e.id }
    })
  }

  const data = { visits: input.visits, followUps: input.followUps, events: input.events }
  const morning = morningMinutes(input.workStart)
  if (nowMin >= morning && nowMin <= morning + DIGEST_WINDOW_MINUTES && !input.sent.has(`morning:${today}`)) {
    out.push({ key: `morning:${today}`, ...morningMessage(today, data), actions: [], target: null })
  }
  if (nowMin >= EVENING && nowMin <= EVENING + DIGEST_WINDOW_MINUTES && !input.sent.has(`evening:${today}`)) {
    out.push({ key: `evening:${today}`, ...eveningMessage(today, nowMs, data), actions: [], target: null })
  }

  return out
}
