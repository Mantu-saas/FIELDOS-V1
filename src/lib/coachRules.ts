// COACH "best next move" rules (C12). Pure functions only, so they can be unit-tested.
// Used by src/features/coach/CoachPage.tsx (target answer). Tests: tests/unit/coachRules.test.ts
// No imports on purpose: the money formatter is passed in, so Node's test runner can load this file directly.

export type FollowUpLike = {
  customer_id: string
  due_date: string                       // YYYY-MM-DD
  expected_value: number | string | null
}

export type CustomerLike = {
  id: string
  potential_amount: number | string | null
}

const value = (f: FollowUpLike) => Number(f.expected_value) || 0

// Open follow-ups that carry an expected value: due or overdue first, then highest value.
export function valuedFollowUps<T extends FollowUpLike>(open: T[], today: string, max = 3): T[] {
  return open
    .filter(f => value(f) > 0)
    .sort((a, b) => {
      const aDue = a.due_date <= today ? 0 : 1
      const bDue = b.due_date <= today ? 0 : 1
      return aDue - bDue || value(b) - value(a)
    })
    .slice(0, max)
}

// Overdue follow-ups with NO expected value recorded, oldest first.
// They are shown so they are never silently ignored; no money value is ever invented for them.
export function overdueWithoutValue<T extends FollowUpLike>(open: T[], today: string, max = 3): T[] {
  return open
    .filter(f => value(f) <= 0 && f.due_date < today)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))
    .slice(0, max)
}

// Highest-potential customers to consider as a NEW visit. Customers in `exclude`
// (already planned today, or already listed for an urgent follow-up) are left out.
export function fallbackCustomers<T extends CustomerLike>(customers: T[], exclude: Set<string>, max = 3): T[] {
  return customers
    .filter(c => (Number(c.potential_amount) || 0) > 0 && !exclude.has(c.id))
    .sort((a, b) => (Number(b.potential_amount) || 0) - (Number(a.potential_amount) || 0))
    .slice(0, max)
}

// "This follow-up carries" / "These 2 follow-ups carry" / "These 3 follow-ups carry".
// Returns '' for 0, so callers never print a count that does not match the list.
export function followUpCountPhrase(n: number): string {
  if (n <= 0) return ''
  return n === 1 ? 'This follow-up carries' : `These ${n} follow-ups carry`
}

// ---------------- The "BEST NEXT MOVE" section text ----------------

export type NextMoveInput<F extends FollowUpLike & { action: string }, C extends CustomerLike & { name: string }> = {
  open: F[]                      // open follow-ups (not done, not dropped)
  customers: C[]                 // active customers
  plannedTodayIds: Set<string>   // customers with a still-planned visit today
  today: string                  // YYYY-MM-DD (India time)
  remaining: number              // target remaining, > 0
  nameOf: (customerId: string) => string
  money: (amount: number) => string   // e.g. inr() from lib/format
}

export function buildNextMove<F extends FollowUpLike & { action: string }, C extends CustomerLike & { name: string }>(
  i: NextMoveInput<F, C>
): string {
  const withValue = valuedFollowUps(i.open, i.today)
  const overdueNoValue = overdueWithoutValue(i.open, i.today)
  const onRoute = (id: string) => (i.plannedTodayIds.has(id) ? " (already on today's route)" : '')
  const line = (f: F, n: number, extra = '') =>
    `${n}. ${i.nameOf(f.customer_id)} — ${f.action} — due ${f.due_date}${extra}${onRoute(f.customer_id)}\n`

  let r = '\nBEST NEXT MOVE\n'

  if (withValue.length > 0) {
    const total = withValue.reduce((sum, f) => sum + value(f), 0)
    withValue.forEach((f, n) => { r += line(f, n + 1, ` — expected ${i.money(value(f))}`) })
    r += `${followUpCountPhrase(withValue.length)} ${i.money(total)} of expected value (figures you entered), ` +
      `about ${Math.round((total / i.remaining) * 100)}% of what remains. That is not a guarantee.\n`
  }

  if (overdueNoValue.length > 0) {
    r += '\nOVERDUE — NO VALUE RECORDED\n'
    overdueNoValue.forEach((f, n) => { r += line(f, n + 1) })
    r += overdueNoValue.length === 1
      ? 'No expected value is saved for this one, so it is not counted toward your target. ' +
        'Complete, reschedule or drop it so it does not slip further.\n'
      : 'No expected value is saved for these, so they are not counted toward your target. ' +
        'Complete, reschedule or drop them so they do not slip further.\n'
  }

  if (withValue.length > 0) {
    return r + `\nStart with ${i.nameOf(withValue[0].customer_id)}.\n`
  }

  // No valued follow-ups: suggest new visits, but never someone already on today's route
  // or already listed above for an overdue follow-up.
  const exclude = new Set([...i.plannedTodayIds, ...overdueNoValue.map(f => f.customer_id)])
  const top = fallbackCustomers(i.customers, exclude)
  const oldest = overdueNoValue[0]

  if (top.length > 0) {
    r += `${overdueNoValue.length > 0 ? '\n' : ''}No follow-ups have an expected value saved. ` +
      "Highest-potential customers not already on today's route:\n"
    top.forEach((c, n) => { r += `${n + 1}. ${c.name} — potential ${i.money(Number(c.potential_amount) || 0)}\n` })
    return r + (oldest
      ? `\nStart with the oldest overdue follow-up (${i.nameOf(oldest.customer_id)}), then consider ${top[0].name}.\n`
      : `\nStart with ${top[0].name} and record an expected value on the follow-up.\n`)
  }

  if (oldest) {
    return r + `\nStart with the oldest overdue follow-up: ${i.nameOf(oldest.customer_id)}.\n`
  }

  const anyPotential = i.customers.some(c => (Number(c.potential_amount) || 0) > 0)
  if (anyPotential) {
    return r + "Your highest-potential customers are already on today's route. Focus on completing those visits.\n"
  }
  return r + 'No follow-up values or customer potentials are saved, so I cannot rank opportunities. Add expected values to follow-ups.\n'
}
