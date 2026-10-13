// V1 reliability: MY WEEK day plan in time order, and clash warnings. Run with: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dayClashes, dayTimeline, isPlannerVisit, VISIT_MINUTES } from '../../src/lib/weekPlan.ts'

const at = (clock: string) => `2026-10-15T${clock}:00+05:30`
const clock = (iso: string) => iso.slice(11, 16)
const ev = (id: string, start: string, extra: Partial<{ end: string; all_day: boolean; status: string; title: string }> = {}) => ({
  id, title: extra.title ?? id, starts_at: at(start), ends_at: extra.end ? at(extra.end) : null,
  all_day: extra.all_day ?? false, status: extra.status ?? 'planned',
})
const visit = (id: string, start: string, status = 'planned', name = id) => ({ id, status, planned_start: at(start), name })
const fu = (id: string, status = 'open') => ({ id, status, due_date: '2026-10-15' })

test('one list in time order: all-day first, then events and visits by time, follow-ups last', () => {
  const list = dayTimeline(
    [ev('lunch', '13:00'), ev('holiday', '00:00', { all_day: true }), ev('gym', '07:00')],
    [visit('shopB', '11:00'), visit('shopA', '09:40')],
    [fu('call')],
  )
  assert.deepEqual(list.map(e => e.key), [
    'event-holiday', 'event-gym', 'visit-shopA', 'visit-shopB', 'event-lunch', 'follow-up-call',
  ])
})

test('same start time keeps the event before the visit, and order is stable', () => {
  const list = dayTimeline([ev('meeting', '10:00')], [visit('shop', '10:00')], [])
  assert.deepEqual(list.map(e => e.key), ['event-meeting', 'visit-shop'])
})

test('only planned and visited visits belong on the planner', () => {
  assert.equal(isPlannerVisit({ status: 'planned' }), true)
  assert.equal(isPlannerVisit({ status: 'visited' }), true)
  for (const s of ['cancelled', 'unavailable', 'rescheduled']) assert.equal(isPlannerVisit({ status: s }), false, s)
  const list = dayTimeline([], [visit('a', '10:00', 'cancelled'), visit('b', '11:00', 'visited')], [])
  assert.deepEqual(list.map(e => e.key), ['visit-b'])
})

test('an unreadable time goes to the end of the timed items, never lost', () => {
  const bad = { id: 'x', status: 'planned', planned_start: 'not a date', name: 'x' }
  const list = dayTimeline([ev('gym', '07:00')], [bad], [fu('f')])
  assert.deepEqual(list.map(e => e.key), ['event-gym', 'visit-x', 'follow-up-f'])
})

test('clash: an event during a visit is reported in plain words', () => {
  const w = dayClashes([ev('Doctor', '10:05', { end: '10:45', title: 'Doctor' })], [visit('v', '10:00', 'planned', 'Test Shop 1')], clock)
  assert.deepEqual(w, ['Time clash: visit to Test Shop 1 (10:00) overlaps "Doctor" (10:05).'])
})

test('clash: two visits closer than the visit length, and two items at the same moment', () => {
  assert.equal(VISIT_MINUTES, 15)
  assert.equal(dayClashes([], [visit('a', '10:00', 'planned', 'A'), visit('b', '10:10', 'planned', 'B')], clock).length, 1)
  assert.equal(dayClashes([ev('call', '10:00'), ev('pickup', '10:00')], [], clock).length, 1)
})

test('no clash when items only touch or are far apart', () => {
  assert.deepEqual(dayClashes([ev('meeting', '10:15', { end: '11:00' })], [visit('a', '10:00')], clock), [])
  assert.deepEqual(dayClashes([], [visit('a', '10:00'), visit('b', '10:15')], clock), [])
  assert.deepEqual(dayClashes([ev('gym', '07:00')], [visit('a', '09:00')], clock), [])
})

test('cancelled, completed, all-day events and visits already done never cause a warning', () => {
  const events = [
    ev('cancelled', '10:00', { status: 'cancelled', end: '11:00' }),
    ev('done', '10:00', { status: 'completed', end: '11:00' }),
    ev('holiday', '00:00', { all_day: true }),
  ]
  const visits = [visit('a', '10:05', 'visited'), visit('b', '10:05', 'cancelled'), visit('c', '10:30')]
  assert.deepEqual(dayClashes(events, visits, clock), [])
})

test('a long event overlapping two later visits reports both', () => {
  const w = dayClashes([ev('Training', '09:00', { end: '12:00', title: 'Training' })], [visit('a', '10:00', 'planned', 'A'), visit('b', '11:00', 'planned', 'B')], clock)
  assert.equal(w.length, 2)
})
