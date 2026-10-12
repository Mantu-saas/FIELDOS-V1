// Run with: npm test   (uses Node's built-in test runner; Node 22.18+ needed, no extra packages)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isActiveSale, activeSales, activeSalesTotal,
  isPendingVisit, energyLabel, isLowEnergy,
  visitSaleStates, visitSaleLabel, visitSaleLookup, VISIT_SALE_NOTE,
  isCancelledVisit, splitCancelledVisits,
  isSaleCancellationConfirmed, markSaleCancelled,
  validStressScore,
} from '../../src/lib/rules.ts'
import { istDateOf } from '../../src/lib/visitTime.ts'

test('cancelled sales are excluded from totals; confirmed and pending count', () => {
  const sales = [
    { amount: 1000, status: 'confirmed' },
    { amount: 500, status: 'cancelled' },
    { amount: 250, status: 'pending' },
  ]
  assert.equal(activeSalesTotal(sales), 1250)
  assert.equal(activeSales(sales).length, 2)
  assert.equal(isActiveSale({ amount: 1, status: 'cancelled' }), false)
})

test('cancelled sale stays in the history list (helpers never drop the original array)', () => {
  const sales = [{ amount: 100, status: 'cancelled' }]
  activeSalesTotal(sales)
  assert.equal(sales.length, 1)
})

test('amounts arriving as text from the database are added as numbers', () => {
  assert.equal(activeSalesTotal([{ amount: '1200.50', status: 'confirmed' }, { amount: 300 }]), 1500.5)
})

test('missing or bad amounts count as zero instead of breaking the total', () => {
  assert.equal(activeSalesTotal([{ amount: null, status: 'confirmed' }, { amount: 'abc' }]), 0)
  assert.equal(activeSalesTotal([]), 0)
})

test('only planned visits are pending; rescheduled is not pending for its original day', () => {
  assert.equal(isPendingVisit({ status: 'planned' }), true)
  for (const status of ['rescheduled', 'cancelled', 'unavailable', 'visited']) {
    assert.equal(isPendingVisit({ status }), false, status)
  }
})

test('energy uses the HEALTH 0-3 scale: Fresh is NOT low energy', () => {
  assert.equal(isLowEnergy(3), false)   // Fresh
  assert.equal(isLowEnergy(2), false)   // Normal
  assert.equal(isLowEnergy(1), true)    // Tired
  assert.equal(isLowEnergy(0), true)    // Drained
  assert.equal(isLowEnergy(null), false)
  assert.equal(isLowEnergy(7), false)   // outside the scale = unknown, never assumed low
})

test('energy is shown as words, never as a misleading x/10 number', () => {
  assert.equal(energyLabel(3), 'Fresh')
  assert.equal(energyLabel(0), 'Drained')
  assert.equal(energyLabel(null), 'not recorded')
  assert.equal(energyLabel(9), 'not recorded')
})

// ---------------- C18: sale entered on a visit, after it is cancelled in SALES ----------------
// A visit recorded with a sale inserts a SALES row: same customer, sale_date = India date of
// recording, same amount, notes = 'From visit'. Rules: src/lib/rules.ts (visitSaleStates).

const day = '2026-10-12'
const v = (id: string, extra: Partial<{ customer_id: string; sale_amount: number | string; recorded_date: string | null }> = {}) =>
  ({ id, customer_id: 'c1', sale_amount: 5000, recorded_date: day, ...extra })
const row = (status: string, extra: Partial<{ customer_id: string; sale_date: string; amount: number | string; notes: string | null }> = {}) =>
  ({ customer_id: 'c1', sale_date: day, amount: 5000, status, notes: VISIT_SALE_NOTE, ...extra })
// peers: recorded visits loaded from the database (default: none beyond the visits on screen)
const stateOf = (
  visits: ReturnType<typeof v>[],
  sales: ReturnType<typeof row>[] | null,
  id = 'v1',
  peers: ReturnType<typeof v>[] | null = []
) => visitSaleStates(visits, sales, peers)[id]

test('C18: the marker the rule looks for is the note the visit screen writes', () => {
  assert.equal(VISIT_SALE_NOTE, 'From visit')
})

test('C18: normal sale — visit shows the sale and it counts in the total', () => {
  const sales = [row('confirmed')]
  assert.equal(stateOf([v('v1')], sales), 'active')
  assert.equal(visitSaleLabel('active', '₹5,000'), 'Sale ₹5,000')
  assert.equal(activeSalesTotal(sales), 5000)
})

test('C18: cancelled sale — visit no longer shows it as valid and the total drops to zero', () => {
  const sales = [row('cancelled')]
  assert.equal(stateOf([v('v1')], sales), 'cancelled')
  assert.equal(activeSalesTotal(sales), 0)
  const label = visitSaleLabel('cancelled', '₹5,000')
  assert.match(label, /cancelled/)
  assert.match(label, /not counted/)
  assert.notEqual(label, 'Sale ₹5,000')
})

test('C18: pending sale still counts on the visit, matching the totals rule', () => {
  assert.equal(stateOf([v('v1')], [row('pending')]), 'active')
})

test('C18: sales for another customer, day or amount do not affect this visit', () => {
  const sales = [
    row('confirmed'),
    row('cancelled', { customer_id: 'c2' }),
    row('cancelled', { sale_date: '2026-10-11' }),
    row('cancelled', { amount: 4000 }),
  ]
  assert.equal(stateOf([v('v1')], sales), 'active')
})

test('C18: a sale typed in by hand (no visit note) is never treated as the visit\'s sale', () => {
  assert.equal(stateOf([v('v1')], [row('confirmed', { notes: null })]), 'not_found')
  // visit sale cancelled + same-amount manual sale that counts: still shown as cancelled, not as counted
  assert.equal(stateOf([v('v1')], [row('cancelled'), row('confirmed', { notes: null })]), 'cancelled')
})

test('C18: amount stored as text by the database still matches', () => {
  assert.equal(stateOf([v('v1', { sale_amount: '5000.00' })], [row('cancelled', { amount: '5000' })]), 'cancelled')
})

test('C18 previous month: visit recorded last month is looked up by its recording date, not this month', () => {
  // Coach shows a visit planned for today that was recorded on 30 Sep; today is 1 Oct
  const visits = [v('v1', { recorded_date: '2026-09-30' }), v('v2', { customer_id: 'c2', recorded_date: '2026-10-01' })]
  const lookup = visitSaleLookup(visits)
  assert.deepEqual(lookup.dates, ['2026-09-30', '2026-10-01'])
  assert.deepEqual(lookup.customerIds, ['c1', 'c2'])
  assert.equal(stateOf(visits, [row('cancelled', { sale_date: '2026-09-30' })]), 'cancelled')
})

test('C18: lookup only asks for customers and dates of visits that have a sale', () => {
  const lookup = visitSaleLookup([
    v('v1'),
    v('v2', { customer_id: 'c2', sale_amount: 0 }),
    v('v3', { customer_id: 'c3', recorded_date: null }),
  ])
  assert.deepEqual(lookup, { customerIds: ['c1'], dates: [day] })
  assert.deepEqual(visitSaleLookup([]), { customerIds: [], dates: [] })
})

test('C18 ambiguous: one counted and one cancelled match — "check SALES", never a guess', () => {
  const visits = [v('v1'), v('v2')]
  const sales = [row('confirmed'), row('cancelled')]
  assert.equal(stateOf(visits, sales, 'v1'), 'unclear')
  assert.equal(stateOf(visits, sales, 'v2'), 'unclear')
  assert.match(visitSaleLabel('unclear', '₹5,000'), /check SALES/)
})

test('C18 ambiguous: two identical visits but only one sale saved — neither claims to count', () => {
  assert.equal(stateOf([v('v1'), v('v2')], [row('confirmed')], 'v1'), 'unclear')
  assert.equal(stateOf([v('v1'), v('v2')], [row('confirmed')], 'v2'), 'unclear')
})

test('C18: two identical visits, both sales agree — status is certain for both', () => {
  assert.equal(stateOf([v('v1'), v('v2')], [row('cancelled'), row('cancelled')], 'v2'), 'cancelled')
  assert.equal(stateOf([v('v1'), v('v2')], [row('confirmed'), row('confirmed')], 'v1'), 'active')
})

test('C18: no match, no recording date, or sales not loaded — "check SALES", never counted', () => {
  assert.equal(stateOf([v('v1')], []), 'not_found')
  assert.equal(stateOf([v('v1', { recorded_date: null })], [row('confirmed')]), 'not_found')
  assert.equal(stateOf([v('v1')], null), 'not_found')
  assert.match(visitSaleLabel('not_found', '₹5,000'), /check SALES/)
  assert.match(visitSaleLabel(undefined, '₹5,000'), /check SALES/)
})

test('C18: visit without a sale shows nothing', () => {
  assert.equal(stateOf([v('v1', { sale_amount: 0 })], [row('confirmed')]), 'none')
  assert.equal(visitSaleLabel('none', '₹0'), '')
})

// ---------------- C18: recording date vs sale date ----------------
// VisitDetail saves actual_start = now, and (after this fix) sale_date = istDateOf(now).
// Before the fix sale_date used the date from the screen's last redraw, which could be the day
// before when Save is tapped just after midnight India time.

test('C18 midnight: India date flips at 18:30 UTC, so a save at 00:01 IST is dated the new day', () => {
  assert.equal(istDateOf('2026-10-12T18:29:59.999Z'), '2026-10-12') // 11:59:59 PM IST
  assert.equal(istDateOf('2026-10-12T18:31:00.000Z'), '2026-10-13') // 12:01 AM IST
})

test('C18 midnight: old record with sale dated the day before recording — "check SALES", never a confident status', () => {
  const recorded = istDateOf('2026-10-12T18:31:00.000Z') // visit saved 12:01 AM on 13 Oct
  const visits = [v('v1', { recorded_date: recorded })]
  // the sale got 12 Oct from the screen's earlier redraw; it was later cancelled
  assert.equal(stateOf(visits, [row('cancelled', { sale_date: '2026-10-12' })]), 'not_found')
  assert.equal(stateOf(visits, [row('confirmed', { sale_date: '2026-10-12' })]), 'not_found')
  // and the lookup asks only for the recording date; no guessing of a neighbouring day
  assert.deepEqual(visitSaleLookup(visits).dates, ['2026-10-13'])
})

test('C18 midnight: with the fix, sale date and recording date come from the same moment and match', () => {
  const now = '2026-10-12T18:31:00.000Z'
  const visits = [v('v1', { recorded_date: istDateOf(now) })]
  assert.equal(stateOf(visits, [row('cancelled', { sale_date: istDateOf(now) as string })]), 'cancelled')
})

test('C18 old visit with no actual_start: unknown, never shown as cancelled or counted', () => {
  const visits = [v('v1', { recorded_date: istDateOf(null) })]
  assert.equal(istDateOf(null), null)
  assert.deepEqual(visitSaleLookup(visits), { customerIds: [], dates: [] })
  // even when a cancelled visit sale exists for that customer and amount
  assert.equal(stateOf(visits, [row('cancelled')]), 'not_found')
  assert.notEqual(visitSaleLabel('not_found', '₹5,000'), visitSaleLabel('cancelled', '₹5,000'))
  assert.match(visitSaleLabel('not_found', '₹5,000'), /check SALES/)
})

// ---------------- C18: duplicate matches, including visits not on screen ----------------

test('C18 duplicate: identical visit planned for another day (not on screen) is counted — only one sale saved means "check SALES"', () => {
  // ROUTE shows v1 (today). v2 was planned for yesterday but recorded today, same customer and amount.
  const onScreen = [v('v1')]
  const peers = [v('v1'), v('v2')] // database returns every recorded visit with a sale on that day
  assert.equal(stateOf(onScreen, [row('confirmed')], 'v1', peers), 'unclear')
  assert.equal(stateOf(onScreen, [row('cancelled')], 'v1', peers), 'unclear')
  // without the peers it would have looked certain
  assert.equal(stateOf(onScreen, [row('confirmed')], 'v1', []), 'active')
})

test('C18 duplicate: two identical visits with two sales that agree — certain, whether or not both are on screen', () => {
  const peers = [v('v1'), v('v2')]
  assert.equal(stateOf([v('v1')], [row('cancelled'), row('cancelled')], 'v1', peers), 'cancelled')
  assert.equal(stateOf([v('v1')], [row('confirmed'), row('confirmed')], 'v1', peers), 'active')
})

test('C18 duplicate: two identical visits, sales disagree — "check SALES" for both', () => {
  const visits = [v('v1'), v('v2')]
  const sales = [row('confirmed'), row('cancelled')]
  assert.equal(stateOf(visits, sales, 'v1', visits), 'unclear')
  assert.equal(stateOf(visits, sales, 'v2', visits), 'unclear')
})

test('C18 duplicate: the same visit on screen and in peers is counted once', () => {
  assert.equal(stateOf([v('v1')], [row('cancelled')], 'v1', [v('v1')]), 'cancelled')
})

test('C18 duplicate: recorded visits for another customer, day or amount are not duplicates', () => {
  const peers = [
    v('v1'),
    v('v2', { customer_id: 'c2' }),
    v('v3', { recorded_date: '2026-10-11' }),
    v('v4', { sale_amount: 4000 }),
  ]
  assert.equal(stateOf([v('v1')], [row('cancelled')], 'v1', peers), 'cancelled')
})

test('C18 duplicate: an extra visit sale with no visit (more sales than visits) still needs every match to agree', () => {
  assert.equal(stateOf([v('v1')], [row('cancelled'), row('cancelled')], 'v1', [v('v1')]), 'cancelled')
  assert.equal(stateOf([v('v1')], [row('confirmed'), row('cancelled')], 'v1', [v('v1')]), 'unclear')
})

test('C18 duplicate: if the visit count could not be loaded, no status is claimed', () => {
  assert.equal(stateOf([v('v1')], [row('cancelled')], 'v1', null), 'not_found')
  assert.equal(stateOf([v('v1', { sale_amount: 0 })], [row('cancelled')], 'v1', null), 'none')
})

// ---------------- Fix A: cancelled visits are history, not today's work ----------------

test('Fix A: only a cancelled visit is treated as cancelled', () => {
  assert.equal(isCancelledVisit({ status: 'cancelled' }), true)
  for (const status of ['planned', 'visited', 'unavailable', 'rescheduled']) {
    assert.equal(isCancelledVisit({ status }), false, status)
  }
})

test('Fix A: ROUTE split keeps every visit, in order, with cancelled ones set apart', () => {
  const visits = [
    { id: 'a', status: 'visited' },
    { id: 'b', status: 'cancelled' },
    { id: 'c', status: 'planned' },
    { id: 'd', status: 'rescheduled' },
    { id: 'e', status: 'cancelled' },
  ]
  const { active, cancelled } = splitCancelledVisits(visits)
  assert.deepEqual(active.map(v => v.id), ['a', 'c', 'd'])
  assert.deepEqual(cancelled.map(v => v.id), ['b', 'e'])
  // nothing is dropped: the cancelled visits are kept for history and can still be opened
  assert.equal(active.length + cancelled.length, visits.length)
})

test('Fix A: a cancelled visit is never pending (planning counts ignore it)', () => {
  assert.equal(isPendingVisit({ status: 'cancelled' }), false)
  assert.equal(isPendingVisit({ status: 'planned' }), true)
})

// ---------------- Fix B: cancelling a sale ----------------

test('Fix B: cancellation counts as done only when the database returns that sale, cancelled', () => {
  assert.equal(isSaleCancellationConfirmed([{ id: 's1', status: 'cancelled' }], 's1'), true)
  // an update that matched no row returns no error but no data: NOT a success
  assert.equal(isSaleCancellationConfirmed([], 's1'), false)
  assert.equal(isSaleCancellationConfirmed(null, 's1'), false)
  assert.equal(isSaleCancellationConfirmed(undefined, 's1'), false)
  // wrong row, still active, or more than one row: NOT a success
  assert.equal(isSaleCancellationConfirmed([{ id: 's2', status: 'cancelled' }], 's1'), false)
  assert.equal(isSaleCancellationConfirmed([{ id: 's1', status: 'confirmed' }], 's1'), false)
  assert.equal(isSaleCancellationConfirmed([{ id: 's1', status: 'cancelled' }, { id: 's1', status: 'cancelled' }], 's1'), false)
})

test('Fix B: a confirmed cancellation updates only that sale on screen, and totals drop at once', () => {
  const rows = [
    { id: 's1', status: 'confirmed', amount: 5000 },
    { id: 's2', status: 'pending', amount: 2000 },
    { id: 's3', status: 'confirmed', amount: 1000 },
  ]
  assert.equal(activeSalesTotal(rows), 8000)
  const after = markSaleCancelled(rows, 's1')
  assert.deepEqual(after.map(r => r.status), ['cancelled', 'pending', 'confirmed'])
  assert.equal(activeSalesTotal(after), 3000)          // pending still counts, as before
  assert.deepEqual(rows.map(r => r.status), ['confirmed', 'pending', 'confirmed']) // original not mutated
  assert.deepEqual(markSaleCancelled(rows, 'nope'), rows)
})

// ---------------- Fix C: stress display ----------------

test('Fix C: no stress recorded means no stress score — never "—/10", never a guess', () => {
  assert.equal(validStressScore(null), null)
  assert.equal(validStressScore(undefined), null)
  assert.equal(validStressScore(''), null)
})

test('Fix C: only a whole number from 1 to 10 (the database range) is a stress score', () => {
  assert.equal(validStressScore(1), 1)
  assert.equal(validStressScore(8), 8)
  assert.equal(validStressScore(10), 10)
  assert.equal(validStressScore('7'), 7)
  for (const bad of [0, -1, 11, 2.5, Number.NaN, 'high']) {
    assert.equal(validStressScore(bad as number), null, String(bad))
  }
})

// ---------- C20: one visit per customer per day ----------
import { blocksNewStopToday, sameDayVisitMessage, STOP_BLOCKING_STATUSES } from '../../src/lib/rules.ts'

test('C20: a planned, visited or rescheduled visit today blocks a new stop for that customer', () => {
  for (const status of ['planned', 'visited', 'rescheduled']) {
    assert.equal(blocksNewStopToday({ status }), true, status)
  }
  assert.deepEqual([...STOP_BLOCKING_STATUSES], ['planned', 'visited', 'rescheduled'])
})

test('C20: a cancelled visit or an unavailable customer still allows another try today', () => {
  for (const status of ['cancelled', 'unavailable']) {
    assert.equal(blocksNewStopToday({ status }), false, status)
  }
})

test('C20: the blocked message names the customer and says what to do', () => {
  assert.equal(sameDayVisitMessage('Test Shop 1'), 'Test Shop 1 already has a visit today. Open it instead of adding a new stop.')
  assert.equal(sameDayVisitMessage(undefined), 'This customer already has a visit today. Open it instead of adding a new stop.')
})
