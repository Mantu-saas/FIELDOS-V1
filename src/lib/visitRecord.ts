// C21: safe "Record visit" and "Remove stop" (Fix 1).
// Both only act on a visit that is STILL planned and belongs to this user, and both confirm
// from the database that exactly one visit changed. If not (for example the visit was already
// recorded on another phone, or the screen was out of date), nothing else is written:
// no second sale, no second follow-up, no deleted history.
//
// No runtime imports, so Node's test runner can load this file directly. The database client is
// passed in, so tests can use a pretend database. Tests: tests/unit/visitRecord.test.ts

// The small part of the Supabase client these functions use.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type VisitDb = { from: (table: string) => any }

export type RecordVisitInput = {
  userId: string
  visitId: string
  customerId: string
  status: string
  saleAmount: number
  leadAmount: number
  collectionAmount: number
  notes: string | null
  nextAction: string | null
  followUpDate: string | null
  followUpAction: string
  followUpNotes: string | null
  now: string        // saved as actual_start / actual_end
  saleDate: string   // India date of `now` (C18)
  saleNote: string   // marks the sale as entered on a visit (VISIT_SALE_NOTE)
}

export type RecordVisitResult =
  | { ok: true; problems: string[] }
  | { ok: false; reason: 'not_planned' }
  | { ok: false; reason: 'error'; message: string }

export const ALREADY_RECORDED_MESSAGE =
  'This visit was already recorded (perhaps on another phone, or the screen was out of date). ' +
  'Nothing was saved, so no sale or follow-up was added twice. Go back to the route to see it.'

export const REMOVE_NOT_PLANNED_MESSAGE =
  'This stop was not removed because it has already been recorded or removed ' +
  '(perhaps on another phone). The route has been refreshed.'

export async function recordVisit(db: VisitDb, input: RecordVisitInput): Promise<RecordVisitResult> {
  const update = await db
    .from('visits')
    .update({
      status: input.status,
      sale_amount: input.saleAmount,
      lead_amount: input.leadAmount,
      collection_amount: input.collectionAmount,
      notes: input.notes,
      next_action: input.nextAction,
      follow_up_date: input.followUpDate,
      actual_start: input.now,
      actual_end: input.now
    })
    .eq('id', input.visitId)
    .eq('user_id', input.userId)
    .eq('customer_id', input.customerId)
    .eq('status', 'planned')
    .select('id')

  if (update.error) return { ok: false, reason: 'error', message: String(update.error.message ?? update.error) }

  // Exactly one planned visit must have changed. Zero means it was no longer planned:
  // stop here so the sale and follow-up are never added a second time.
  if (!Array.isArray(update.data) || update.data.length !== 1) return { ok: false, reason: 'not_planned' }

  const problems: string[] = []

  if (input.saleAmount > 0) {
    const r = await db.from('sales').insert({
      user_id: input.userId,
      customer_id: input.customerId,
      sale_date: input.saleDate,
      amount: input.saleAmount,
      notes: input.saleNote
    })
    if (r.error) problems.push('the sale (' + String(r.error.message ?? r.error) + ')')
  }

  if (input.followUpDate) {
    const r = await db.from('follow_ups').insert({
      user_id: input.userId,
      customer_id: input.customerId,
      due_date: input.followUpDate,
      action: input.followUpAction,
      expected_value: input.leadAmount,
      notes: input.followUpNotes
    })
    if (r.error) problems.push('the follow-up (' + String(r.error.message ?? r.error) + ')')
  }

  return { ok: true, problems }
}

export type RemoveStopResult =
  | { ok: true }
  | { ok: false; reason: 'not_planned' }
  | { ok: false; reason: 'error'; message: string }

// Removes a stop only while it is still planned and belongs to this user.
export async function removePlannedStop(db: VisitDb, userId: string, visitId: string): Promise<RemoveStopResult> {
  const result = await db
    .from('visits')
    .delete()
    .eq('id', visitId)
    .eq('user_id', userId)
    .eq('status', 'planned')
    .select('id')

  if (result.error) return { ok: false, reason: 'error', message: String(result.error.message ?? result.error) }
  if (!Array.isArray(result.data) || result.data.length !== 1) return { ok: false, reason: 'not_planned' }
  return { ok: true }
}
