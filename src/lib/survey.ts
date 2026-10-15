// Public pre-launch survey: options and the one rule that turns the form into a saved row.
// The database (migration 005) checks the same limits again.

export const ROLES = [
  { v: 'mr', label: 'Medical Representative (MR)' },
  { v: 'abm', label: 'Area / Business Manager (ABM)' },
  { v: 'manager', label: 'Regional / senior manager' },
  { v: 'other', label: 'Other' },
] as const

export const CHALLENGES = [
  { v: 'planning', label: 'Planning which doctors to visit' },
  { v: 'target', label: 'Hitting the monthly target' },
  { v: 'followups', label: 'Forgetting follow-ups' },
  { v: 'late_home', label: 'Reaching home late, no family time' },
  { v: 'stress', label: 'Stress and tiredness' },
  { v: 'reporting', label: 'Too much reporting work' },
  { v: 'other', label: 'Something else' },
] as const

export const METHODS = [
  { v: 'head', label: 'In my head' },
  { v: 'diary', label: 'Diary / notebook' },
  { v: 'company_app', label: 'Company app' },
  { v: 'excel', label: 'Excel / phone notes' },
  { v: 'other', label: 'Other' },
] as const

export const WOULD_TRY = [
  { v: 'yes', label: 'Yes' },
  { v: 'maybe', label: 'Maybe' },
  { v: 'no', label: 'No' },
] as const

export const TEXT_MAX = 1000

export type SurveyForm = {
  role: string
  challenges: string[]
  planning_method: string
  hardest_part: string
  one_fix: string
  would_try: string
  opinion: string
  name: string
  whatsapp: string
  city: string
}

export type SurveyRow = {
  role: string
  challenges: string[]
  planning_method: string | null
  hardest_part: string | null
  one_fix: string | null
  would_try: string
  opinion: string | null
  name: string | null
  whatsapp: string | null
  city: string | null
  source: string | null
}

const has = (list: readonly { v: string }[], v: string) => list.some(o => o.v === v)
const clean = (s: string, max: number) => {
  const t = s.trim().replace(/\s+/g, ' ')
  return t ? t.slice(0, max) : null
}

// Indian mobile: keeps the last 10 digits after removing +91 / 0 / spaces.
export function normalisePhone(raw: string): string | null {
  const d = raw.replace(/\D/g, '')
  const ten = d.length === 12 && d.startsWith('91') ? d.slice(2)
    : d.length === 11 && d.startsWith('0') ? d.slice(1)
    : d
  return /^[6-9][0-9]{9}$/.test(ten) ? ten : null
}

export function cleanSource(raw: string | null): string | null {
  if (!raw) return null
  const s = raw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40)
  return s || null
}

export function buildSurveyRow(f: SurveyForm, source: string | null):
  { ok: true; row: SurveyRow } | { ok: false; error: string } {
  if (!has(ROLES, f.role)) return { ok: false, error: 'Please choose your role (question 1).' }
  if (!has(WOULD_TRY, f.would_try)) return { ok: false, error: 'Please answer question 6: would you try Swayam?' }
  const challenges = [...new Set(f.challenges)].filter(c => has(CHALLENGES, c))
  let whatsapp: string | null = null
  if (f.whatsapp.trim()) {
    whatsapp = normalisePhone(f.whatsapp)
    if (!whatsapp) return { ok: false, error: 'WhatsApp number should be a 10-digit Indian mobile number.' }
  }
  return {
    ok: true,
    row: {
      role: f.role,
      challenges,
      planning_method: has(METHODS, f.planning_method) ? f.planning_method : null,
      hardest_part: clean(f.hardest_part, TEXT_MAX),
      one_fix: clean(f.one_fix, TEXT_MAX),
      would_try: f.would_try,
      opinion: clean(f.opinion, TEXT_MAX),
      name: clean(f.name, 80),
      whatsapp,
      city: clean(f.city, 80),
      source: cleanSource(source),
    },
  }
}
