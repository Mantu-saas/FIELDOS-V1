// Run with: npm test   (uses Node's built-in test runner; Node 22.18+ needed, no extra packages)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isActiveSale, activeSales, activeSalesTotal,
  isPendingVisit, energyLabel, isLowEnergy,
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
