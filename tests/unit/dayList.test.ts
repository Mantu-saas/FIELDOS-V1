// R3: one checklist for the day from visits, follow-ups and personal events.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildDayList, progress } from '../../src/lib/dayList.ts'
import type { DLVisit, DLFollowUp, DLEvent } from '../../src/lib/dayList.ts'

const D = '2026-10-16'
const iso = (day: string, hm: string) => `${day}T${hm}:00+05:30`

const visits: DLVisit[] = [
  { id: 'v1', customer_id: 'c1', status: 'planned', planned_start: iso(D, '14:00'), name: 'City Clinic' },
  { id: 'v2', customer_id: 'c2', status: 'visited', planned_start: iso(D, '10:00'), name: 'Dr Rao' },
  { id: 'v3', customer_id: 'c3', status: 'planned', planned_start: iso('2026-10-17', '10:00'), name: 'Tomorrow Dr' }
]
const followUps: DLFollowUp[] = [
  { id: 'f1', customer_id: 'c1', due_date: '2026-10-14', action: 'Collect payment', expected_value: 5000, status: 'open', name: 'City Clinic' },
  { id: 'f2', customer_id: 'c9', due_date: '2026-10-17', action: 'Future', expected_value: 0, status: 'open', name: 'X' }
]
const events: DLEvent[] = [
  { id: 'e1', title: 'Stockist', category: 'work', starts_at: iso(D, '11:00'), ends_at: null, all_day: false, status: 'planned' },
  { id: 'e2', title: 'Book ticket', category: 'travel', starts_at: iso(D, '00:00'), ends_at: null, all_day: true, status: 'completed' },
  { id: 'e3', title: 'Cancelled', category: 'personal', starts_at: iso(D, '18:00'), ends_at: null, all_day: false, status: 'cancelled' }
]

test('today: everything in one list, anytime first, then by time', () => {
  const list = buildDayList({ day: D, today: D, nowMinutes: 12 * 60, visits, followUps, events })
  assert.deepEqual(list.map(i => i.id), ['e2', 'f1', 'v2', 'e1', 'v1'])
  assert.deepEqual(progress(list), { done: 2, total: 5 })
})

test('a visit shows money waiting at that customer; overdue and missed items are marked', () => {
  const list = buildDayList({ day: D, today: D, nowMinutes: 12 * 60, visits, followUps, events })
  const v1 = list.find(i => i.id === 'v1')!
  assert.equal(v1.detail, 'Collect/ask ₹5,000 · Collect payment')
  assert.equal(v1.late, false)
  assert.equal(list.find(i => i.id === 'f1')!.late, true)
  assert.equal(list.find(i => i.id === 'e1')!.late, true)   // 11:00 passed, not ticked
  assert.equal(list.find(i => i.id === 'v2')!.detail, 'Visited')
})

test('tomorrow shows only tomorrow, no overdue items', () => {
  const list = buildDayList({ day: '2026-10-17', today: D, nowMinutes: 12 * 60, visits, followUps, events })
  assert.deepEqual(list.map(i => i.id), ['f2', 'v3'])
  assert.ok(list.every(i => !i.late))
})
