// Source-level guards for two confirmed wiring bugs. These read the files as text because
// screen tests need React test tooling that the project does not have yet. Replace them with
// real screen tests when that tooling is added.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')

test('C1: Shell passes the profile to COACH (otherwise target and home time are always missing)', () => {
  assert.match(read('src/pages/Shell.tsx'), /<CoachPage[^>]*\bprofile=\{profile\}/)
})

test('C2: My Week loads sale status and uses the shared rule that excludes cancelled sales', () => {
  const src = read('src/features/myweek/MyWeekPage.tsx')
  assert.match(src, /\.select\('id,amount,status'\)/)
  assert.match(src, /activeSalesTotal\(sales\)/)
})

test('COACH and TODAY use the shared target maths and sales rule', () => {
  for (const file of ['src/features/coach/CoachPage.tsx', 'src/features/today/TodayPage.tsx']) {
    const src = read(file)
    assert.match(src, /computeTarget\(/, file)
    assert.match(src, /activeSalesTotal\(/, file)
  }
})

test('COACH no longer treats energy 3 (Fresh) as low or shows energy out of 10', () => {
  const src = read('src/features/coach/CoachPage.tsx')
  assert.doesNotMatch(src, /energy\s*<=\s*3/)
  // an energy value printed directly as "x/10", e.g. ${s.energy}/10 or {health.energy ?? '—'}/10
  assert.doesNotMatch(src, /energy[^`\n}]{0,15}\}\/10/)
})
