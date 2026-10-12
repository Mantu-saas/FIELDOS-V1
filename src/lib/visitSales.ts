// C18: load what is needed to tell whether a sale entered on a visit still counts, for ROUTE and COACH.
// Scoped to the signed-in salesperson, the visits' customers and their RECORDING dates
// (not "this month"). Never loads all history.
//   sales: only rows the app created from a visit (notes = VISIT_SALE_NOTE)
//   peers: every recorded visit with a sale for those customers on those days, including
//          visits not on screen (e.g. planned for another day), so duplicates are counted.
// The matching rules live in lib/rules.ts (visitSaleStates); this file only fetches.
import { supabase } from './supabase'
import { istDateOf, nextDay } from './visitTime'
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

// sales/peers === null means they could not be loaded; screens then say "check SALES".
export async function loadVisitSales(
  userId: string,
  visits: VisitWithRecording[]
): Promise<{ rows: SaleRowLike[] | null; peers: VisitForSale[] | null; error: string }> {
  const { customerIds, dates } = visitSaleLookup(visits.map(toVisitForSale))
  if (customerIds.length === 0 || dates.length === 0) return { rows: [], peers: [], error: '' }

  // India-day window covering the recording dates (dates are sorted); exact days are matched in rules.ts
  const from = `${dates[0]}T00:00:00+05:30`
  const to = `${nextDay(dates[dates.length - 1])}T00:00:00+05:30`

  const [salesResult, peersResult] = await Promise.all([
    supabase
      .from('sales')
      .select('customer_id,sale_date,amount,status,notes')
      .eq('user_id', userId)
      .eq('notes', VISIT_SALE_NOTE)
      .in('customer_id', customerIds)
      .in('sale_date', dates),

    supabase
      .from('visits')
      .select('id,customer_id,sale_amount,actual_start')
      .eq('user_id', userId)
      .in('customer_id', customerIds)
      .gt('sale_amount', 0)
      .gte('actual_start', from)
      .lt('actual_start', to),
  ])

  const error = salesResult.error?.message || peersResult.error?.message || ''
  if (error) return { rows: null, peers: null, error }
  return {
    rows: (salesResult.data ?? []) as SaleRowLike[],
    peers: ((peersResult.data ?? []) as VisitWithRecording[]).map(toVisitForSale),
    error: '',
  }
}
