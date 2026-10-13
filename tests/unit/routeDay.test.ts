// R2: ROUTE day switcher rules.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shiftDay, dayLabel, canAddStopOn, canRecordOn } from '../../src/lib/routeDay.ts'

test('days move by calendar date, across month and year ends', () => {
  assert.equal(shiftDay('2026-10-13', 1), '2026-10-14')
  assert.equal(shiftDay('2026-10-13', -1), '2026-10-12')
  assert.equal(shiftDay('2026-10-31', 1), '2026-11-01')
  assert.equal(shiftDay('2026-12-31', 1), '2027-01-01')
})

test('day labels are plain words near today, short dates otherwise', () => {
  assert.equal(dayLabel('2026-10-13', '2026-10-13'), 'Today')
  assert.equal(dayLabel('2026-10-14', '2026-10-13'), 'Tomorrow')
  assert.equal(dayLabel('2026-10-12', '2026-10-13'), 'Yesterday')
  assert.equal(dayLabel('2026-10-16', '2026-10-13'), 'Fri 16 Oct')
  assert.equal(dayLabel('2026-10-11', '2026-10-13'), 'Sun 11 Oct')
})

test('stops can be planned for today and future days, not past days', () => {
  assert.equal(canAddStopOn('2026-10-13', '2026-10-13'), true)
  assert.equal(canAddStopOn('2026-10-20', '2026-10-13'), true)
  assert.equal(canAddStopOn('2026-10-12', '2026-10-13'), false)
})

test('visits are recorded on their day or later, never in advance', () => {
  assert.equal(canRecordOn('2026-10-13', '2026-10-13'), true)
  assert.equal(canRecordOn('2026-10-11', '2026-10-13'), true)
  assert.equal(canRecordOn('2026-10-14', '2026-10-13'), false)
})
