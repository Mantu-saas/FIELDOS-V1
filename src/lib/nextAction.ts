// R1: the one "Next action" shown at the top of TODAY.
// Fixed, transparent rules on the user's own saved data. Nothing is guessed: when data is
// missing the card says so instead. Checked top to bottom; the first rule that matches wins:
//   1. a planned visit today whose time passed 15+ minutes ago with no result -> record it
//   2. within 60 minutes of home time (or past it)                           -> wrap up
//   3. a follow-up overdue or due today                                       -> do it
//   4. the next planned visit today                                           -> go there
//   5. nothing left                                                           -> plan tomorrow
// Pure functions, no imports, so Node's test runner can load them. Tests: tests/unit/nextAction.test.ts

export type NextActionVisit = { status: string; planned_start: string | null; name: string }
export type NextActionFollowUp = { due_date: string; action: string; name: string }
// R3: personal events / quick-add tasks also count, so the card never says "done" while a task is still ahead
export type NextActionEvent = { title: string; starts_at: string; all_day: boolean; status: string }

export type NextAction = {
  kind: 'record' | 'wrap_up' | 'follow_up' | 'visit' | 'task' | 'done'
  title: string
  reason: string
  visitsLeft: number
  followUpsDue: number
}

const IST = 'Asia/Kolkata'
const GRACE_MINUTES = 15
const WRAP_UP_MINUTES = 60

function istParts(d: Date): { date: string; minutes: number } {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: IST }).format(d)
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: IST, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d)
  const h = Number(parts.find(p => p.type === 'hour')?.value)
  const m = Number(parts.find(p => p.type === 'minute')?.value)
  return { date, minutes: h * 60 + m }
}

function clock(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

// "18:30:00" or "18:30" -> 1110 minutes; null when missing or invalid
export function homeMinutes(homeTime: string | null | undefined): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)/.exec(homeTime ?? '')
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = from.split('-').map(Number)
  const [y2, m2, d2] = to.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 864e5)
}

export function nextAction(input: {
  now: Date
  visits: NextActionVisit[]        // today's and tomorrow's visits, any status
  followUps: NextActionFollowUp[]  // open follow-ups due today or earlier
  homeTime: string | null | undefined
  events?: NextActionEvent[]       // R3: today's personal events / tasks
}): NextAction {
  const now = istParts(input.now)
  const today = now.date

  const timed = input.visits
    .filter(v => v.planned_start && !Number.isNaN(new Date(v.planned_start).getTime()))
    .map(v => ({ ...v, at: istParts(new Date(v.planned_start as string)) }))
    .sort((a, b) => a.at.date.localeCompare(b.at.date) || a.at.minutes - b.at.minutes)

  const plannedToday = timed.filter(v => v.status === 'planned' && v.at.date === today)
  const plannedLater = timed.filter(v => v.status === 'planned' && v.at.date > today)
  const due = input.followUps
    .filter(f => f.due_date <= today)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))

  const base = { visitsLeft: plannedToday.length, followUpsDue: due.length }

  // 1. A visit time has passed with no result recorded
  const missed = plannedToday.find(v => v.at.minutes < now.minutes - GRACE_MINUTES)
  if (missed) {
    return { ...base, kind: 'record', title: `Record the result of ${missed.name}`, reason: `Planned for ${clock(missed.at.minutes)}; no result recorded yet.` }
  }

  // 2. Close to (or past) home time
  const home = homeMinutes(input.homeTime)
  if (home !== null && now.minutes >= home - WRAP_UP_MINUTES) {
    const first = plannedLater[0]
    const when = now.minutes < home
      ? `Home time ${clock(home)} is in ${home - now.minutes} minute${home - now.minutes === 1 ? '' : 's'}.`
      : `Your home time (${clock(home)}) has passed.`
    const tomorrow = first
      ? ` Tomorrow starts with ${first.name} at ${clock(first.at.minutes)}.`
      : ' Nothing is planned for tomorrow yet.'
    return { ...base, kind: 'wrap_up', title: 'Wrap up for today', reason: when + tomorrow }
  }

  // 3. A follow-up overdue or due today
  const f = due[0]
  if (f) {
    const late = daysBetween(f.due_date, today)
    return {
      ...base,
      kind: 'follow_up',
      title: `${f.name}: ${f.action}`,
      reason: late > 0 ? `Follow-up overdue by ${late} day${late === 1 ? '' : 's'}.` : 'Follow-up due today.',
    }
  }

  // 4. The next planned visit today, or a task that comes before it (R3)
  const next = plannedToday.find(v => v.at.minutes >= now.minutes - GRACE_MINUTES) ?? plannedToday[0]
  const task = (input.events ?? [])
    .filter(e => e.status === 'planned' && !e.all_day && !Number.isNaN(new Date(e.starts_at).getTime()))
    .map(e => ({ ...e, at: istParts(new Date(e.starts_at)) }))
    .filter(e => e.at.date === today && e.at.minutes >= now.minutes - GRACE_MINUTES)
    .sort((a, b) => a.at.minutes - b.at.minutes)[0]
  if (task && (!next || task.at.minutes < next.at.minutes)) {
    return { ...base, kind: 'task', title: `${task.title} at ${clock(task.at.minutes)}`, reason: 'Next thing in your checklist today.' }
  }
  if (next) {
    const left = plannedToday.length
    return { ...base, kind: 'visit', title: `Go to ${next.name} at ${clock(next.at.minutes)}`, reason: `${left} visit${left === 1 ? '' : 's'} left today.` }
  }

  // 5. Nothing left
  return { ...base, kind: 'done', title: "Today's plan is done", reason: 'No visits left and no follow-ups due. Plan tomorrow: ROUTE, then Next ›.' }
}
