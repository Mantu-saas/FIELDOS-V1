// R3: Quick add understands one typed line.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseQuickAdd, quickReminder } from '../../src/lib/quickAdd.ts'

test('time with am/pm', () => {
  assert.deepEqual(parseQuickAdd('stockist 2pm'), { title: 'Stockist', day: 'today', time: '14:00', category: 'work' })
  assert.deepEqual(parseQuickAdd('Call Dr Rao at 11:30 AM'), { title: 'Call Dr Rao', day: 'today', time: '11:30', category: 'work' })
  assert.deepEqual(parseQuickAdd('lunch 12pm'), { title: 'Lunch', day: 'today', time: '12:00', category: 'work' })
  assert.deepEqual(parseQuickAdd('wake up 5.45 am'), { title: 'Wake up', day: 'today', time: '05:45', category: 'work' })
})

test('day words: tomorrow, kal, today', () => {
  assert.deepEqual(parseQuickAdd('collect payment City Clinic tomorrow 11am'), { title: 'Collect payment City Clinic', day: 'tomorrow', time: '11:00', category: 'work' })
  assert.deepEqual(parseQuickAdd('book ticket kal'), { title: 'Book ticket', day: 'tomorrow', time: null, category: 'travel' })
  assert.deepEqual(parseQuickAdd('aaj 6pm gym'), { title: 'Gym', day: 'today', time: '18:00', category: 'work' })
})

test('24-hour time and rounding to 5-minute steps', () => {
  assert.deepEqual(parseQuickAdd('meeting 14:30'), { title: 'Meeting', day: 'today', time: '14:30', category: 'work' })
  assert.equal(parseQuickAdd('call 3:07pm').time, '15:05')
})

test('numbers that are not times stay in the title', () => {
  assert.deepEqual(parseQuickAdd('collect 5000 from Sharma'), { title: 'Collect 5000 from Sharma', day: 'today', time: null, category: 'work' })
  assert.equal(parseQuickAdd('13pm').time, null)
})

test('reminder only when there is a time', () => {
  assert.equal(quickReminder('14:00'), 15)
  assert.equal(quickReminder(null), null)
})
