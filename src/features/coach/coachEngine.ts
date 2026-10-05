// Rule-based Coach. Uses only the user's own recorded data. No AI, no invented facts, no guarantees.
import type { Customer, Profile, VisitRow } from '../../types'
import { rankCustomers, addDays, daysBetween, type SaleLite, type FU } from '../../lib/scoring'
import { computeTarget } from '../../lib/targetMath'
import { inr, monthStart } from '../../lib/format'

export type QId = 'tomorrow' | 'fourhours' | 'behind' | 'cancelled' | 'finish' | 'followup' | 'travel'
export type Answer = { lines: string[]; why: string; next: string; assumption?: string }
export type Ctx = {
  profile: Profile; today: string; nowMin: number
  customers: Customer[]; sales: SaleLite[]; lastVisit: Record<string, string>
  followUps: (FU & { action: string; name: string })[]
  todayVisits: VisitRow[]
  health: { energy: number | null; stress: number | null } | null
}

const MIN_PER_STOP = 60
export const fmtMin = (m: number) => {
  const h = Math.floor(m / 60) % 24, mm = m % 60
  return `${h % 12 === 0 ? 12 : h % 12}:${String(mm).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}
const toMin = (t: string | null) => { if (!t) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m }
const noData = (): Answer => ({ lines: ['You have no customers yet, so there is nothing to rank.'], why: 'Recommendations come only from your own records.', next: 'Add customers in SALES → Customers.' })

export const QUESTIONS: { id: QId; label: (p: Profile) => string }[] = [
  { id: 'tomorrow', label: () => 'Who should I visit tomorrow?' },
  { id: 'fourhours', label: () => 'I have four hours' },
  { id: 'behind', label: () => 'I am behind target' },
  { id: 'cancelled', label: () => 'A customer cancelled' },
  { id: 'finish', label: p => `Can I finish by ${fmtMin(toMin(p.preferred_home_time) ?? 19 * 60)}?` },
  { id: 'followup', label: () => 'Which follow-up matters most?' },
  { id: 'travel', label: () => 'How can I reduce wasted travel?' }
]

export function answer(q: QId, c: Ctx): Answer {
  const ranked = (day: string) => rankCustomers({ customers: c.customers, sales: c.sales, lastVisit: c.lastVisit, followUps: c.followUps, today: day })
  const list = (items: ReturnType<typeof ranked>) => items.map((s, i) => `${i + 1}. ${s.customer.name} (${s.reasons.join(', ')})`)
  const scoreOf = (id: string) => ranked(c.today).find(s => s.customer.id === id)?.score ?? 0
  const lowEnergy = c.health?.energy != null && c.health.energy <= 4

  if (c.customers.length === 0 && q !== 'finish' && q !== 'followup') return noData()

  if (q === 'tomorrow') {
    const top = ranked(addDays(c.today, 1)).slice(0, lowEnergy ? 2 : 3)
    return {
      lines: [...list(top), ...(lowEnergy ? ['Your latest check-in showed low energy, so I kept the list short.'] : [])],
      why: 'Ranked by potential, priority, follow-up dates, time since last visit and recent sales.',
      next: `Add ${top[0].customer.name} to tomorrow's route first.`
    }
  }

  if (q === 'fourhours') {
    const doneToday = new Set(c.todayVisits.filter(v => v.status === 'visited').map(v => v.customer_id))
    const n = Math.floor((4 * 60) / MIN_PER_STOP)
    const top = ranked(c.today).filter(s => !doneToday.has(s.customer.id)).slice(0, n)
    return {
      lines: list(top),
      why: 'These are your highest-scoring customers you have not already visited today.',
      next: `Start with ${top[0]?.customer.name ?? 'your top customer'}.`,
      assumption: `I assumed about ${MIN_PER_STOP} minutes per visit including travel, because I do not have your real travel times.`
    }
  }

  if (q === 'behind') {
    const start = monthStart(c.today)
    const valid = c.sales.filter(s => s.status !== 'cancelled' && s.sale_date >= start && s.sale_date <= c.today)
    const t = computeTarget({
      target: Number(c.profile.monthly_target), today: c.today,
      salesBeforeToday: valid.filter(s => s.sale_date < c.today).reduce((a, s) => a + Number(s.amount), 0),
      salesToday: valid.filter(s => s.sale_date === c.today).reduce((a, s) => a + Number(s.amount), 0)
    })
    const overdue = c.followUps.filter(f => f.due_date < c.today)
    const top = ranked(c.today).slice(0, 3)
    return {
      lines: [
        `Remaining: ${inr(t.remaining)} over ${t.remainingDays} selling days, so ${inr(t.required)} per day.`,
        `Your average so far: ${inr(t.current)} per day.`,
        overdue.length ? `Overdue follow-ups: ${overdue.length} (worth ${inr(overdue.reduce((a, f) => a + Number(f.expected_value), 0))}).` : 'No overdue follow-ups.',
        ...list(top)
      ],
      why: 'Plain arithmetic on your recorded sales, plus your highest-scoring customers. This is not a guarantee of reaching the target.',
      next: overdue.length ? `Clear the overdue follow-up with ${overdue[0].name} first.` : `Visit ${top[0].customer.name} next.`
    }
  }

  if (q === 'cancelled') {
    const onRoute = new Set(c.todayVisits.map(v => v.customer_id))
    const pool = ranked(c.today).filter(s => !onRoute.has(s.customer.id))
    if (pool.length === 0) return { lines: ['Every customer you have is already on today\'s route.'], why: 'Nobody else is available to swap in.', next: 'Use the free time for a follow-up call.' }
    return {
      lines: [`Best replacement: ${pool[0].customer.name} (${pool[0].reasons.join(', ')}).`, ...(pool[1] ? [`If travel is a problem, call ${pool[1].customer.name} instead.`] : [])],
      why: 'Highest-scoring customer not already on today\'s route.',
      next: `Add ${pool[0].customer.name} to today's route in ROUTE → Add stop.`
    }
  }

  if (q === 'finish') {
    const home = toMin(c.profile.preferred_home_time)
    if (home === null) return { lines: ['I do not have your home time.'], why: 'It is needed to check the day.', next: 'Set it in your profile.' }
    const pending = c.todayVisits.filter(v => v.status === 'planned')
    const assumption = `I assumed about ${MIN_PER_STOP} minutes per stop including travel.`
    if (pending.length === 0) return { lines: ['You have no pending stops on today\'s route.'], why: 'Nothing left to schedule.', next: 'Add a stop, or close the day in HEALTH → End of day.' }
    if (c.nowMin >= home) return { lines: [`It is already past your home time of ${fmtMin(home)}.`], why: 'Your chosen home time is protected.', next: `Keep only the single most valuable stop, call the rest, and move them to tomorrow.`, assumption }
    const finish = c.nowMin + pending.length * MIN_PER_STOP
    if (finish <= home) return { lines: [`Yes, likely. ${pending.length} stop(s) would end around ${fmtMin(finish)}.`], why: `That is before your home time of ${fmtMin(home)}.`, next: `Go to ${pending[0].customers?.name ?? 'your next stop'}.`, assumption }
    const fit = Math.max(Math.floor((home - c.nowMin) / MIN_PER_STOP), 0)
    const sorted = [...pending].sort((a, b) => scoreOf(b.customer_id) - scoreOf(a.customer_id))
    return {
      lines: [
        `Not with all ${pending.length} stops: they would end around ${fmtMin(finish)}.`,
        `Keep (${fit}): ${sorted.slice(0, fit).map(v => v.customers?.name).join(', ') || 'none'}`,
        `Call or move to tomorrow: ${sorted.slice(fit).map(v => v.customers?.name).join(', ')}`
      ],
      why: `Home time ${fmtMin(home)} is protected, so the lowest-scoring stops are the ones to drop.`,
      next: sorted[0] ? `Go to ${sorted[0].customers?.name} now.` : 'Pick your top stop.', assumption
    }
  }

  if (q === 'followup') {
    if (c.followUps.length === 0) return { lines: ['You have no open follow-ups.'], why: 'Nothing is waiting.', next: 'Record visits with a next action to create follow-ups.' }
    const sorted = [...c.followUps].sort((a, b) => {
      const ao = a.due_date < c.today ? 0 : 1, bo = b.due_date < c.today ? 0 : 1
      return ao - bo || Number(b.expected_value) - Number(a.expected_value) || a.due_date.localeCompare(b.due_date)
    })
    const f = sorted[0]
    const late = daysBetween(f.due_date, c.today)
    return {
      lines: sorted.slice(0, 3).map((x, i) => `${i + 1}. ${x.name}: ${x.action} (due ${x.due_date}${x.expected_value > 0 ? ', ' + inr(Number(x.expected_value)) : ''})`),
      why: late > 0 ? `Overdue by ${late} day(s); overdue ones come first, then the larger expected value.` : 'Nothing is overdue, so the larger expected value comes first.',
      next: `Contact ${f.name}: ${f.action}.`
    }
  }

  // travel
  const pending = c.todayVisits.filter(v => v.status === 'planned')
  if (pending.length === 0) return { lines: ['You have no pending stops today.'], why: 'There is no route to improve.', next: 'Add today\'s stops in ROUTE first.' }
  const sorted = [...pending].sort((a, b) => scoreOf(a.customer_id) - scoreOf(b.customer_id))
  const lowest = sorted.slice(0, Math.min(2, pending.length - 1)).map(v => v.customers?.name).filter(Boolean)
  return {
    lines: [
      'I cannot measure distances yet, because no paid maps service is connected.',
      'Tap "Navigate remaining stops" in ROUTE: Google Maps shows the real distances for all pending stops in one trip.',
      lowest.length ? `Call instead of travelling: ${lowest.join(', ')} (your lowest-scoring pending stops).` : 'With one stop left, there is nothing to cut.'
    ],
    why: 'Fewer low-value trips means less backtracking.',
    next: 'Open ROUTE and use the single Maps route for the remaining stops.'
  }
}
