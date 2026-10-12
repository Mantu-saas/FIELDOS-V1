// C18: load the SALES rows that sales entered on visits could be, for ROUTE and COACH.
// Scoped to the signed-in salesperson, the visits' customers and their RECORDING dates
// (not "this month"), and only rows the app created from a visit. Never loads all history.
// The matching rules live in lib/rules.ts (visitSaleStates); this file only fetches.
import { supabase } from './supabase'
import { istDateOf } from './visitTime'
import { VISIT_SALE_NOTE, visitSaleLookup } from './rules'
import type { SaleRowLike, VisitForSale } from './rules'

type VisitWithRecording = {
  id: string
  customer_id: string | null
  sale_amount: number | string | null
  actual_start?: string | null
}

export function toVisitForSale(v: VisitWithRecording): VisitForSale {
  return { id: v.id, customer_id: v.customer_id, sale_amount: v.sale_amount, recorded_date: istDateOf(v.actual_start) }
}

// rows === null means the sales could not be loaded; screens then say "check SALES".
export async function loadVisitSales(
  userId: string,
  visits: VisitWithRecording[]
): Promise<{ rows: SaleRowLike[] | null; error: string }> {
  const { customerIds, dates } = visitSaleLookup(visits.map(toVisitForSale))
  if (customerIds.length === 0 || dates.length === 0) return { rows: [], error: '' }

  const { data, error } = await supabase
    .from('sales')
    .select('customer_id,sale_date,amount,status,notes')
    .eq('user_id', userId)
    .eq('notes', VISIT_SALE_NOTE)
    .in('customer_id', customerIds)
    .in('sale_date', dates)

  if (error) return { rows: null, error: error.message }
  return { rows: (data ?? []) as SaleRowLike[], error: '' }
}
