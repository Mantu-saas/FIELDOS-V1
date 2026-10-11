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
