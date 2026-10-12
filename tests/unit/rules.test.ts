// Run with: npm test   (uses Node's built-in test runner; Node 22.18+ needed, no extra packages)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isActiveSale, activeSales, activeSalesTotal,
  isPendingVisit, energyLabel, isLowEnergy,
  visitSaleStates, visitSaleLabel, visitSaleLookup, VISIT_SALE_NOTE,
} from '../../src/lib/rules.ts'

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
const stateOf = (visits: ReturnType<typeof v>[], sales: ReturnType<typeof row>[] | null, id = 'v1') =>
  visitSaleStates(visits, sales)[id]

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
