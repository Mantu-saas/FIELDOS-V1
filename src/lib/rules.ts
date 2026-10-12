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

// SALES "Cancel": success only when the database returns exactly that one sale, now cancelled.
// An update that matched no row returns no error, so "no error" alone is not proof.
export function isSaleCancellationConfirmed(
  returned: { id: string; status: string }[] | null | undefined,
  saleId: string
): boolean {
  return Array.isArray(returned) && returned.length === 1 && returned[0].id === saleId && returned[0].status === 'cancelled'
}

// After a confirmed cancellation: show that sale as cancelled at once, everything else unchanged.
export function markSaleCancelled<T extends { id: string; status: string }>(rows: T[], saleId: string): T[] {
  return rows.map(r => (r.id === saleId ? { ...r, status: 'cancelled' } : r))
}

// ---------------- Sale entered on a visit (C18) ----------------
// Recording a visit with a sale saves the amount on the visit AND inserts a SALES row
// (VisitDetail.tsx): same customer, sale_date = India date of recording, same amount,
// notes = VISIT_SALE_NOTE. SALES never edits notes and never writes this note on a sale
// typed in by hand, so the note marks sales created from a visit. There is still no column
// linking one visit to one sale, so we only say a status when every possible match agrees.
// Display only: totals already come from activeSalesTotal.
//   'none'      -> no sale entered on the visit
//   'active'    -> the matching visit sale(s) still count
//   'cancelled' -> the matching visit sale(s) are all cancelled
//   'unclear'   -> matches disagree, or more visits than sales share them: check SALES
//   'not_found' -> no match, or sales could not be loaded: check SALES

export const VISIT_SALE_NOTE = 'From visit'

export type VisitSaleState = 'none' | 'active' | 'cancelled' | 'unclear' | 'not_found'

export type VisitForSale = {
  id: string
  customer_id: string | null
  sale_amount: number | string | null
  recorded_date: string | null // India date "YYYY-MM-DD" the visit was recorded (visits.actual_start)
}
export type SaleRowLike = SaleLike & { customer_id: string | null; sale_date: string; notes?: string | null }

const paise = (n: number | string | null | undefined) => Math.round((Number(n) || 0) * 100)
const saleKey = (customerId: string, date: string, amount: number) => `${customerId}|${date}|${amount}`

// Which customers and recording dates to load visit sales for. Uses the RECORDING date,
// not the current month, so a visit recorded last month still finds its sale.
export function visitSaleLookup(visits: VisitForSale[]): { customerIds: string[]; dates: string[] } {
  const withSale = visits.filter(v => paise(v.sale_amount) > 0 && v.customer_id && v.recorded_date)
  return {
    customerIds: [...new Set(withSale.map(v => v.customer_id as string))].sort(),
    dates: [...new Set(withSale.map(v => v.recorded_date as string))].sort(),
  }
}

// sales: rows loaded for visitSaleLookup(), or null when they could not be loaded.
// peers: every recorded visit (from the database, not only the ones on screen) that has a sale
// for the same customers and recording dates. Visits sharing customer + date + amount are
// counted from visits AND peers (each visit once), so a matching visit planned for another
// day still counts. Pass null when peers could not be loaded: then no status is claimed.
export function visitSaleStates(
  visits: VisitForSale[],
  sales: SaleRowLike[] | null,
  peers: VisitForSale[] | null
): Record<string, VisitSaleState> {
  const result: Record<string, VisitSaleState> = {}
  const keyOf = (v: VisitForSale) =>
    paise(v.sale_amount) > 0 && v.customer_id && v.recorded_date
      ? saleKey(v.customer_id, v.recorded_date, paise(v.sale_amount))
      : null

  // How many recorded visits share each customer + date + amount (each visit counted once)
  const visitIdsPerKey = new Map<string, Set<string>>()
  for (const v of [...visits, ...(peers ?? [])]) {
    const k = keyOf(v)
    if (!k) continue
    const ids = visitIdsPerKey.get(k) ?? new Set<string>()
    ids.add(v.id)
    visitIdsPerKey.set(k, ids)
  }

  const rowsPerKey = new Map<string, SaleRowLike[]>()
  for (const s of sales ?? []) {
    if (s.notes !== VISIT_SALE_NOTE || !s.customer_id) continue
    const k = saleKey(s.customer_id, s.sale_date, paise(s.amount))
    rowsPerKey.set(k, [...(rowsPerKey.get(k) ?? []), s])
  }

  for (const v of visits) {
    if (paise(v.sale_amount) <= 0) { result[v.id] = 'none'; continue }
    const k = keyOf(v)
    if (!k || sales === null || peers === null) { result[v.id] = 'not_found'; continue }
    const rows = rowsPerKey.get(k) ?? []
    if (rows.length === 0) { result[v.id] = 'not_found'; continue }
    const counted = rows.filter(isActiveSale).length
    // Fewer sales than visits sharing them: one visit's sale is missing, so no visit can be sure
    if (rows.length < (visitIdsPerKey.get(k)?.size ?? 1)) result[v.id] = 'unclear'
    else if (counted === rows.length) result[v.id] = 'active'
    else if (counted === 0) result[v.id] = 'cancelled'
    else result[v.id] = 'unclear'
  }
  return result
}

// Words shown next to a visit. `amountText` is the already formatted amount (e.g. "₹5,000"),
// so this file stays free of imports and Node's test runner can load it directly.
export function visitSaleLabel(state: VisitSaleState | undefined, amountText: string): string {
  switch (state) {
    case 'none': return ''
    case 'active': return `Sale ${amountText}`
    case 'cancelled': return `Sale ${amountText} cancelled in SALES — not counted`
    case 'unclear': return `Sale ${amountText} entered at visit — status unclear, check SALES`
    case 'not_found':
    default: return `Sale ${amountText} entered at visit — check SALES`
  }
}

// ---------------- Visits ----------------

// Only a 'planned' visit is still waiting to happen.
// 'rescheduled', 'cancelled', 'unavailable' and 'visited' are all finished for that day.
export function isPendingVisit(visit: { status: string }): boolean {
  return visit.status === 'planned'
}

// A cancelled visit is kept for history but is never part of the day's work.
export function isCancelledVisit(visit: { status: string }): boolean {
  return visit.status === 'cancelled'
}

// ROUTE: today's work (planned, visited, unavailable, rescheduled) in its original order,
// with cancelled visits set apart so they are not numbered or treated as stops.
export function splitCancelledVisits<T extends { status: string }>(visits: T[]): { active: T[]; cancelled: T[] } {
  return {
    active: visits.filter(v => !isCancelledVisit(v)),
    cancelled: visits.filter(isCancelledVisit),
  }
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
