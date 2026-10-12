// Shared business rules. ONE place for rules that several screens must agree on.
// Pure functions only: no database, no React, so they can be unit-tested.
// Used by TODAY, My Week and COACH. Tests: tests/unit/rules.test.ts

// ---------------- Sales ----------------

export type SaleLike = { amount: number | string | null; status?: string | null }

// A cancelled sale stays in the history but never counts toward totals or targets.
// 'confirmed' and 'pending' both count (this matches how every screen behaved before).
export function isActiveSale(sale: SaleLike): boolean {
  return sale.status !== 'cancelled'
}

export function activeSales<T extends SaleLike>(sales: T[]): T[] {
  return sales.filter(isActiveSale)
}

export function activeSalesTotal(sales: SaleLike[]): number {
  return activeSales(sales).reduce((sum, sale) => sum + (Number(sale.amount) || 0), 0)
}

// ---------------- Sale entered on a visit (C18) ----------------
// Recording a visit with a sale saves the amount on the visit AND inserts a row in SALES
// (VisitDetail.tsx: same customer, sale_date = India date of recording, same amount).
// The database has no link column between the two, so the SALES row is found the same way
// it was created. If that sale was later cancelled in SALES, the visit must not keep showing
// the amount as if it still counted. Display only: totals already come from activeSalesTotal.
//   'none'      -> no sale entered on the visit
//   'active'    -> matching SALES entry still counts
//   'cancelled' -> every matching SALES entry is cancelled
//   'unclear'   -> matching entries are a mix of counted and cancelled
//   'not_found' -> no matching entry (edited in SALES, never saved, or not loaded)

export type VisitSaleState = 'none' | 'active' | 'cancelled' | 'unclear' | 'not_found'

export type VisitSaleLike = { customer_id: string | null; sale_amount: number | string | null }
export type SaleRowLike = SaleLike & { customer_id: string | null; sale_date: string }

const paise = (n: number | string | null | undefined) => Math.round((Number(n) || 0) * 100)

// recordedDate: India date ("YYYY-MM-DD") the visit was recorded (from visits.actual_start).
export function visitSaleState(visit: VisitSaleLike, recordedDate: string | null, sales: SaleRowLike[]): VisitSaleState {
  const amount = paise(visit.sale_amount)
  if (amount <= 0) return 'none'
  if (!recordedDate || !visit.customer_id) return 'not_found'
  const matches = sales.filter(
    s => s.customer_id === visit.customer_id && s.sale_date === recordedDate && paise(s.amount) === amount
  )
  if (matches.length === 0) return 'not_found'
  const counted = matches.filter(isActiveSale).length
  if (counted === matches.length) return 'active'
  if (counted === 0) return 'cancelled'
  return 'unclear'
}

// Words shown next to a visit. `amountText` is the already formatted amount (e.g. "₹5,000"),
// so this file stays free of imports and Node's test runner can load it directly.
export function visitSaleLabel(state: VisitSaleState, amountText: string): string {
  switch (state) {
    case 'none': return ''
    case 'active': return `Sale ${amountText}`
    case 'cancelled': return `Sale ${amountText} cancelled in SALES — not counted`
    case 'unclear': return `Sale ${amountText} — a matching sale was cancelled, check SALES`
    case 'not_found': return `Sale ${amountText} entered at visit — check SALES`
  }
}

// ---------------- Visits ----------------

// Only a 'planned' visit is still waiting to happen.
// 'rescheduled', 'cancelled', 'unavailable' and 'visited' are all finished for that day.
export function isPendingVisit(visit: { status: string }): boolean {
  return visit.status === 'planned'
}

// ---------------- Energy (HEALTH check-in) ----------------

// HEALTH saves energy on a 0-3 scale (see src/features/health/HealthPage.tsx).
const ENERGY_LABELS: Record<number, string> = {
  3: 'Fresh',
  2: 'Normal',
  1: 'Tired',
  0: 'Drained',
}

export function energyLabel(energy: number | null | undefined): string {
  if (energy === null || energy === undefined) return 'not recorded'
  return ENERGY_LABELS[energy] ?? 'not recorded'
}

// Low energy = Tired or Drained. Anything outside the 0-3 scale is treated as unknown, not low.
export function isLowEnergy(energy: number | null | undefined): boolean {
  return energy === 0 || energy === 1
}
