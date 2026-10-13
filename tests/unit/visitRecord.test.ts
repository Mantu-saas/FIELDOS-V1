// C21 (Fix 1): recording a visit and removing a stop only act on a visit that is still planned.
// Uses a small in-memory pretend database that applies the same filters the app sends.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  recordVisit, removePlannedStop, ALREADY_RECORDED_MESSAGE, REMOVE_NOT_PLANNED_MESSAGE,
} from '../../src/lib/visitRecord.ts'
import type { RecordVisitInput } from '../../src/lib/visitRecord.ts'
import { notesAfterRecording, rescheduleMarker, splitVisitNotes } from '../../src/lib/visitHistory.ts'

type Row = Record<string, unknown>
type Fail = { table: string; op: 'update' | 'delete' | 'insert' }

function fakeDb(visits: Row[], fail: Fail[] = []) {
  const tables: Record<string, Row[]> = { visits: visits.map(v => ({ ...v })), sales: [], follow_ups: [] }

  function builder(table: string) {
    let op: 'select' | 'update' | 'delete' | 'insert' = 'select'
    let payload: Row = {}
    const filters: [string, unknown][] = []
    const b = {
      update(v: Row) { op = 'update'; payload = v; return b },
      delete() { op = 'delete'; return b },
      insert(v: Row) { op = 'insert'; payload = v; return b },
      eq(col: string, val: unknown) { filters.push([col, val]); return b },
      select() { return b },
      then(resolve: (r: { data: Row[] | null; error: { message: string } | null }) => void) {
        if (fail.some(f => f.table === table && f.op === op)) {
          return resolve({ data: null, error: { message: `pretend ${op} failure` } })
        }
        const rows = tables[table]
        const match = (r: Row) => filters.every(([c, v]) => r[c] === v)
        if (op === 'insert') { rows.push({ ...payload }); return resolve({ data: [{ ...payload }], error: null }) }
        const hit = rows.filter(match)
        if (op === 'update') hit.forEach(r => Object.assign(r, payload))
        if (op === 'delete') tables[table] = rows.filter(r => !match(r))
        return resolve({ data: hit.map(r => ({ id: r.id })), error: null })
      },
    }
    return b
  }

  return { tables, from: (t: string) => builder(t) }
}

const ME = 'user-me'
const OTHER = 'user-other'

const planned = (over: Row = {}): Row => ({
  id: 'v1', user_id: ME, customer_id: 'c-archana', status: 'planned',
  planned_start: '2026-10-13T17:00:00+05:30', notes: null, sale_amount: 0, ...over,
})

const input = (over: Partial<RecordVisitInput> = {}): RecordVisitInput => ({
  userId: ME, visitId: 'v1', customerId: 'c-archana', status: 'visited',
  saleAmount: 5000, leadAmount: 2000, collectionAmount: 0,
  notes: 'Paid half', nextAction: 'Collect balance', followUpDate: '2026-10-20',
  followUpAction: 'Collect balance', followUpNotes: 'Paid half',
  now: '2026-10-13T11:40:00.000Z', saleDate: '2026-10-13', saleNote: 'Entered on a visit',
  ...over,
})

// ---------- Duplicate visit recording ----------

test('a planned visit is recorded once, with its sale and follow-up', async () => {
  const db = fakeDb([planned()])
  const r = await recordVisit(db, input())
  assert.deepEqual(r, { ok: true, problems: [] })
  assert.equal(db.tables.visits[0].status, 'visited')
  assert.equal(db.tables.sales.length, 1)
  assert.equal(db.tables.follow_ups.length, 1)
})

test('recording the same visit again is refused and changes nothing', async () => {
  const db = fakeDb([planned()])
  await recordVisit(db, input())
  const before = { ...db.tables.visits[0] }
  const again = await recordVisit(db, input({ status: 'cancelled', saleAmount: 0, notes: 'oops' }))
  assert.deepEqual(again, { ok: false, reason: 'not_planned' })
  assert.deepEqual(db.tables.visits[0], before, 'first result, amounts and note are untouched')
})

test('a visit already cancelled, unavailable or rescheduled is never re-recorded', async () => {
  for (const status of ['cancelled', 'unavailable', 'rescheduled', 'visited']) {
    const db = fakeDb([planned({ status })])
    const r = await recordVisit(db, input())
    assert.deepEqual(r, { ok: false, reason: 'not_planned' }, status)
    assert.equal(db.tables.visits[0].status, status, status)
    assert.equal(db.tables.sales.length, 0, status)
    assert.equal(db.tables.follow_ups.length, 0, status)
  }
})

test('the refusal message tells the salesperson nothing was added twice', () => {
  assert.match(ALREADY_RECORDED_MESSAGE, /already recorded/)
  assert.match(ALREADY_RECORDED_MESSAGE, /Nothing was saved/)
})

// ---------- Duplicate sales ----------

test('two phones saving the same visit add only ONE sale and ONE follow-up', async () => {
  const db = fakeDb([planned()])
  const [a, b] = await Promise.all([recordVisit(db, input()), recordVisit(db, input())])
  assert.equal([a, b].filter(r => r.ok).length, 1)
  assert.equal(db.tables.sales.length, 1)
  assert.equal(db.tables.follow_ups.length, 1)
})

test('no sale or follow-up is added when the visit update fails', async () => {
  const db = fakeDb([planned()], [{ table: 'visits', op: 'update' }])
  const r = await recordVisit(db, input())
  assert.equal(r.ok, false)
  assert.equal(db.tables.sales.length, 0)
  assert.equal(db.tables.follow_ups.length, 0)
})

test('a visit with no sale amount adds no sale', async () => {
  const db = fakeDb([planned()])
  await recordVisit(db, input({ saleAmount: 0, followUpDate: null }))
  assert.equal(db.tables.sales.length, 0)
  assert.equal(db.tables.follow_ups.length, 0)
})

test('a failed sale is reported, the visit stays recorded, and saving again cannot add it twice', async () => {
  const db = fakeDb([planned()], [{ table: 'sales', op: 'insert' }])
  const r = await recordVisit(db, input())
  assert.equal(r.ok, true)
  assert.ok(r.ok && r.problems.length === 1 && /the sale/.test(r.problems[0]))
  const again = await recordVisit(db, input())
  assert.deepEqual(again, { ok: false, reason: 'not_planned' })
})

// ---------- Other users and other visits ----------

test('another user\'s visit is never recorded, even with the same visit ID', async () => {
  const db = fakeDb([planned({ user_id: OTHER })])
  const r = await recordVisit(db, input())
  assert.deepEqual(r, { ok: false, reason: 'not_planned' })
  assert.equal(db.tables.visits[0].status, 'planned')
  assert.equal(db.tables.sales.length, 0)
})

test('recording one visit leaves every other visit unchanged', async () => {
  const others = [planned({ id: 'v2', customer_id: 'c-debasis' }), planned({ id: 'v3', user_id: OTHER })]
  const db = fakeDb([planned(), ...others])
  await recordVisit(db, input())
  assert.deepEqual(db.tables.visits.slice(1), others)
})

// ---------- Removing a stop ----------

test('a planned stop can be removed', async () => {
  const db = fakeDb([planned()])
  assert.deepEqual(await removePlannedStop(db, ME, 'v1'), { ok: true })
  assert.equal(db.tables.visits.length, 0)
})

test('a stop recorded meanwhile (e.g. on another phone) is NOT removed', async () => {
  for (const status of ['visited', 'cancelled', 'unavailable', 'rescheduled']) {
    const db = fakeDb([planned({ status })])
    assert.deepEqual(await removePlannedStop(db, ME, 'v1'), { ok: false, reason: 'not_planned' }, status)
    assert.equal(db.tables.visits.length, 1, status)
  }
})

test('removing twice reports "not removed" the second time', async () => {
  const db = fakeDb([planned()])
  await removePlannedStop(db, ME, 'v1')
  assert.deepEqual(await removePlannedStop(db, ME, 'v1'), { ok: false, reason: 'not_planned' })
})

test('another user\'s stop is never removed', async () => {
  const db = fakeDb([planned({ user_id: OTHER })])
  assert.deepEqual(await removePlannedStop(db, ME, 'v1'), { ok: false, reason: 'not_planned' })
  assert.equal(db.tables.visits.length, 1)
})

test('a database error on remove is reported and nothing is deleted', async () => {
  const db = fakeDb([planned()], [{ table: 'visits', op: 'delete' }])
  const r = await removePlannedStop(db, ME, 'v1')
  assert.equal(r.ok, false)
  assert.ok(!r.ok && r.reason === 'error')
  assert.equal(db.tables.visits.length, 1)
  assert.match(REMOVE_NOT_PLANNED_MESSAGE, /not removed/)
})

// ---------- Rescheduling history survives recording (Fix 2, end to end) ----------

test('recording a replacement visit keeps its "Rescheduled from" history', async () => {
  const marker = rescheduleMarker('2026-10-11', 'Cancelled')
  const db = fakeDb([planned({ notes: marker })])
  await recordVisit(db, input({ notes: notesAfterRecording(marker, 'Paid half') }))
  const saved = splitVisitNotes(db.tables.visits[0].notes as string)
  assert.deepEqual(saved.history, { fromDate: '2026-10-11', outcome: 'Cancelled' })
  assert.equal(saved.note, 'Paid half')
})

test('recording a replacement visit with no typed note keeps the history line alone', async () => {
  const marker = rescheduleMarker('2026-10-10', 'Unavailable')
  const db = fakeDb([planned({ notes: marker })])
  await recordVisit(db, input({ notes: notesAfterRecording(marker, '   ') }))
  assert.equal(db.tables.visits[0].notes, marker)
})
