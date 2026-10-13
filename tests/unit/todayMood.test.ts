// R1: TODAY shows the "date" message only for real dates, never for words that merely contain "date".
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isRomanticDate } from '../../src/lib/todayMood.ts'

test('words that only contain the letters "date" are not a date', () => {
  for (const t of ['Update stock list personal', 'Due date for invoice work', 'Candidate interview', 'Validate expenses', 'Date of birth form', '']) {
    assert.equal(isRomanticDate(t), false, t)
  }
  assert.equal(isRomanticDate(null), false)
})

test('real dates still show the date message', () => {
  for (const t of ['Date night personal', 'Dinner date with Priya', 'Going on a date', 'Movie date family', 'Dating app meetup', 'date with wife']) {
    assert.equal(isRomanticDate(t), true, t)
  }
})
