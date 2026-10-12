// MY WEEK day plan (V1 reliability). Pure functions, no imports, so Node's test runner can load them.
// One list per day in time order: all-day events first, then timed events and visits by start time,
// then follow-ups (they have a due date but no time). Also finds clashes between timed items.
// Tests: tests/unit/weekPlan.test.ts

// Same planning default as ROUTE ("Expected visit duration: 15 minutes").
export const VISIT_MINUTES = 15

export type PlanEvent = {
  id: string
  title: string
  starts_at: string
  ends_at: string | null
  all_day: boolean
  status: string
}

export type PlanVisit = {
  id: string
  status: string
  planned_start: string
  name: string
}

export type PlanFollowUp = {
  id: string
  status: string
  due_date: string
}

export type PlanItem<E extends PlanEvent, V extends PlanVisit, F extends PlanFollowUp> =
  | { kind: 'event'; key: string; item: E }
  | { kind: 'visit'; key: string; item: V }
  | { kind: 'followup'; key: string; item: F }

const ms = (iso: string | null | undefined): number => {
  if (!iso) return NaN
  return new Date(iso).getTime()
}

// Visits that belong on the planner: still to do, or done (shown as completed).
// Cancelled, unavailable and rescheduled visits are not part of the plan for that day.
export function isPlannerVisit(visit: { status: string }): boolean {
  return visit.status === 'planned' || visit.status === 'visited'
}

const isOpenEvent = (e: { status: string }) =>
  !['cancelled', 'completed', 'complete', 'done'].includes(e.status.toLowerCase())

// One day's items in time order. Inputs must already be filtered to that day.
export function dayTimeline<E extends PlanEvent, V extends PlanVisit, F extends PlanFollowUp>(
  events: E[],
  visits: V[],
  followUps: F[]
): PlanItem<E, V, F>[] {
  const allDay = events.filter(e => e.all_day)
  const timed: { at: number; order: number; entry: PlanItem<E, V, F> }[] = []

  events.filter(e => !e.all_day).forEach((e, i) =>
    timed.push({ at: ms(e.starts_at), order: i, entry: { kind: 'event', key: `event-${e.id}`, item: e } }))
  visits.filter(isPlannerVisit).forEach((v, i) =>
    timed.push({ at: ms(v.planned_start), order: 10_000 + i, entry: { kind: 'visit', key: `visit-${v.id}`, item: v } }))

  // Earlier first; an unreadable time goes last; equal times keep events before visits (stable)
  timed.sort((a, b) => {
    const aBad = !Number.isFinite(a.at)
    const bBad = !Number.isFinite(b.at)
    if (aBad !== bBad) return aBad ? 1 : -1
    if (!aBad && a.at !== b.at) return a.at - b.at
    return a.order - b.order
  })

  return [
    ...allDay.map(e => ({ kind: 'event' as const, key: `event-${e.id}`, item: e })),
    ...timed.map(t => t.entry),
    ...followUps.map(f => ({ kind: 'followup' as const, key: `follow-up-${f.id}`, item: f })),
  ]
}

type Slot = { label: string; start: number; end: number }

// Clashes between items that are still to happen on one day: open timed events and planned visits.
// An event with no end time counts as a moment; a visit lasts VISIT_MINUTES.
// All-day events, cancelled or completed items and visits already done are never reported.
export function dayClashes(
  events: PlanEvent[],
  visits: PlanVisit[],
  clock: (iso: string) => string
): string[] {
  const slots: Slot[] = []

  for (const e of events) {
    if (e.all_day || !isOpenEvent(e)) continue
    const start = ms(e.starts_at)
    if (!Number.isFinite(start)) continue
    const endRaw = ms(e.ends_at)
    const end = Number.isFinite(endRaw) && endRaw > start ? endRaw : start
    slots.push({ label: `"${e.title}" (${clock(e.starts_at)})`, start, end })
  }

  for (const v of visits) {
    if (v.status !== 'planned') continue
    const start = ms(v.planned_start)
    if (!Number.isFinite(start)) continue
    slots.push({ label: `visit to ${v.name} (${clock(v.planned_start)})`, start, end: start + VISIT_MINUTES * 60_000 })
  }

  slots.sort((a, b) => a.start - b.start)

  const warnings: string[] = []
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const a = slots[i]
      const b = slots[j]
      if (b.start > a.end) break
      const overlap = a.start === b.start || (a.start < b.end && b.start < a.end)
      if (overlap) warnings.push(`Time clash: ${a.label} overlaps ${b.label}.`)
    }
  }
  return warnings
}
