// Transparent customer-priority heuristic (Build Pack section 9). Not a prediction.
import type { Customer } from '../types'

export type SaleLite = { customer_id: string | null; amount: number; sale_date: string; status?: string }
export type FU = { customer_id: string; due_date: string; expected_value: number }
export type Scored = { customer: Customer; score: number; reasons: string[] }

// days from a to b (YYYY-MM-DD)
export function daysBetween(a: string, b: string): number {
  const p = (s: string) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) }
  return Math.round((p(b) - p(a)) / 86400000)
}
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

export function rankCustomers(i: {
  customers: Customer[]; sales: SaleLite[]; lastVisit: Record<string, string>; followUps: FU[]; today: string
}): Scored[] {
  const { customers, sales, lastVisit, followUps, today } = i
  const recent: Record<string, number> = {}
  for (const s of sales) {
    if (!s.customer_id || s.status === 'cancelled') continue
    const age = daysBetween(s.sale_date, today)
    if (age >= 0 && age <= 30) recent[s.customer_id] = (recent[s.customer_id] ?? 0) + Number(s.amount)
  }
  const maxPot = Math.max(1, ...customers.map(c => Number(c.potential_amount)))
  const maxRecent = Math.max(1, ...Object.values(recent))
  const nextDue: Record<string, number> = {}
  for (const f of followUps) {
    const d = daysBetween(today, f.due_date)
    if (nextDue[f.customer_id] === undefined || d < nextDue[f.customer_id]) nextDue[f.customer_id] = d
  }
  return customers.map(c => {
    const pot = Number(c.potential_amount) / maxPot
    const rec = (recent[c.id] ?? 0) / maxRecent
    const pri = (6 - c.priority) / 5
    const due = nextDue[c.id]
    const fu = due === undefined ? 0 : due <= 1 ? 1 : due <= 3 ? 0.6 : 0.2
    const lv = lastVisit[c.id]
    const since = lv ? daysBetween(lv, today) : null
    const recency = since === null ? 1 : Math.min(Math.max(since, 0) / 30, 1)
    const score = 0.30 * pot + 0.20 * rec + 0.15 * pri + 0.15 * fu + 0.10 * recency + 0.10 * 0.5 // availability not read yet: neutral 0.5
    const reasons: string[] = []
    if (pot >= 0.6) reasons.push('high potential')
    if (due !== undefined && due < 0) reasons.push('follow-up overdue')
    else if (due !== undefined && due <= 3) reasons.push('follow-up due soon')
    if (c.priority <= 2) reasons.push('high priority')
    if (since === null) reasons.push('not visited yet')
    else if (since >= 14) reasons.push(`not visited for ${since} days`)
    if ((recent[c.id] ?? 0) > 0) reasons.push('bought in the last 30 days')
    return { customer: c, score, reasons: reasons.length ? reasons : ['steady account'] }
  }).sort((a, b) => b.score - a.score)
}
