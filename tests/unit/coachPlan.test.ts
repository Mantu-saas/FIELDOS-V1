// COACH: today's priorities, customer suggestions and protected home time. Run with: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  clockText, homePlanText, parseQuestionTime, planAroundCommitments, suggestCustomers, todayPriorities,
  PLAN_VISIT_MINUTES,
} from '../../src/lib/coachPlan.ts'
import type { CustomerFacts, PriorityInput } from '../../src/lib/coachPlan.ts'

const money = (n: number) => `₹${n}`
const T = (h: number, m = 0) => h * 60 + m
const visit = (name: string, h: number, m = 0, priority: number | null = 3) => ({ id: name, name, priority, startMin: T(h, m) })
const event = (title: string, start: number | null, end: number | null = null, allDay = false, location: string | null = null) =>
  ({ title, allDay, startMin: start, endMin: end, location })
const cust = (name: string, extra: Partial<CustomerFacts> = {}): CustomerFacts => ({
  id: name, name, priority: 3, potential: 0, lastVisitDate: null, monthSales: 0, phone: '999', ...extra,
})

// ---------------- time helpers ----------------

test('clock text is 12-hour India-style', () => {
  assert.equal(clockText(T(20)), '8:00 PM')
  assert.equal(clockText(T(9, 5)), '9:05 AM')
  assert.equal(clockText(0), '12:00 AM')
  assert.equal(clockText(T(12, 30)), '12:30 PM')
})

test('a home time typed in a question is understood, and a missing AM/PM is read as evening and flagged', () => {
  assert.deepEqual(parseQuestionTime('can i get home by 9 30 pm'), { mins: T(21, 30), assumedPm: false })
  assert.deepEqual(parseQuestionTime('can i reach home by 21 30'), { mins: T(21, 30), assumedPm: false })
  assert.deepEqual(parseQuestionTime('can i be home by 8'), { mins: T(20), assumedPm: true })
  assert.deepEqual(parseQuestionTime('home before 7 am'), { mins: T(7), assumedPm: false })
  assert.equal(parseQuestionTime('can i get home on time'), null)
  assert.equal(parseQuestionTime('home by 25 00'), null)
})

// ---------------- protected home time and commitments ----------------

test('marriage ceremony at 8 PM: visits that would clash are moved or called, and the warning names the event', () => {
  const plan = planAroundCommitments({
    visits: [visit('Sharma Traders', 18, 0, 1), visit('Gupta Stores', 19, 50, 4), visit('Rao Medical', 20, 30, 2)],
    commitments: [event('Marriage ceremony', T(20), null, false, 'Ram Mandap')],
    homeMins: T(21, 30), homeLabel: 'your home time', nowMins: T(16),
  })
  assert.deepEqual(plan.mustReach, { label: '"Marriage ceremony" at Ram Mandap', mins: T(20), kind: 'event' })
  assert.equal(plan.fits, false)
  const byName = Object.fromEntries(plan.verdicts.map(v => [v.visit.name, v]))
  assert.equal(byName['Sharma Traders'].action, 'keep')                 // ends 6:15, well before 8
  assert.equal(byName['Gupta Stores'].action, 'call')                   // 7:50-8:05 runs into the ceremony, low priority
  assert.match(byName['Gupta Stores'].reason, /would still be running when "Marriage ceremony" starts at 8:00 PM/)
  // 8:30 PM is after the ceremony starts; no end time is saved, so it is a warning, not a guess
  assert.equal(byName['Rao Medical'].action, 'keep')
  assert.ok(plan.warnings.some(w => /Rao Medical at 8:30 PM is 30 min after "Marriage ceremony" starts/.test(w)))
  assert.match(plan.warnings[0], /Your plan may make you miss "Marriage ceremony" at Ram Mandap at 8:00 PM: 1 visit does not fit\./)
  const text = homePlanText(plan)
  assert.match(text, /You need to reach "Marriage ceremony" at Ram Mandap by 8:00 PM\./)
  assert.match(text, /VERDICT: your plan does not fit\./)
  assert.match(text, /Travel time is not saved/)
})

test('a visit soon after a no-end event starts is flagged as a warning, not silently allowed', () => {
  const plan = planAroundCommitments({
    visits: [visit('Rao Medical', 20, 30, 2)],
    commitments: [event('Birthday dinner', T(20))],
    homeMins: null, homeLabel: 'your home time', nowMins: T(16),
  })
  assert.equal(plan.verdicts[0].action, 'keep')
  assert.ok(plan.warnings.some(w => /30 min after "Birthday dinner" starts, and no end time is saved/.test(w)))
})

test('an event with a start AND end blocks only that window; visits after it are fine', () => {
  const plan = planAroundCommitments({
    visits: [visit('A', 13, 30), visit('B', 15, 0)],
    commitments: [event('Doctor', T(13), T(14))],
    homeMins: T(21), homeLabel: 'your home time', nowMins: T(9),
  })
  assert.equal(plan.verdicts.find(v => v.visit.name === 'A')?.action, 'call')
  assert.equal(plan.verdicts.find(v => v.visit.name === 'B')?.action, 'keep')
})

test('a morning event with no end does not block the whole day', () => {
  const plan = planAroundCommitments({
    visits: [visit('A', 11, 0)],
    commitments: [event('Gym', T(7))],
    homeMins: null, homeLabel: 'your home time', nowMins: null,          // planning tomorrow
  })
  assert.equal(plan.fits, true)
  assert.equal(plan.warnings.length, 0)
})

test('all-day events are not treated as a time block; COACH says it cannot tell when to leave', () => {
  const plan = planAroundCommitments({
    visits: [visit('A', 11, 0)],
    commitments: [event('Sister visiting', null, null, true)],
    homeMins: T(21), homeLabel: 'your home time', nowMins: T(9),
  })
  assert.equal(plan.fits, true)
  assert.ok(plan.notes.some(n => /"Sister visiting" is saved as all-day, so I cannot tell when you must leave/.test(n)))
})

test('home time: a visit that would end after it is changed; a tight gap is warned about', () => {
  const plan = planAroundCommitments({
    visits: [visit('Early', 20, 50, 3), visit('Late', 21, 20, 1)],
    commitments: [],
    homeMins: T(21, 30), homeLabel: 'your home time', nowMins: T(18),
  })
  assert.equal(plan.verdicts.find(v => v.visit.name === 'Late')?.action, 'move')     // priority 1 -> move, not drop
  assert.match(plan.verdicts.find(v => v.visit.name === 'Late')!.reason, /would end after your home time \(9:30 PM\)/)
  assert.equal(plan.verdicts.find(v => v.visit.name === 'Early')?.action, 'keep')
  assert.ok(plan.warnings.some(w => /Tight: Early at 8:50 PM leaves only 25 min before your home time/.test(w)))
})

test('no commitments and no home time: the plan fits but says what is missing', () => {
  const plan = planAroundCommitments({ visits: [visit('A', 11)], commitments: [], homeMins: null, homeLabel: 'your home time', nowMins: T(9) })
  assert.equal(plan.fits, true)
  assert.equal(plan.mustReach, null)
  assert.ok(plan.notes.some(n => /No home time is saved/.test(n)))
  assert.ok(plan.notes.some(n => new RegExp(`${PLAN_VISIT_MINUTES} minutes each`).test(n)))
})

test('events already over today are ignored; a home time already passed is reported', () => {
  const plan = planAroundCommitments({
    visits: [], commitments: [event('Breakfast meeting', T(8), T(9))],
    homeMins: T(18), homeLabel: 'your home time', nowMins: T(19),
  })
  assert.equal(plan.mustReach, null)
  assert.ok(plan.notes.some(n => /has already passed/.test(n)))
})

// ---------------- empty schedule: who deserves attention ----------------

test('customers are ranked by priority, then potential, then the longest since the last visit, with reasons', () => {
  const { picks, missing } = suggestCustomers([
    cust('Low', { priority: 4, potential: 90000 }),
    cust('TopRecent', { priority: 1, potential: 5000, lastVisitDate: '2026-10-10' }),
    cust('TopOld', { priority: 1, potential: 5000, lastVisitDate: '2026-09-01' }),
    cust('TopBig', { priority: 1, potential: 50000, monthSales: 2000 }),
  ], { today: '2026-10-13', exclude: new Set(), lookBackDays: 90, money })
  assert.equal(missing, null)
  assert.deepEqual(picks.map(p => p.customer.name), ['TopBig', 'TopOld', 'TopRecent'])
  assert.equal(picks[0].reason, 'priority 1 (your highest), potential ₹50000, no completed visit in the last 90 days, ₹2000 sold this month')
  assert.match(picks[1].reason, /last visited 42 days ago/)
  assert.match(picks[0].action, /^Call TopBig to arrange a visit/)
})

test('customers already planned, visited or on a follow-up are not suggested again', () => {
  const { picks } = suggestCustomers([cust('A', { priority: 1 }), cust('B', { priority: 2 })],
    { today: '2026-10-13', exclude: new Set(['A']), lookBackDays: 90, money })
  assert.deepEqual(picks.map(p => p.customer.name), ['B'])
})

test('when saved data cannot tell customers apart, nothing is invented: COACH says what to add', () => {
  const r = suggestCustomers([cust('A'), cust('B')], { today: '2026-10-13', exclude: new Set(), lookBackDays: 90, money })
  assert.deepEqual(r.picks, [])
  assert.match(r.missing ?? '', /cannot tell who matters most\. Set priority \(1 = most important\) and potential/)
  const none = suggestCustomers([], { today: '2026-10-13', exclude: new Set(), lookBackDays: 90, money })
  assert.match(none.missing ?? '', /No active customers are saved yet/)
})

test('a customer with no phone number gets an honest action', () => {
  const { picks } = suggestCustomers([cust('A', { priority: 1, phone: null }), cust('B')],
    { today: '2026-10-13', exclude: new Set(), lookBackDays: 90, money })
  assert.match(picks[0].action, /no phone number is saved/)
})

// ---------------- today's priorities ----------------

const base = (over: Partial<PriorityInput> = {}): PriorityInput => ({
  nowMins: T(10), upcoming: [], passed: [], dueFollowUps: [], today: '2026-10-13',
  suggestions: [], suggestionsMissing: null, plan: null, tomorrowFirst: null, tomorrowCount: 0, money, ...over,
})

test('empty schedule: the first thing is a real customer with the evidence, not "nothing is scheduled"', () => {
  const { picks } = suggestCustomers([cust('Sharma', { priority: 1, potential: 40000 }), cust('Gupta', { priority: 2 })],
    { today: '2026-10-13', exclude: new Set(), lookBackDays: 90, money })
  const items = todayPriorities(base({ suggestions: picks }))
  assert.equal(items[0].priority, 'Contact Sharma')
  assert.match(items[0].reason, /priority 1 \(your highest\), potential ₹40000/)
  assert.match(items[0].action, /^Call Sharma to arrange a visit/)
  assert.equal(items[1].priority, 'Contact Gupta')
  assert.equal(items[items.length - 1].priority, 'Plan tomorrow')
  assert.ok(!items.some(i => /Nothing is scheduled/.test(i.priority + i.reason)))
})

test('empty schedule without enough data: says what is missing instead of a made-up plan', () => {
  const items = todayPriorities(base({ suggestionsMissing: 'All your customers have the same priority…' }))
  assert.equal(items[0].priority, 'Set up who matters most')
  assert.match(items[0].reason, /same priority/)
})

test('a visit within the hour comes first; valued follow-ups next; then later visits and unvalued follow-ups', () => {
  const items = todayPriorities(base({
    upcoming: [
      { name: 'Later Shop', priority: 2, startMin: T(15), nextAction: null },
      { name: 'Soon Shop', priority: 3, startMin: T(10, 30), nextAction: 'Show new catalogue' },
    ],
    dueFollowUps: [
      { name: 'Small', action: 'call back', dueDate: '2026-10-13', value: 0 },
      { name: 'Big', action: 'collect order', dueDate: '2026-10-11', value: 25000 },
    ],
  }))
  assert.deepEqual(items.map(i => i.priority).slice(0, 4), [
    'Visit Soon Shop at 10:30 AM', 'Follow up with Big', 'Follow up with Small', 'Visit Later Shop at 3:00 PM',
  ])
  assert.match(items[0].reason, /starting in 30 min; priority 3/)
  assert.match(items[0].action, /Show new catalogue/)
  assert.match(items[1].reason, /overdue since 2026-10-11, expected ₹25000 \(the value you saved\)/)
})

test('a far-off visit does not outrank a valuable follow-up call', () => {
  const items = todayPriorities(base({
    upcoming: [{ name: 'Afternoon', priority: 3, startMin: T(16), nextAction: null }],
    dueFollowUps: [{ name: 'Big', action: 'collect order', dueDate: '2026-10-13', value: 10000 }],
  }))
  assert.equal(items[0].priority, 'Follow up with Big')
  assert.equal(items[1].priority, 'Visit Afternoon at 4:00 PM')
})

test('a plan that breaks a personal commitment becomes the most important thing', () => {
  const plan = planAroundCommitments({
    visits: [visit('Gupta Stores', 19, 50, 4)], commitments: [event('Marriage ceremony', T(20))],
    homeMins: null, homeLabel: 'your home time', nowMins: T(10),
  })
  const items = todayPriorities(base({ plan, upcoming: [{ name: 'Gupta Stores', priority: 4, startMin: T(19, 50), nextAction: null }] }))
  assert.equal(items[0].priority, 'Protect "Marriage ceremony" at 8:00 PM')
  assert.match(items[0].action, /call Gupta Stores instead of visiting/)
})

test('visits with no outcome recorded and tomorrow preparation are included', () => {
  const items = todayPriorities(base({
    upcoming: [{ name: 'A', priority: 1, startMin: T(11), nextAction: null }],
    passed: [{ name: 'Old Shop' }],
    tomorrowFirst: { name: 'Tom Shop', startMin: T(10, 5), nextAction: null }, tomorrowCount: 2,
  }))
  assert.ok(items.some(i => i.priority === 'Record the outcome for Old Shop'))
  assert.equal(items[items.length - 1].priority, 'Prepare for tomorrow: Tom Shop at 10:05 AM')
  assert.match(items[items.length - 1].reason, /first of 2 visits saved for tomorrow/)
  // customers are not suggested when the day already has work
  assert.ok(!items.some(i => i.priority.startsWith('Contact')))
})
