// R3: phone reminder rules.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { remindersDue, morningMinutes, morningMessage, eveningMessage, collectNote } from '../../src/lib/reminderRules.ts'
import type { RVisit, RFollowUp, REvent } from '../../src/lib/reminderRules.ts'

const at = (day: string, hm: string) => new Date(`${day}T${hm}:00+05:30`)
const iso = (day: string, hm: string) => `${day}T${hm}:00+05:30`
const D = '2026-10-16'
const T = '2026-10-17'

const visit = (id: string, hm: string, extra: Partial<RVisit> = {}): RVisit =>
  ({ id, customer_id: 'c-' + id, status: 'planned', planned_start: iso(D, hm), name: 'Dr ' + id, ...extra })
const ev = (id: string, title: string, start: string, extra: Partial<REvent> = {}): REvent =>
  ({ id, title, category: 'work', starts_at: start, all_day: false, status: 'planned', reminder_minutes: 15, ...extra })

const run = (now: Date, v: RVisit[], e: REvent[], f: RFollowUp[] = [], sent = new Set<string>(), workStart: string | null = '09:30:00') =>
  remindersDue({ now, visits: v, events: e, followUps: f, workStart, sent })

test('visit reminder 15 minutes before, once, and not too late', () => {
  const v = [visit('a', '14:00')]
  assert.equal(run(at(D, '13:44'), v, []).length, 0)
  const due = run(at(D, '13:45'), v, [])
  assert.equal(due.length, 1)
  assert.equal(due[0].title, 'Dr a at 2:00 PM')
  assert.deepEqual(due[0].actions.map(a => a.action), ['later'])
  assert.equal(run(at(D, '13:50'), v, [], [], new Set([due[0].key])).length, 0)
  // phone was off: still useful until 30 minutes after the visit time
  assert.equal(run(at(D, '14:30'), v, []).length, 1)
  assert.equal(run(at(D, '14:31'), v, []).length, 0)
})

test('recorded or cancelled visits never remind', () => {
  assert.equal(run(at(D, '13:50'), [visit('a', '14:00', { status: 'visited' })], []).length, 0)
  assert.equal(run(at(D, '13:50'), [visit('a', '14:00', { status: 'cancelled' })], []).length, 0)
})

test('moving a visit gives the new time its own reminder', () => {
  const first = run(at(D, '13:45'), [visit('a', '14:00')], [])[0]
  const moved = run(at(D, '14:15'), [visit('a', '14:30')], [], [], new Set([first.key]))
  assert.equal(moved.length, 1)
  assert.notEqual(moved[0].key, first.key)
})

test('the visit reminder says what to collect there', () => {
  const f: RFollowUp[] = [
    { id: 'f1', customer_id: 'c-a', due_date: '2026-10-15', action: 'Payment pending', expected_value: 5000, status: 'open', name: 'Dr a' },
    { id: 'f2', customer_id: 'c-a', due_date: D, action: 'Give samples', expected_value: 0, status: 'open', name: 'Dr a' },
    { id: 'f3', customer_id: 'c-a', due_date: T, action: 'Later thing', expected_value: 0, status: 'open', name: 'Dr a' },
    { id: 'f4', customer_id: 'c-b', due_date: D, action: 'Other doctor', expected_value: 0, status: 'open', name: 'Dr b' }
  ]
  assert.equal(collectNote('c-a', D, f), 'Collect/ask ₹5,000: Payment pending\nAlso: Give samples')
  assert.equal(run(at(D, '13:45'), [visit('a', '14:00')], [], f)[0].body, 'Collect/ask ₹5,000: Payment pending\nAlso: Give samples')
})

test('personal events use their own reminder; no-reminder and all-day get none', () => {
  const e = [
    ev('s', 'Stockist', iso(D, '14:00')),
    ev('n', 'No alert', iso(D, '14:00'), { reminder_minutes: null }),
    ev('d', 'All day', iso(D, '00:00'), { all_day: true }),
    ev('c', 'Cancelled', iso(D, '14:00'), { status: 'cancelled' })
  ]
  const due = run(at(D, '13:45'), [], e)
  assert.deepEqual(due.map(a => a.title), ['Stockist'])
  assert.equal(due[0].body, 'At 2:00 PM.')
  assert.deepEqual(due[0].actions.map(a => a.action), ['done', 'later'])
})

test('a day-before reminder for a journey asks about ticket, bag and alarm', () => {
  const trip = ev('t', 'Train to Pune', iso(T, '06:00'), { category: 'travel', reminder_minutes: 1440 })
  const due = run(at(D, '06:10'), [], [trip])
  assert.equal(due.length, 1)
  assert.equal(due[0].body, 'At 6:00 AM tomorrow. Ticket, bag and alarm ready?')
})

test('morning message 60 minutes before work start (default 8:30, never before 6:00)', () => {
  assert.equal(morningMinutes('09:30:00'), 8 * 60 + 30)
  assert.equal(morningMinutes('10:00'), 9 * 60)
  assert.equal(morningMinutes('06:30'), 6 * 60)
  assert.equal(morningMinutes(null), 8 * 60 + 30)
  assert.equal(run(at(D, '08:29'), [], []).length, 0)
  const m = run(at(D, '08:30'), [], [])
  assert.deepEqual(m.map(a => a.key), [`morning:${D}`])
  assert.equal(run(at(D, '09:00'), [], [], [], new Set([`morning:${D}`])).length, 0)
  assert.equal(run(at(D, '11:31'), [], []).length, 0)
})

test('morning message lists the day', () => {
  const msg = morningMessage(D, {
    visits: [visit('b', '12:00'), visit('a', '10:00'), visit('x', '09:00', { status: 'cancelled' })],
    events: [ev('s', 'Stockist', iso(D, '14:00'))],
    followUps: [{ id: 'f', customer_id: 'c-z', due_date: D, action: 'Collect', expected_value: 2500, status: 'open', name: 'Z' }]
  })
  assert.equal(msg.body, '2 visits, first Dr a at 10:00 AM\nStockist at 2:00 PM\n1 follow-up due, ₹2,500 to collect/ask')
  assert.equal(morningMessage(D, { visits: [], events: [], followUps: [] }).title, 'Good morning')
})

test('evening message: what is left today, journey checklist, tomorrow', () => {
  const msg = eveningMessage(D, at(D, '20:00').getTime(), {
    visits: [visit('a', '14:00'), visit('b', '10:00', { planned_start: iso(T, '10:00') })],
    events: [ev('t', 'Train to Pune', iso(T, '06:00'), { category: 'travel' }), ev('g', 'Gym', iso(T, '19:00'))],
    followUps: []
  })
  assert.equal(msg.title, 'Get ready for tomorrow')
  assert.equal(msg.body, [
    '1 item from today not done. Tick them or move them.',
    'Journey tomorrow: Train to Pune at 6:00 AM.',
    'Ticket ready? Bag packed? Alarm set? Sleep early.',
    'Tomorrow: 1 visit, first Dr b at 10:00 AM.',
    'Also tomorrow: Gym'
  ].join('\n'))
  const empty = eveningMessage(D, at(D, '20:00').getTime(), { visits: [], events: [], followUps: [] })
  assert.equal(empty.body, 'Nothing planned for tomorrow yet. Plan it now in 2 minutes.')
  assert.equal(run(at(D, '20:00'), [], []).map(a => a.key).join(), `evening:${D}`)
})

test('the server uses an exact copy of these rules', () => {
  const app = readFileSync(new URL('../../src/lib/reminderRules.ts', import.meta.url), 'utf8')
  const server = readFileSync(new URL('../../supabase/functions/reminders/reminderRules.ts', import.meta.url), 'utf8')
  assert.equal(server, app)
})
