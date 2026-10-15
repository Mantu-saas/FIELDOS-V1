// R1: TODAY's Next action rule. Times are India time (+05:30).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nextAction, homeMinutes } from '../../src/lib/nextAction.ts'

const at = (hhmm: string, date = '2026-10-13') => new Date(`${date}T${hhmm}:00+05:30`)
const visit = (name: string, hhmm: string, status = 'planned', date = '2026-10-13') =>
  ({ name, status, planned_start: `${date}T${hhmm}:00+05:30` })

test('1. a visit whose time passed with no result comes first', () => {
  const r = nextAction({ now: at('11:00'), visits: [visit('Archana', '10:00'), visit('Debasis', '12:30')], followUps: [{ name: 'X', action: 'Call', due_date: '2026-10-10' }], homeTime: '19:00:00' })
  assert.equal(r.kind, 'record')
  assert.equal(r.title, 'Record the result of Archana')
  assert.equal(r.reason, 'Planned for 10:00 AM; no result recorded yet.')
})

test('a visit only 10 minutes late is not yet "missed"', () => {
  const r = nextAction({ now: at('10:10'), visits: [visit('Archana', '10:00')], followUps: [], homeTime: null })
  assert.equal(r.kind, 'visit')
})

test('recorded, cancelled or rescheduled visits never count as missed or next', () => {
  for (const status of ['visited', 'cancelled', 'unavailable', 'rescheduled']) {
    const r = nextAction({ now: at('11:00'), visits: [visit('A', '10:00', status)], followUps: [], homeTime: null })
    assert.equal(r.kind, 'done', status)
    assert.equal(r.visitsLeft, 0, status)
  }
})

test('2. within 60 minutes of home time: wrap up, naming tomorrow\'s first visit', () => {
  const r = nextAction({ now: at('18:15'), visits: [visit('Debasis', '12:30', 'planned', '2026-10-14'), visit('Late', '18:45')], followUps: [], homeTime: '19:00:00' })
  assert.equal(r.kind, 'wrap_up')
  assert.equal(r.reason, 'Home time 7:00 PM is in 45 minutes. Tomorrow starts with Debasis at 12:30 PM.')
})

test('after home time it still says wrap up, honestly', () => {
  const r = nextAction({ now: at('20:00'), visits: [], followUps: [], homeTime: '19:00' })
  assert.equal(r.reason, 'Your home time (7:00 PM) has passed. Nothing is planned for tomorrow yet.')
})

test('no home time saved: the wrap-up rule is skipped, never guessed', () => {
  const r = nextAction({ now: at('22:00'), visits: [], followUps: [], homeTime: null })
  assert.equal(r.kind, 'done')
})

test('3. the oldest overdue follow-up beats the next visit', () => {
  const r = nextAction({
    now: at('11:00'),
    visits: [visit('Shop', '15:00')],
    followUps: [{ name: 'Dr Rao', action: 'Send price list', due_date: '2026-10-13' }, { name: 'City Chemist', action: 'Collect payment', due_date: '2026-10-11' }],
    homeTime: '19:00:00',
  })
  assert.equal(r.kind, 'follow_up')
  assert.equal(r.title, 'City Chemist: Collect payment')
  assert.equal(r.reason, 'Follow-up overdue by 2 days.')
  assert.equal(r.followUpsDue, 2)
})

test('future follow-ups are ignored', () => {
  const r = nextAction({ now: at('11:00'), visits: [], followUps: [{ name: 'A', action: 'B', due_date: '2026-10-20' }], homeTime: null })
  assert.equal(r.kind, 'done')
  assert.equal(r.followUpsDue, 0)
})

test('4. otherwise, the next planned visit today with the count left', () => {
  const r = nextAction({ now: at('09:00'), visits: [visit('Debasis', '12:30'), visit('Archana', '17:00'), visit('Tomorrow', '10:00', 'planned', '2026-10-14')], followUps: [], homeTime: '19:00:00' })
  assert.equal(r.kind, 'visit')
  assert.equal(r.title, 'Go to Debasis at 12:30 PM')
  assert.equal(r.reason, '2 visits left today.')
})

test('5. nothing left: plan tomorrow', () => {
  const r = nextAction({ now: at('12:00'), visits: [], followUps: [], homeTime: '19:00' })
  assert.equal(r.kind, 'done')
  assert.equal(r.title, "Today's plan is done")
})

test('the day is India time even when the server clock is UTC (early morning IST)', () => {
  // 05:00 IST on 14 Oct = 23:30 UTC on 13 Oct
  const r = nextAction({ now: new Date('2026-10-13T23:30:00Z'), visits: [visit('Debasis', '12:30', 'planned', '2026-10-14')], followUps: [], homeTime: '19:00' })
  assert.equal(r.kind, 'visit')
  assert.equal(r.title, 'Go to Debasis at 12:30 PM')
})

test('home time parsing accepts saved formats and rejects bad ones', () => {
  assert.equal(homeMinutes('19:00:00'), 1140)
  assert.equal(homeMinutes('07:30'), 450)
  assert.equal(homeMinutes(null), null)
  assert.equal(homeMinutes('7pm'), null)
})

// R3: a task still ahead today is the next action; the card never says "done" before it
test('a personal task ahead today comes before "done"', () => {
  const now = new Date('2026-10-15T18:33:00+05:30')
  const r = nextAction({ now, visits: [], followUps: [], homeTime: null, events: [{ title: 'Test', starts_at: '2026-10-15T18:40:00+05:30', all_day: false, status: 'planned' }] })
  assert.equal(r.kind, 'task')
  assert.equal(r.title, 'Test at 6:40 PM')
  const done = nextAction({ now, visits: [], followUps: [], homeTime: null, events: [{ title: 'Test', starts_at: '2026-10-15T18:40:00+05:30', all_day: false, status: 'completed' }] })
  assert.equal(done.kind, 'done')
})

test('"1 minute", not "1 minutes"', () => {
  const r = nextAction({ now: new Date('2026-10-15T18:59:00+05:30'), visits: [], followUps: [], homeTime: '19:00:00' })
  assert.match(r.reason, /is in 1 minute\./)
})
