// C21 (Fix 2): rescheduling history is kept and shown in plain words.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  rescheduleMarker, splitVisitNotes, notesAfterRecording, shortDay,
  rescheduleHistoryText, visitNoteLines,
} from '../../src/lib/visitHistory.ts'

test('the saved history line is word-for-word the same as before C21 (existing visits still match)', () => {
  assert.equal(rescheduleMarker('2026-10-11', 'Cancelled'), 'Rescheduled from 2026-10-11 (Cancelled)')
  assert.equal(rescheduleMarker('2026-10-10', 'Unavailable'), 'Rescheduled from 2026-10-10 (Unavailable)')
})

test('history is read from existing visits exactly as they are stored today', () => {
  assert.deepEqual(splitVisitNotes('Rescheduled from 2026-10-11 (Cancelled)'), {
    history: { fromDate: '2026-10-11', outcome: 'Cancelled' },
    historyLine: 'Rescheduled from 2026-10-11 (Cancelled)',
    note: null,
  })
})

test('history line plus a salesperson note are split apart', () => {
  const s = splitVisitNotes('Rescheduled from 2026-10-10 (Unavailable)\nShop closed till 4 pm')
  assert.deepEqual(s.history, { fromDate: '2026-10-10', outcome: 'Unavailable' })
  assert.equal(s.note, 'Shop closed till 4 pm')
})

test('ordinary notes are never mistaken for history', () => {
  for (const n of ['Paid cash', 'Customer said: Rescheduled from 2026-10-11 (Cancelled)', 'Rescheduled from tomorrow']) {
    assert.deepEqual(splitVisitNotes(n), { history: null, historyLine: null, note: n })
  }
  assert.deepEqual(splitVisitNotes(null), { history: null, historyLine: null, note: null })
  assert.deepEqual(splitVisitNotes('   '), { history: null, historyLine: null, note: null })
})

test('recording keeps the history line first and the typed note after it', () => {
  const marker = 'Rescheduled from 2026-10-11 (Cancelled)'
  assert.equal(notesAfterRecording(marker, 'Ordered 20 boxes'), `${marker}\nOrdered 20 boxes`)
  assert.equal(notesAfterRecording(marker, ''), marker)
  assert.equal(notesAfterRecording(marker, null), marker)
})

test('recording a visit that had no history behaves exactly as before', () => {
  assert.equal(notesAfterRecording(null, '  Paid cash  '), 'Paid cash')
  assert.equal(notesAfterRecording(null, ''), null)
  assert.equal(notesAfterRecording('old typed note', 'new note'), 'new note')
})

test('recording the same history twice never repeats the history line', () => {
  const marker = 'Rescheduled from 2026-10-11 (Cancelled)'
  const once = notesAfterRecording(marker, 'first')
  assert.equal(notesAfterRecording(once, 'second'), `${marker}\nsecond`)
})

test('dates are shown as short days without any time-zone shift', () => {
  assert.equal(shortDay('2026-10-11'), 'Sun 11 Oct')
  assert.equal(shortDay('2026-10-10'), 'Sat 10 Oct')
  assert.equal(shortDay('2026-12-31'), 'Thu 31 Dec')
})

test('history is shown in plain words, naming what happened to the OLD visit', () => {
  assert.equal(rescheduleHistoryText({ fromDate: '2026-10-11', outcome: 'Cancelled' }),
    'Moved here from Sun 11 Oct. That visit was cancelled.')
  assert.equal(rescheduleHistoryText({ fromDate: '2026-10-10', outcome: 'Unavailable' }),
    'Moved here from Sat 10 Oct. The customer was unavailable that day.')
  assert.equal(rescheduleHistoryText({ fromDate: '2026-10-10', outcome: 'Rescheduled' }),
    'Moved here from Sat 10 Oct. That visit was marked as rescheduled.')
})

test('the lines shown under a visit: history first, then the note', () => {
  assert.deepEqual(visitNoteLines('Rescheduled from 2026-10-11 (Cancelled)\nPaid half'),
    ['Moved here from Sun 11 Oct. That visit was cancelled.', 'Paid half'])
  assert.deepEqual(visitNoteLines('Paid half'), ['Paid half'])
  assert.deepEqual(visitNoteLines(null), [])
})
