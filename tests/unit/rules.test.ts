// Run with: npm test   (uses Node's built-in test runner; Node 22.18+ needed, no extra packages)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isActiveSale, activeSales, activeSalesTotal,
  isPendingVisit, energyLabel, isLowEnergy,
  visitSaleState, visitSaleLabel,
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
// A visit recorded with a sale inserts a SALES row: same customer, sale_date = India date of recording, same amount.

const visit = { customer_id: 'c1', sale_amount: 5000 }
const day = '2026-10-12'
const fromVisit = (status: string, extra: Partial<{ customer_id: string; sale_date: string; amount: number | string }> = {}) =>
  ({ customer_id: 'c1', sale_date: day, amount: 5000, status, ...extra })

test('C18: normal sale — visit shows the sale and it counts in the total', () => {
  const sales = [fromVisit('confirmed')]
  assert.equal(visitSaleState(visit, day, sales), 'active')
  assert.equal(visitSaleLabel('active', '₹5,000'), 'Sale ₹5,000')
  assert.equal(activeSalesTotal(sales), 5000)
})

test('C18: cancelled sale — visit no longer shows it as valid and the total drops to zero', () => {
  const sales = [fromVisit('cancelled')]
  assert.equal(visitSaleState(visit, day, sales), 'cancelled')
  assert.equal(activeSalesTotal(sales), 0)
  const label = visitSaleLabel('cancelled', '₹5,000')
  assert.match(label, /cancelled/)
  assert.match(label, /not counted/)
  assert.notEqual(label, 'Sale ₹5,000')
})

test('C18: pending sale still counts on the visit, matching the totals rule', () => {
  assert.equal(visitSaleState(visit, day, [fromVisit('pending')]), 'active')
})

test('C18: a cancelled sale for another customer, day or amount does not affect this visit', () => {
  const sales = [
    fromVisit('confirmed'),
    fromVisit('cancelled', { customer_id: 'c2' }),
    fromVisit('cancelled', { sale_date: '2026-10-11' }),
    fromVisit('cancelled', { amount: 4000 }),
  ]
  assert.equal(visitSaleState(visit, day, sales), 'active')
})

test('C18: amount stored as text by the database still matches', () => {
  assert.equal(visitSaleState({ customer_id: 'c1', sale_amount: '5000.00' }, day, [fromVisit('cancelled', { amount: '5000' })]), 'cancelled')
})

test('C18: one counted and one cancelled match — says unclear instead of guessing', () => {
  const sales = [fromVisit('confirmed'), fromVisit('cancelled')]
  assert.equal(visitSaleState(visit, day, sales), 'unclear')
  assert.match(visitSaleLabel('unclear', '₹5,000'), /check SALES/)
})

test('C18: no matching SALES row, or no recording date — never claimed as counted', () => {
  assert.equal(visitSaleState(visit, day, []), 'not_found')
  assert.equal(visitSaleState(visit, null, [fromVisit('confirmed')]), 'not_found')
  assert.match(visitSaleLabel('not_found', '₹5,000'), /check SALES/)
})

test('C18: visit without a sale shows nothing', () => {
  assert.equal(visitSaleState({ customer_id: 'c1', sale_amount: 0 }, day, [fromVisit('confirmed')]), 'none')
  assert.equal(visitSaleLabel('none', '₹0'), '')
})
