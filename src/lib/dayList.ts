// R3: one checklist for a day, built from what is already saved. Nothing is entered twice:
//   visits     (ROUTE)      -> at their time; shows money/tasks waiting at that customer
//   personal events (My Week / Quick add) -> at their time, or "Anytime" when all-day
//   follow-ups (due that day, or overdue when the day is today) -> "Anytime"
// Pure functions, no imports. Tests: tests/unit/dayList.test.ts

export type DLVisit = { id: string; customer_id: string; status: string; planned_start: string | null; name: string }
export type DLFollowUp = { id: string; customer_id: string; due_date: string; action: string; expected_value: number; status: string; name: string }
export type DLEvent = { id: string; title: string; category: string; starts_at: string; ends_at: string | null; all_day: boolean; status: string }

export type DayItem = {
  kind: 'visit' | 'event' | 'follow_up'
  id: string
  minutes: number | null      // India time of day; null = anytime
  title: string
  detail: string
  done: boolean
  late: boolean
}

const IST = 'Asia/Kolkata'
const LATE_GRACE = 15

function istDay(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: IST }).format(new Date(iso))
}
function istMin(iso: string): number {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: IST, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso))
  return Number(p.find(x => x.type === 'hour')?.value) * 60 + Number(p.find(x => x.type === 'minute')?.value)
}
function money(n: number): string {
  return '₹' + Math.round(n).toLocaleString('en-IN')
}

const VISIT_RESULT: Record<string, string> = {
  visited: 'Visited',
  unavailable: 'Doctor not available',
  cancelled: 'Cancelled',
  rescheduled: 'Rescheduled'
}

export function buildDayList(input: {
  day: string
  today: string
  nowMinutes: number
  visits: DLVisit[]
  followUps: DLFollowUp[]
  events: DLEvent[]
}): DayItem[] {
  const { day, today } = input
  const items: DayItem[] = []

  const openFor = (customerId: string) =>
    input.followUps.filter(f => f.customer_id === customerId && f.status === 'open' && f.due_date <= day)

  for (const v of input.visits) {
    if (!v.planned_start || Number.isNaN(Date.parse(v.planned_start)) || istDay(v.planned_start) !== day) continue
    const done = v.status !== 'planned'
    const waiting = openFor(v.customer_id)
    const toCollect = waiting.reduce((s, f) => s + Number(f.expected_value || 0), 0)
    const detail = done
      ? VISIT_RESULT[v.status] ?? v.status
      : waiting.length
        ? (toCollect > 0 ? `Collect/ask ${money(toCollect)} · ` : '') + waiting.map(f => f.action).join(' · ')
        : 'Visit'
    items.push({ kind: 'visit', id: v.id, minutes: istMin(v.planned_start), title: v.name, detail, done, late: false })
  }

  for (const e of input.events) {
    if (e.status === 'cancelled' || istDay(e.starts_at) !== day) continue
    items.push({
      kind: 'event',
      id: e.id,
      minutes: e.all_day ? null : istMin(e.starts_at),
      title: e.title,
      detail: e.category === 'work' ? 'Task' : e.category.charAt(0).toUpperCase() + e.category.slice(1),
      done: e.status === 'completed',
      late: false
    })
  }

  for (const f of input.followUps) {
    const show = day === today ? f.due_date <= day : f.due_date === day
    if (!show || (f.status !== 'open' && !(f.status === 'done' && f.due_date === day))) continue
    const overdue = f.status === 'open' && f.due_date < today
    items.push({
      kind: 'follow_up',
      id: f.id,
      minutes: null,
      title: `${f.name}: ${f.action}`,
      detail: (Number(f.expected_value) > 0 ? money(Number(f.expected_value)) + ' · ' : '') + (overdue ? `Overdue since ${f.due_date}` : 'Follow-up'),
      done: f.status === 'done',
      late: overdue
    })
  }

  for (const it of items) {
    if (!it.done && it.minutes !== null && day === today && it.minutes < input.nowMinutes - LATE_GRACE) it.late = true
    if (!it.done && day < today) it.late = true
  }

  // Anytime items first, then by time; done items stay in place but are shown ticked
  return items.sort((a, b) => {
    if ((a.minutes === null) !== (b.minutes === null)) return a.minutes === null ? -1 : 1
    return (a.minutes ?? 0) - (b.minutes ?? 0) || a.title.localeCompare(b.title)
  })
}

export function progress(items: DayItem[]): { done: number; total: number } {
  return { done: items.filter(i => i.done).length, total: items.length }
}
