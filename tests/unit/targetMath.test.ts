import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeTarget } from '../../src/lib/targetMath.ts'

// October 2026: the 1st is a Thursday; Sundays are 4, 11, 18, 25. Selling days (Mon-Sat) = 27.

test('selling days: Sundays are excluded and today counts as remaining', () => {
  const t = computeTarget({ target: 650000, today: '2026-10-12', salesBeforeToday: 0, salesToday: 0 })
  // Before 12 Oct: days 1-11 minus Sundays 4 and 11 = 9 completed selling days
  assert.equal(t.elapsedDays, 9)
  assert.equal(t.remainingDays, 27 - 9)
})

test('achieved, remaining and percent use the sales passed in', () => {
  const t = computeTarget({ target: 650000, today: '2026-10-12', salesBeforeToday: 60000, salesToday: 2500 })
  assert.equal(t.achieved, 62500)
  assert.equal(t.remaining, 587500)
  assert.equal(Math.round(t.percent), 10)
  assert.equal(t.required, 587500 / 18)
  assert.equal(t.current, 60000 / 9)          // average per COMPLETED day, today excluded
})

test('target reached: remaining is zero, percent capped at 100', () => {
  const t = computeTarget({ target: 1000, today: '2026-10-12', salesBeforeToday: 1500, salesToday: 0 })
  assert.equal(t.remaining, 0)
  assert.equal(t.percent, 100)
})

test('first day of month: no completed days, so no average (callers must not judge pace)', () => {
  const t = computeTarget({ target: 1000, today: '2026-10-01', salesBeforeToday: 0, salesToday: 0 })
  assert.equal(t.elapsedDays, 0)
  assert.equal(t.current, 0)
})

test('no target set: percent is 0, no division by zero', () => {
  const t = computeTarget({ target: 0, today: '2026-10-12', salesBeforeToday: 100, salesToday: 0 })
  assert.equal(t.percent, 0)
  assert.equal(t.remaining, 0)
})
