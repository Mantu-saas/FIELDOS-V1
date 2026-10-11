// C12: COACH "best next move". Run with: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  valuedFollowUps, overdueWithoutValue, fallbackCustomers, followUpCountPhrase, buildNextMove,
} from '../../src/lib/coachRules.ts'

const TODAY = '2026-10-12'
const money = (n: number) => '₹' + n
const names: Record<string, string> = { a: 'Asha', b: 'Bala', c: 'Chitra', d: 'Deepak', e: 'Esha' }
const nameOf = (id: string) => names[id] ?? 'Customer'
const fu = (customer_id: string, due_date: string, expected_value: number, action = 'Call') =>
  ({ customer_id, due_date, expected_value, action })
const cust = (id: string, potential_amount: number) => ({ id, name: names[id], potential_amount })

const base = { customers: [] as ReturnType<typeof cust>[], plannedTodayIds: new Set<string>(), today: TODAY, remaining: 100000, nameOf, money }

// ---------- 1. Count wording matches the number listed ----------

test('count phrase: 0, 1, 2 and 3 follow-ups', () => {
  assert.equal(followUpCountPhrase(0), '')
  assert.equal(followUpCountPhrase(1), 'This follow-up carries')
  assert.equal(followUpCountPhrase(2), 'These 2 follow-ups carry')
  assert.equal(followUpCountPhrase(3), 'These 3 follow-ups carry')
})

test('displayed sentence matches the number of follow-ups actually listed (0, 1, 2, 3)', () => {
  const pool = [fu('a', TODAY, 5000), fu('b', TODAY, 4000), fu('c', TODAY, 3000), fu('d', TODAY, 2000)]
  for (const n of [0, 1, 2, 3]) {
    const text = buildNextMove({ ...base, open: pool.slice(0, n) })
    const listed = (text.match(/— expected /g) ?? []).length
    assert.equal(listed, n, `listed for n=${n}`)
    assert.ok(!text.includes('These three'), 'old fixed wording must be gone')
    if (n === 0) assert.ok(!text.includes('carries') && !text.includes('carry'))
    if (n === 1) assert.ok(text.includes('This follow-up carries ₹5000'))
    if (n === 2) assert.ok(text.includes('These 2 follow-ups carry ₹9000'))
    if (n === 3) assert.ok(text.includes('These 3 follow-ups carry ₹12000'))
  }
})

test('more than three valued follow-ups: only three listed and the sentence says 3', () => {
  const pool = [fu('a', TODAY, 5000), fu('b', TODAY, 4000), fu('c', TODAY, 3000), fu('d', TODAY, 2000)]
  const text = buildNextMove({ ...base, open: pool })
  assert.equal((text.match(/— expected /g) ?? []).length, 3)
  assert.ok(text.includes('These 3 follow-ups carry ₹12000'))
  assert.ok(!text.includes('Deepak'))
})

test('valued follow-ups keep the original order: due/overdue first, then highest value', () => {
  const list = valuedFollowUps([fu('a', '2026-10-20', 9000), fu('b', '2026-10-10', 1000), fu('c', TODAY, 3000)], TODAY)
  assert.deepEqual(list.map(f => f.customer_id), ['c', 'b', 'a'])
})

// ---------- 2. Overdue follow-ups without a value are shown, with no invented amount ----------

test('overdue follow-ups with no value are listed (oldest first), not silently ignored', () => {
  const open = [fu('a', '2026-10-10', 0), fu('b', '2026-10-01', 0), fu('c', TODAY, 0), fu('d', '2026-10-20', 0)]
  assert.deepEqual(overdueWithoutValue(open, TODAY).map(f => f.customer_id), ['b', 'a'])  // due today / future are not overdue
  const text = buildNextMove({ ...base, open })
  assert.ok(text.includes('OVERDUE — NO VALUE RECORDED'))
  assert.ok(text.indexOf('Bala') < text.indexOf('Asha'))
  assert.ok(text.includes('Start with the oldest overdue follow-up: Bala'))
})

test('no money value is ever invented for an overdue follow-up without a value', () => {
  const text = buildNextMove({ ...base, open: [fu('a', '2026-10-05', 0)] })
  const section = text.split('OVERDUE — NO VALUE RECORDED')[1].split('\n\n')[0]
  assert.ok(!section.includes('₹'), 'no amount in the overdue section')
  assert.ok(text.includes('not counted toward your target'))
})

test('overdue-no-value section appears alongside valued follow-ups, and valued ones still lead', () => {
  const text = buildNextMove({ ...base, open: [fu('a', TODAY, 5000), fu('b', '2026-10-03', 0)] })
  assert.ok(text.includes('This follow-up carries ₹5000'))
  assert.ok(text.includes('OVERDUE — NO VALUE RECORDED'))
  assert.ok(text.includes('Start with Asha.'))
})

test('overdue section is NOT shown when no overdue follow-up lacks a value', () => {
  const cases = {
    'no follow-ups': [],
    'overdue but has a value': [fu('a', '2026-10-01', 500)],
    'due today, no value': [fu('a', TODAY, 0)],
    'due later, no value': [fu('a', '2026-10-20', 0)],
  }
  for (const [label, open] of Object.entries(cases)) {
    const text = buildNextMove({ ...base, open, customers: [cust('b', 5000)] })
    assert.ok(!text.includes('OVERDUE — NO VALUE RECORDED'), label)
    assert.ok(!text.includes('No expected value is saved for'), label)
  }
})

test('overdue section wording: singular for one item, plural for two or three', () => {
  const sectionOf = (t: string) => t.split('OVERDUE — NO VALUE RECORDED\n')[1].split('\n\n')[0]
  const one = sectionOf(buildNextMove({ ...base, open: [fu('a', '2026-10-01', 0)] }))
  assert.equal(one.split('\n').filter(l => /^\d\./.test(l)).length, 1)
  assert.ok(one.includes('for this one, so it is not counted'))
  assert.ok(!one.includes('these'))
  for (const n of [2, 3]) {
    const open = ['a', 'b', 'c'].slice(0, n).map((id, k) => fu(id, `2026-10-0${k + 1}`, 0))
    const sec = sectionOf(buildNextMove({ ...base, open }))
    assert.equal(sec.split('\n').filter(l => /^\d\./.test(l)).length, n, `lines for ${n}`)
    assert.ok(sec.includes('for these, so they are not counted'), `plural for ${n}`)
  }
})

test('a missing (null) expected value counts as no value', () => {
  const open = [{ customer_id: 'a', due_date: '2026-10-01', expected_value: null, action: 'Call' }]
  assert.equal(overdueWithoutValue(open, TODAY).length, 1)
  assert.equal(valuedFollowUps(open, TODAY).length, 0)
})

test('at most three overdue follow-ups without a value are listed', () => {
  const open = ['a', 'b', 'c', 'd'].map((id, n) => fu(id, `2026-10-0${n + 1}`, 0))
  assert.equal(overdueWithoutValue(open, TODAY).length, 3)
})

// ---------- 3. Customers already on today's route are not suggested as new visits ----------

test('fallback skips customers already planned today and those with zero potential', () => {
  const customers = [cust('a', 10000), cust('b', 8000), cust('c', 0), cust('d', 5000), cust('e', 3000)]
  assert.deepEqual(fallbackCustomers(customers, new Set(['a'])).map(c => c.id), ['b', 'd', 'e'])
})

test('top-potential customer already on today\'s route is not recommended as a new visit', () => {
  const customers = [cust('a', 10000), cust('b', 8000)]
  const text = buildNextMove({ ...base, open: [], customers, plannedTodayIds: new Set(['a']) })
  assert.ok(text.includes('1. Bala — potential ₹8000'))
  assert.ok(!text.includes('Asha'))
  assert.ok(text.includes('Start with Bala'))
})

test('a planned-today customer with an urgent overdue follow-up is still shown, marked as on the route', () => {
  const text = buildNextMove({ ...base, open: [fu('a', '2026-10-05', 0)], customers: [cust('a', 10000)], plannedTodayIds: new Set(['a']) })
  assert.ok(text.includes("1. Asha — Call — due 2026-10-05 (already on today's route)"))
})

test('a customer listed for an overdue follow-up is not repeated in the new-visit list', () => {
  const text = buildNextMove({ ...base, open: [fu('a', '2026-10-05', 0)], customers: [cust('a', 10000), cust('b', 5000)] })
  assert.equal(text.split('Asha').length - 1, 2)   // overdue line + "Start with the oldest overdue follow-up (Asha)"
  assert.ok(text.includes('1. Bala — potential ₹5000'))
  assert.ok(text.includes('Start with the oldest overdue follow-up (Asha), then consider Bala.'))
})

test('all high-potential customers already on today\'s route: says so instead of repeating them', () => {
  const text = buildNextMove({ ...base, open: [], customers: [cust('a', 10000)], plannedTodayIds: new Set(['a']) })
  assert.ok(text.includes("already on today's route"))
  assert.ok(!text.includes('1. Asha'))
})

test('nothing saved at all: unchanged honest message', () => {
  const text = buildNextMove({ ...base, open: [], customers: [cust('a', 0)] })
  assert.ok(text.includes('No follow-up values or customer potentials are saved'))
})

test('helpers do not change the arrays they are given', () => {
  const open = [fu('b', TODAY, 1), fu('a', TODAY, 2)]
  const customers = [cust('b', 1), cust('a', 2)]
  buildNextMove({ ...base, open, customers })
  assert.deepEqual(open.map(f => f.customer_id), ['b', 'a'])
  assert.deepEqual(customers.map(c => c.id), ['b', 'a'])
})
