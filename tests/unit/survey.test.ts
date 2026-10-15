// Public survey (/survey). Run with: npm test
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildSurveyRow, normalisePhone, cleanSource, type SurveyForm } from '../../src/lib/survey.ts'

const base: SurveyForm = {
  role: 'mr', challenges: ['target', 'planning'], planning_method: 'diary', hardest_part: '  too   many doctors ',
  one_fix: '', would_try: 'yes', opinion: 'good', name: ' Ravi ', whatsapp: '+91 98765 43210', city: 'Cuttack',
}

test('a normal answer becomes a clean row', () => {
  const r = buildSurveyRow(base, 'wa_mr')
  assert.ok(r.ok)
  if (!r.ok) return
  assert.deepEqual(r.row, {
    role: 'mr', challenges: ['target', 'planning'], planning_method: 'diary', hardest_part: 'too many doctors',
    one_fix: null, would_try: 'yes', opinion: 'good', name: 'Ravi', whatsapp: '9876543210', city: 'Cuttack', source: 'wa_mr',
  })
})

test('role and question 6 are required', () => {
  assert.equal(buildSurveyRow({ ...base, role: '' }, null).ok, false)
  assert.equal(buildSurveyRow({ ...base, role: 'boss' }, null).ok, false)
  assert.equal(buildSurveyRow({ ...base, would_try: '' }, null).ok, false)
})

test('contact details are optional', () => {
  const r = buildSurveyRow({ ...base, name: '', whatsapp: '', city: '' }, null)
  assert.ok(r.ok)
  if (r.ok) { assert.equal(r.row.name, null); assert.equal(r.row.whatsapp, null) }
})

test('bad phone is refused, not silently dropped', () => {
  assert.equal(buildSurveyRow({ ...base, whatsapp: '12345' }, null).ok, false)
})

test('phone: +91, 0-prefix and spaces become 10 digits', () => {
  assert.equal(normalisePhone('+91 98765-43210'), '9876543210')
  assert.equal(normalisePhone('09876543210'), '9876543210')
  assert.equal(normalisePhone('9876543210'), '9876543210')
  assert.equal(normalisePhone('1234567890'), null)
})

test('unknown challenges and duplicates are removed; long text is cut', () => {
  const r = buildSurveyRow({ ...base, challenges: ['target', 'target', 'hack'], opinion: 'x'.repeat(5000) }, null)
  assert.ok(r.ok)
  if (r.ok) { assert.deepEqual(r.row.challenges, ['target']); assert.equal(r.row.opinion!.length, 1000) }
})

test('source tag keeps only safe characters', () => {
  assert.equal(cleanSource('wa-group_1<script>'), 'wa-group_1script')
  assert.equal(cleanSource(''), null)
  assert.equal(cleanSource(null), null)
})

test('survey page saves without reading back, and opens before login', () => {
  const page = readFileSync(new URL('../../src/features/survey/SurveyPage.tsx', import.meta.url), 'utf8')
  assert.match(page, /from\('survey_responses'\)\.insert\(built\.row\)/)
  assert.doesNotMatch(page, /\.insert\([^)]*\)\s*\.select\(/)
  const main = readFileSync(new URL('../../src/main.tsx', import.meta.url), 'utf8')
  assert.match(main, /isSurvey \? <SurveyPage \/> : <App \/>/)
})
