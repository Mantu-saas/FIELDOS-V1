// COACH planning rules: today's priorities, customer suggestions and protected home time.
// Pure functions with no imports, so Node's test runner can load this file directly.
// Used by src/features/coach/CoachPage.tsx. Tests: tests/unit/coachPlan.test.ts
//
// Honesty rules built into every function here:
// - Only saved data is used: visits, follow-ups, customers, sales, personal events, profile times.
// - Travel time and distance are NOT stored in FieldOS, so nothing here claims a journey fits.
// - A visit is assumed to last PLAN_VISIT_MINUTES (the same planning default ROUTE shows).
// - Nothing is invented: no urgency, availability, customer intent or revenue prediction.

export const PLAN_VISIT_MINUTES = 15

// Minutes since midnight -> "8:05 PM"
export function clockText(mins: number): string {
  const m = ((Math.round(mins) % 1440) + 1440) % 1440
  const h24 = Math.floor(m / 60)
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${String(m % 60).padStart(2, '0')} ${h24 >= 12 ? 'PM' : 'AM'}`
}

// A time the user typed in a question, e.g. "home by 9 30 pm", "before 21 00", "by 8".
// Works on the normalised question (lower case, ":" already turned into a space).
// Without AM/PM, 1-11 o'clock is read as PM (a home or event time in the evening), and the
// caller says so. Returns null when no clear time is given.
export function parseQuestionTime(q: string): { mins: number; assumedPm: boolean } | null {
  const m = q.match(/\b(?:by|before|at|till|until|reach\w*)\s+(\d{1,2})(?:\s+(\d{2}))?\s*(am|pm)?\b/)
  if (!m) return null
  let h = Number(m[1])
  const min = m[2] ? Number(m[2]) : 0
  if (h > 23 || min > 59) return null
  let assumedPm = false
  if (m[3] === 'pm' && h < 12) h += 12
  else if (m[3] === 'am' && h === 12) h = 0
  else if (!m[3] && h >= 1 && h <= 11) { h += 12; assumedPm = true }
  return { mins: h * 60 + min, assumedPm }
}

/* ------------------------------------------------------------------ */
/* Protected home time and personal commitments                        */
/* ------------------------------------------------------------------ */

export type PlanVisit = {
  id: string
  name: string
  priority: number | null       // 1 = highest, as saved on the customer; null = not set
  startMin: number              // India time, minutes since midnight of that day
}

export type PlanCommitment = {
  title: string
  allDay: boolean
  startMin: number | null       // null for all-day events
  endMin: number | null         // null when no end time is saved
  location: string | null
}

export type VisitVerdict = {
  visit: PlanVisit
  action: 'keep' | 'call' | 'move'
  reason: string
}

export type HomePlan = {
  // The first fixed time you must be free by: a personal event's start, or your home time
  mustReach: { label: string; mins: number; kind: 'event' | 'home' } | null
  verdicts: VisitVerdict[]
  warnings: string[]            // time conflicts and tight gaps
  notes: string[]               // missing data and assumptions
  fits: boolean                 // true when no remaining visit clashes with a commitment or home time
}

const prio = (p: number | null) => (p === null ? 'no priority set' : `priority ${p}`)

// Only visits still to come (status planned, not yet passed) should be passed in.
export function planAroundCommitments(input: {
  visits: PlanVisit[]
  commitments: PlanCommitment[]
  homeMins: number | null
  homeLabel: string             // e.g. "your home time" or "the home time you asked about"
  nowMins: number | null        // null when planning another day
}): HomePlan {
  const visits = input.visits.slice().sort((a, b) => a.startMin - b.startMin)
  const now = input.nowMins ?? -1
  const warnings: string[] = []
  const notes: string[] = []

  const timed = input.commitments
    .filter(c => !c.allDay && c.startMin !== null)
    .map(c => ({ ...c, start: c.startMin as number, end: c.endMin !== null && c.endMin > (c.startMin as number) ? c.endMin : null }))
    // Events already over are ignored; an event with no end counts until it starts
    .filter(c => (c.end ?? c.start) >= now)
    .sort((a, b) => a.start - b.start)

  for (const c of input.commitments.filter(c => c.allDay)) {
    notes.push(`"${c.title}" is saved as all-day, so I cannot tell when you must leave for it. Add a start time to it in My Week if it has one.`)
  }

  const home = input.homeMins !== null && input.homeMins > now ? input.homeMins : null
  if (input.homeMins !== null && home === null) {
    notes.push(`${cap(input.homeLabel)} (${clockText(input.homeMins)}) has already passed.`)
  }

  // The first fixed point still ahead: an event start, or home time
  const firstEvent = timed.find(c => c.start >= now)
  let mustReach: HomePlan['mustReach'] = null
  if (firstEvent && (home === null || firstEvent.start <= home)) {
    mustReach = { label: `"${firstEvent.title}"${firstEvent.location ? ` at ${firstEvent.location}` : ''}`, mins: firstEvent.start, kind: 'event' }
  } else if (home !== null) {
    mustReach = { label: input.homeLabel, mins: home, kind: 'home' }
  }

  const verdicts: VisitVerdict[] = []
  for (const v of visits) {
    const vEnd = v.startMin + PLAN_VISIT_MINUTES
    const clash: string[] = []

    for (const c of timed) {
      if (c.end !== null) {
        if (v.startMin < c.end && vEnd > c.start) {
          clash.push(`overlaps "${c.title}" (${clockText(c.start)}–${clockText(c.end)})`)
        }
      } else if (v.startMin <= c.start && vEnd > c.start) {
        clash.push(`would still be running when "${c.title}" starts at ${clockText(c.start)}`)
      } else if (v.startMin > c.start && v.startMin - c.start <= 120) {
        // No end time saved: the event is not treated as blocking the rest of the day,
        // but a visit soon after it starts may not be possible
        warnings.push(`${v.name} at ${clockText(v.startMin)} is ${v.startMin - c.start} min after "${c.title}" starts, and no end time is saved for "${c.title}". Check you can leave it in time, or add its end time in My Week.`)
      }
    }
    if (home !== null && vEnd > home) {
      clash.push(`would end after ${input.homeLabel} (${clockText(home)})`)
    }

    if (clash.length > 0) {
      const important = v.priority !== null && v.priority <= 2
      verdicts.push({
        visit: v,
        action: important ? 'move' : 'call',
        reason: `${clash[0]}; ${prio(v.priority)}` + (important
          ? ' — it matters, so move it to an earlier time or another day rather than lose it'
          : ' — phone the customer instead, or move it to another day'),
      })
      continue
    }

    // Fits on paper: report how much time is left before the next fixed point
    const nextFixed = [
      ...timed.filter(c => c.start >= vEnd).map(c => ({ at: c.start, label: `"${c.title}"` })),
      ...(home !== null && home >= vEnd ? [{ at: home, label: input.homeLabel }] : []),
    ].sort((a, b) => a.at - b.at)[0]
    let reason = `${prio(v.priority)}; fits before your commitments on the planned times`
    if (nextFixed) {
      const gap = nextFixed.at - vEnd
      reason = `${prio(v.priority)}; leaves ${gap} min after a ${PLAN_VISIT_MINUTES}-minute visit before ${nextFixed.label}`
      if (gap < 30) {
        warnings.push(`Tight: ${v.name} at ${clockText(v.startMin)} leaves only ${gap} min before ${nextFixed.label} (${clockText(nextFixed.at)}). Travel time is not saved, so confirm the journey.`)
      }
    }
    verdicts.push({ visit: v, action: 'keep', reason })
  }

  const changed = verdicts.filter(x => x.action !== 'keep')
  if (changed.length > 0 && mustReach) {
    warnings.unshift(`Your plan may make you miss ${mustReach.label} at ${clockText(mustReach.mins)}: ${changed.length} visit${changed.length === 1 ? ' does' : 's do'} not fit.`)
  } else if (changed.length > 0) {
    warnings.unshift(`${changed.length} visit${changed.length === 1 ? ' clashes' : 's clash'} with your saved commitments.`)
  }

  if (input.homeMins === null) {
    notes.push('No home time is saved. Set "preferred home time" in your profile, or ask e.g. "Can I get home by 9:30 pm?"')
  }
  if (visits.length > 0) {
    notes.push(`Visits are counted as ${PLAN_VISIT_MINUTES} minutes each (FieldOS's planning default). Travel time is not saved, so even a visit that "fits" needs the journey confirmed.`)
  }

  return { mustReach, verdicts, warnings, notes, fits: changed.length === 0 }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function homePlanText(plan: HomePlan): string {
  let r = ''
  if (plan.mustReach) {
    r += plan.mustReach.kind === 'event'
      ? `You need to reach ${plan.mustReach.label} by ${clockText(plan.mustReach.mins)}.\n`
      : `You want to be home by ${clockText(plan.mustReach.mins)}.\n`
  }

  if (plan.verdicts.length === 0) {
    r += 'No visits are still planned, so nothing in your work plan blocks this.\n'
  } else {
    r += plan.fits
      ? 'VERDICT: your remaining visits fit around your commitments on their planned times.\n'
      : 'VERDICT: your plan does not fit. Change it now, not at the last minute.\n'
    const group = (action: VisitVerdict['action'], title: string) => {
      const list = plan.verdicts.filter(v => v.action === action)
      if (list.length === 0) return
      r += `\n${title}\n`
      list.forEach(v => { r += `• ${v.visit.name} at ${clockText(v.visit.startMin)} — ${v.reason}\n` })
    }
    group('keep', 'KEEP')
    group('move', 'MOVE')
    group('call', 'CALL INSTEAD')
  }

  if (plan.warnings.length > 0) {
    r += '\nWARNINGS\n'
    plan.warnings.forEach(w => { r += `• ${w}\n` })
  }
  if (plan.notes.length > 0) {
    r += '\nWHAT I CANNOT SEE\n'
    plan.notes.forEach(n => { r += `• ${n}\n` })
  }
  return r
}

/* ------------------------------------------------------------------ */
/* Which customer deserves attention when nothing is scheduled          */
/* ------------------------------------------------------------------ */

export type CustomerFacts = {
  id: string
  name: string
  priority: number | null       // 1 = highest
  potential: number             // saved potential amount, 0 if none
  lastVisitDate: string | null  // YYYY-MM-DD of the last completed visit in the look-back window
  monthSales: number            // counted (not cancelled) sales this month
  phone: string | null
}

export type CustomerPick = { customer: CustomerFacts; reason: string; action: string }

const daysBetween = (from: string, to: string) =>
  Math.round((Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10)) -
    Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10))) / 86_400_000)

// Ranks customers by what is saved: priority (1 first), then potential amount, then the longest
// time since the last completed visit. Customers in `exclude` (already planned, already visited
// today, or already listed for a follow-up) are left out. If the saved data cannot tell customers
// apart, no customer is recommended and `missing` says what to add.
export function suggestCustomers(
  list: CustomerFacts[],
  opts: { today: string; exclude: Set<string>; lookBackDays: number; money: (n: number) => string; max?: number }
): { picks: CustomerPick[]; missing: string | null } {
  if (list.length === 0) {
    return { picks: [], missing: 'No active customers are saved yet. Add your customers in SALES → Customers, with a priority and potential amount, so I can rank them.' }
  }
  const pool = list.filter(c => !opts.exclude.has(c.id))
  if (pool.length === 0) {
    return { picks: [], missing: null }
  }

  const priorities = new Set(list.map(c => c.priority))
  const hasSignal =
    priorities.size > 1 ||
    list.some(c => c.potential > 0) ||
    list.some(c => c.lastVisitDate !== null) ||
    list.some(c => c.monthSales > 0)
  if (!hasSignal) {
    return {
      picks: [],
      missing: `All your customers have the same priority, no potential amount and no recent visits saved, so I cannot tell who matters most. Set priority (1 = most important) and potential in SALES → Customers.`,
    }
  }

  const ranked = pool.slice().sort((a, b) =>
    (a.priority ?? 99) - (b.priority ?? 99) ||
    b.potential - a.potential ||
    (a.lastVisitDate ?? '0000-00-00').localeCompare(b.lastVisitDate ?? '0000-00-00') ||
    a.name.localeCompare(b.name))

  const picks = ranked.slice(0, opts.max ?? 3).map(c => {
    const bits: string[] = []
    if (c.priority !== null) bits.push(c.priority === 1 ? 'priority 1 (your highest)' : `priority ${c.priority}`)
    if (c.potential > 0) bits.push(`potential ${opts.money(c.potential)}`)
    if (c.lastVisitDate) {
      const d = daysBetween(c.lastVisitDate, opts.today)
      bits.push(d === 0 ? 'visited today' : `last visited ${d} day${d === 1 ? '' : 's'} ago`)
    } else {
      bits.push(`no completed visit in the last ${opts.lookBackDays} days`)
    }
    bits.push(c.monthSales > 0 ? `${opts.money(c.monthSales)} sold this month` : 'no sale recorded this month')
    return {
      customer: c,
      reason: bits.join(', '),
      action: c.phone
        ? `Call ${c.name} to arrange a visit, then save it in ROUTE.`
        : `Arrange a visit with ${c.name} and save it in ROUTE (no phone number is saved for them).`,
    }
  })
  return { picks, missing: null }
}

/* ------------------------------------------------------------------ */
/* Today's priorities, most important first                             */
/* ------------------------------------------------------------------ */

export type PriorityItem = { priority: string; reason: string; action: string }

export type PriorityInput = {
  nowMins: number
  upcoming: { name: string; priority: number | null; startMin: number; nextAction: string | null }[]
  passed: { name: string }[]
  dueFollowUps: { name: string; action: string; dueDate: string; value: number }[]   // open, due today or overdue
  today: string
  suggestions: CustomerPick[]
  suggestionsMissing: string | null
  plan: HomePlan | null
  tomorrowFirst: { name: string; startMin: number; nextAction: string | null } | null
  tomorrowCount: number
  money: (n: number) => string
}

// Order (each step explained in the reason shown to the user):
// 0. A plan that does not fit a personal commitment or home time
// 1. A visit starting within the next 60 minutes (a fixed appointment)
// 2. Due or overdue follow-ups that carry an expected value, highest value first
// 3. The next visit, if it was not already first
// 4. Overdue follow-ups with no value, oldest first, then ones due today
// 5. The rest of today's visits
// 6. Visits whose time passed with no outcome recorded
// 7. With no visits or follow-ups: the customers that deserve attention
// 8. Preparing tomorrow
export function todayPriorities(input: PriorityInput): PriorityItem[] {
  const items: PriorityItem[] = []
  const { money } = input

  if (input.plan && !input.plan.fits) {
    const moves = input.plan.verdicts.filter(v => v.action === 'move').map(v => v.visit.name)
    const calls = input.plan.verdicts.filter(v => v.action === 'call').map(v => v.visit.name)
    const target = input.plan.mustReach
    items.push({
      priority: target ? `Protect ${target.label} at ${clockText(target.mins)}` : 'Fix today\'s time clash',
      reason: input.plan.warnings[0] ?? 'Some visits clash with your saved commitments.',
      action: [moves.length ? `Move ${moves.join(', ')}` : '', calls.length ? `call ${calls.join(', ')} instead of visiting` : '']
        .filter(Boolean).join('; ') + '. Ask "Can I get home on time?" for the full plan.',
    })
  }

  const visitItem = (v: PriorityInput['upcoming'][number], soon: boolean): PriorityItem => {
    const inMin = v.startMin - input.nowMins
    return {
      priority: `Visit ${v.name} at ${clockText(v.startMin)}`,
      reason: `${soon ? (inMin > 0 ? `your next planned visit, starting in ${inMin} min` : 'your next planned visit, starting now') : 'planned for today'}; ${prio(v.priority)}`,
      action: v.nextAction ? `Go prepared: ${v.nextAction}. Leave with a sale or a dated follow-up.` : 'Leave with a sale or a dated follow-up.',
    }
  }

  const upcoming = input.upcoming.slice().sort((a, b) => a.startMin - b.startMin)
  const first = upcoming[0]
  const firstSoon = first !== undefined && first.startMin - input.nowMins <= 60
  if (firstSoon) items.push(visitItem(first, true))

  const valued = input.dueFollowUps.filter(f => f.value > 0).sort((a, b) => b.value - a.value || a.dueDate.localeCompare(b.dueDate))
  valued.forEach(f => items.push({
    priority: `Follow up with ${f.name}`,
    reason: `"${f.action}" ${f.dueDate < input.today ? `overdue since ${f.dueDate}` : 'due today'}, expected ${money(f.value)} (the value you saved)`,
    action: `Call ${f.name} now; a call needs no travel.`,
  }))

  if (first && !firstSoon) items.push(visitItem(first, false))

  const unvalued = input.dueFollowUps.filter(f => f.value <= 0).sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  unvalued.forEach(f => items.push({
    priority: `Follow up with ${f.name}`,
    reason: `"${f.action}" ${f.dueDate < input.today ? `overdue since ${f.dueDate}` : 'due today'}; no expected value saved`,
    action: `Call ${f.name} and save the outcome or a new date.`,
  }))

  upcoming.slice(1).forEach(v => items.push(visitItem(v, false)))

  if (input.passed.length > 0) {
    const names = input.passed.map(p => p.name)
    items.push({
      priority: `Record the outcome for ${names.join(', ')}`,
      reason: `${names.length === 1 ? 'its' : 'their'} planned time has passed and no result is saved`,
      action: 'Open the stop in ROUTE and save Visited, Unavailable, Cancelled or Rescheduled.',
    })
  }

  if (upcoming.length === 0 && input.dueFollowUps.length === 0) {
    input.suggestions.forEach(p => items.push({
      priority: `Contact ${p.customer.name}`,
      reason: p.reason,
      action: p.action,
    }))
    if (input.suggestions.length === 0 && input.suggestionsMissing) {
      items.push({
        priority: 'Set up who matters most',
        reason: input.suggestionsMissing,
        action: 'Once priorities are saved, ask me again and I will rank your customers.',
      })
    }
  }

  if (input.tomorrowFirst) {
    items.push({
      priority: `Prepare for tomorrow: ${input.tomorrowFirst.name} at ${clockText(input.tomorrowFirst.startMin)}`,
      reason: `first of ${input.tomorrowCount} visit${input.tomorrowCount === 1 ? '' : 's'} saved for tomorrow`,
      action: input.tomorrowFirst.nextAction ? `Get ready: ${input.tomorrowFirst.nextAction}.` : 'Check what you need for it before you finish today.',
    })
  } else {
    items.push({
      priority: 'Plan tomorrow',
      reason: 'no visits are saved for tomorrow yet',
      action: 'Save at least the first visit in ROUTE before you finish today.',
    })
  }

  return items
}
