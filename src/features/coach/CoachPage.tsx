import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Profile } from '../../types'
import { inr, monthStart, todayIST } from '../../lib/format'

type CoachPageProps = {
  userId: string
  profile?: Profile
}

type HealthCheck = {
  energy: number | null
  stress: number | null
  sleep_hours: number | null
  pressure_tags: string[] | null
  day_weight: string | null
  home_time_status: string | null
  notes: string | null
}

type Visit = {
  id: string
  customer_id: string
  planned_start: string | null
  status: string
  sale_amount: number
  next_action: string | null
}

type FollowUp = {
  id: string
  customer_id: string
  due_date: string
  action: string
  expected_value: number
  status: string
}

type Sale = {
  id: string
  customer_id: string | null
  sale_date: string
  amount: number
  status: string
}

type Customer = {
  id: string
  name: string
  priority: number
  potential_amount: number
  address: string | null
  phone: string | null
}

type PersonalEvent = {
  id: string
  title: string
  category: string
  starts_at: string
  ends_at: string | null
  all_day: boolean
  priority: string
  location: string | null
  status: string
}

type CoachIntent =
  | 'schedule'
  | 'workload'
  | 'customers'
  | 'followups'
  | 'target'
  | 'route'
  | 'health'
  | 'improve'
  | 'tomorrow'
  | 'performance'
  | 'improve_performance'
  | 'today'
  | 'visit_status'
  | 'unknown'

/* ------------------------------------------------------------------ */
/* Pure helpers (no component state)                                   */
/* ------------------------------------------------------------------ */

const IST = 'Asia/Kolkata'

// Planning assumption used ONLY when the user gives hours available.
// FieldOS does not store visit durations or live travel times.
const ASSUMED_MINUTES_PER_VISIT = 60

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

function monthEnd(date: string): string {
  const [y, m] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
}

// Counts Monday–Saturday days from `from` to `to`, both inclusive.
function sellingDays(from: string, to: string): number {
  let count = 0
  let cursor = from
  let guard = 0
  while (cursor <= to && guard < 40) {
    const dow = new Date(cursor + 'T00:00:00Z').getUTCDay()
    if (dow !== 0) count += 1
    cursor = addDays(cursor, 1)
    guard += 1
  }
  return count
}

function istDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('en-CA', { timeZone: IST }).format(d)
}

function istMinutes(d: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: IST,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const h = Number(parts.find(p => p.type === 'hour')?.value ?? 0) % 24
  const m = Number(parts.find(p => p.type === 'minute')?.value ?? 0)
  return h * 60 + m
}

function fmtClock(mins: number): string {
  const h24 = Math.floor(mins / 60) % 24
  const m = mins % 60
  const ampm = h24 >= 12 ? 'PM' : 'AM'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

function fmtDuration(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = Math.round(mins % 60)
  if (h === 0) return `${m} min`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function parseClock(t: string | null | undefined): number | null {
  if (!t) return null
  const m = t.match(/^(\d{1,2}):(\d{2})/)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

function isPlannedVisit(visit: Visit) {
  return visit.status === 'planned' || visit.status === 'rescheduled'
}

function listNames(names: string[]): string {
  if (names.length <= 1) return names.join('')
  return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1]
}

/* ---- Spelling tolerance: fixes small typos against a short vocabulary ---- */

const VOCAB = [
  'tomorrow', 'customer', 'customers', 'follow', 'followup', 'followups',
  'target', 'schedule', 'overdue', 'productive', 'useful', 'travel',
  'energy', 'stress', 'workload', 'performance', 'appointment', 'remaining',
  'priority', 'visits', 'achieve', 'efficient', 'tired',
]

function editDistance(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i])
  for (let j = 1; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
    }
  }
  return dp[a.length][b.length]
}

function normaliseQuestion(raw: string): string {
  const base = raw
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/[^a-z0-9'\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return base
    .split(' ')
    .filter(Boolean)
    .map(tok => {
      if (tok.length < 5 || VOCAB.includes(tok)) return tok
      const limit = tok.length >= 8 ? 2 : 1
      let best = tok
      let bestDist = limit + 1
      for (const word of VOCAB) {
        if (Math.abs(word.length - tok.length) > limit) continue
        const d = editDistance(tok, word)
        if (d < bestDist) {
          bestDist = d
          best = word
        }
      }
      return bestDist <= limit ? best : tok
    })
    .join(' ')
}

function wantsTomorrow(q: string): boolean {
  return /\b(tomorrow|tmrw|tmr|next day|next-day)\b/.test(q)
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
}

function parseHours(q: string): number | null {
  const m = q.match(/\b(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight)\s*(?:hours?|hrs?|hr)\b/)
  if (!m) return null
  const raw = m[1]
  const n = NUMBER_WORDS[raw] ?? Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

function areaKey(address: string | null): string {
  if (!address) return ''
  const pin = address.match(/\b\d{6}\b/)
  if (pin) return pin[0]
  const parts = address.split(',').map(p => p.trim().toLowerCase()).filter(Boolean)
  return parts.length >= 2 ? parts[parts.length - 2] : (parts[0] ?? '')
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function CoachPage({ userId, profile }: CoachPageProps) {
  const [loading, setLoading] = useState(true)
  const [asking, setAsking] = useState(false)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [error, setError] = useState('')

  const [health, setHealth] = useState<HealthCheck | null>(null)
  const [visits, setVisits] = useState<Visit[]>([])
  const [followUps, setFollowUps] = useState<FollowUp[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [personalEvents, setPersonalEvents] = useState<PersonalEvent[]>([])

  /* ---------------- data loading ---------------- */

  async function loadCoachData() {
    setLoading(true)
    setError('')

    const today = todayIST()
    const tomorrow = addDays(today, 1)
    const dayAfterTomorrow = addDays(today, 2)

    const [
      healthResult,
      visitsResult,
      followUpsResult,
      salesResult,
      customersResult,
      eventsResult,
    ] = await Promise.all([
      supabase
        .from('health_checkins')
        .select('energy, stress, sleep_hours, pressure_tags, day_weight, home_time_status, notes')
        .eq('user_id', userId)
        .eq('checkin_date', today)
        .maybeSingle(),

      supabase
        .from('visits')
        .select('id, customer_id, planned_start, status, sale_amount, next_action')
        .eq('user_id', userId)
        .gte('planned_start', `${today}T00:00:00+05:30`)
        .lt('planned_start', `${dayAfterTomorrow}T00:00:00+05:30`)
        .order('planned_start', { ascending: true }),

      // All open follow-ups (overdue, today, tomorrow and later)
      supabase
        .from('follow_ups')
        .select('id, customer_id, due_date, action, expected_value, status')
        .eq('user_id', userId)
        .neq('status', 'done')
        .neq('status', 'dropped')
        .order('due_date', { ascending: true })
        .limit(200),

      // Whole month so far, needed for real target maths
      supabase
        .from('sales')
        .select('id, customer_id, sale_date, amount, status')
        .eq('user_id', userId)
        .gte('sale_date', monthStart(today))
        .lte('sale_date', today)
        .order('sale_date', { ascending: false }),

      supabase
        .from('customers')
        .select('id, name, priority, potential_amount, address, phone')
        .eq('user_id', userId)
        .eq('active', true)
        .order('priority', { ascending: true })
        .limit(100),

      supabase
        .from('personal_events')
        .select('id, title, category, starts_at, ends_at, all_day, priority, location, status')
        .eq('user_id', userId)
        .gte('starts_at', `${today}T00:00:00+05:30`)
        .lt('starts_at', `${dayAfterTomorrow}T00:00:00+05:30`)
        .order('starts_at', { ascending: true }),
    ])

    const firstError =
      healthResult.error ||
      visitsResult.error ||
      followUpsResult.error ||
      salesResult.error ||
      customersResult.error

    if (firstError) {
      setError(firstError.message)
      setLoading(false)
      return
    }

    setHealth(healthResult.data)
    setVisits((visitsResult.data || []) as Visit[])
    setFollowUps((followUpsResult.data || []) as FollowUp[])
    setSales((salesResult.data || []) as Sale[])
    setCustomers((customersResult.data || []) as Customer[])
    setPersonalEvents((eventsResult.data || []) as PersonalEvent[])
    if (eventsResult.error) {
      setError(`Personal events could not be loaded: ${eventsResult.error.message}`)
    }

    setLoading(false)
  }

  useEffect(() => {
    loadCoachData()
  }, [userId])

  /* ---------------- small lookups ---------------- */

  function customerById(id: string | null) {
    if (!id) return undefined
    return customers.find(c => c.id === id)
  }

  function customerName(id: string | null) {
    return customerById(id)?.name || 'Customer'
  }

  function priorityOf(id: string) {
    return customerById(id)?.priority ?? 999
  }

  function visitClock(v: Visit): string {
    if (!v.planned_start) return 'time not set'
    const d = new Date(v.planned_start)
    if (Number.isNaN(d.getTime())) return 'time not set'
    return fmtClock(istMinutes(d))
  }

  function visitMinutes(v: Visit): number {
    if (!v.planned_start) return -1
    const d = new Date(v.planned_start)
    return Number.isNaN(d.getTime()) ? -1 : istMinutes(d)
  }

  function eventClock(iso: string | null): string {
    if (!iso) return ''
    const d = new Date(iso)
    return Number.isNaN(d.getTime()) ? '' : fmtClock(istMinutes(d))
  }

  function valueText(n: number) {
    return n > 0 ? ` — expected ${inr(Number(n))}` : ''
  }

  /* ---------------- one consistent view of the user's data ---------------- */

  function snapshot() {
    const today = todayIST()
    const tomorrow = addDays(today, 1)
    const nowMins = istMinutes(new Date())

    const time = (v: Visit) => (v.planned_start ? new Date(v.planned_start).getTime() : 0)
    const visitsOn = (day: string) =>
      visits.filter(v => istDate(v.planned_start) === day).sort((a, b) => time(a) - time(b))

    const todayAll = visitsOn(today)
    const tomorrowAll = visitsOn(tomorrow)
    const todayPlanned = todayAll.filter(isPlannedVisit)
    const tomorrowPlanned = tomorrowAll.filter(isPlannedVisit)
    const todayDone = todayAll.filter(v => v.status === 'visited')
    // A visit that started up to 15 minutes ago still counts as "ahead"
    const todayUpcoming = todayPlanned.filter(v => visitMinutes(v) >= nowMins - 15)
    const todayPassed = todayPlanned.filter(v => visitMinutes(v) < nowMins - 15)

    const open = followUps.filter(f => f.status !== 'done' && f.status !== 'dropped')
    const byUrgency = (a: FollowUp, b: FollowUp) =>
      Number(b.expected_value || 0) - Number(a.expected_value || 0) ||
      a.due_date.localeCompare(b.due_date)
    const overdue = open.filter(f => f.due_date < today).sort(byUrgency)
    const dueToday = open.filter(f => f.due_date === today).sort(byUrgency)
    const dueTomorrow = open.filter(f => f.due_date === tomorrow).sort(byUrgency)
    const dueLater = open.filter(f => f.due_date > tomorrow).sort(byUrgency)

    const eventsOn = (day: string) =>
      personalEvents
        .filter(e => e.status !== 'cancelled' && istDate(e.starts_at) === day)
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at))

    const validSales = sales.filter(s => s.status !== 'cancelled')
    const mtd = validSales.reduce((sum, s) => sum + Number(s.amount || 0), 0)
    const todaySales = validSales
      .filter(s => s.sale_date === today)
      .reduce((sum, s) => sum + Number(s.amount || 0), 0)

    const target = Number(profile?.monthly_target || 0)
    const remaining = Math.max(target - mtd, 0)
    const daysLeft = sellingDays(today, monthEnd(today))
    const daysElapsed = sellingDays(monthStart(today), today)
    const required = remaining / Math.max(daysLeft, 1)
    const avg = mtd / Math.max(daysElapsed, 1)

    const homeMins = parseClock(profile?.preferred_home_time)
    const minsToHome = homeMins !== null && homeMins > nowMins ? homeMins - nowMins : null

    const energy = health?.energy ?? null
    const stress = health?.stress ?? null
    const heavyDay =
      health?.day_weight === 'heavy' ||
      health?.home_time_status === 'late' ||
      (energy !== null && energy <= 3)

    return {
      today, tomorrow, nowMins,
      todayAll, tomorrowAll, todayPlanned, tomorrowPlanned, todayDone, todayUpcoming, todayPassed,
      overdue, dueToday, dueTomorrow, dueLater, open,
      eventsOn,
      mtd, todaySales, target, remaining, daysLeft, daysElapsed, required, avg,
      homeMins, minsToHome,
      energy, stress, heavyDay,
    }
  }

  function energyNote(s: ReturnType<typeof snapshot>): string {
    if (s.energy !== null && s.energy <= 3) {
      return `\nENERGY CHECK\nYour check-in shows energy ${s.energy}/10. Keep to the top two actions and turn the rest into calls.\n`
    }
    if (s.stress !== null && s.stress >= 8) {
      return `\nSTRESS CHECK\nYour check-in shows stress ${s.stress}/10. Do the most valuable action first and avoid adding new work.\n`
    }
    if (s.heavyDay) {
      return '\nDAY WEIGHT\nYour check-in marks today as heavy or running late. Do not add extra visits.\n'
    }
    return ''
  }

  function findNamedCustomer(q: string): Customer | null {
    const full = customers.filter(c => {
      const n = c.name.toLowerCase().trim()
      return n.length >= 3 && q.includes(n)
    })
    if (full.length === 1) return full[0]
    if (full.length > 1) return null

    const partial = customers.filter(c =>
      c.name
        .toLowerCase()
        .split(/\s+/)
        .some(w => w.length >= 4 && new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(q))
    )
    return partial.length === 1 ? partial[0] : null
  }

  /* ---------------- intent detection ---------------- */
  // Rules run from MOST SPECIFIC to MOST BROAD. The first rule that matches wins.
  // Tomorrow is detected separately (wantsTomorrow) so "who should I visit tomorrow"
  // is a customer question about tomorrow, not a generic tomorrow question.

  function getIntent(userQuestion: string): CoachIntent {
    const q = normaliseQuestion(userQuestion)
    if (!q) return 'unknown'

    // 1. Schedule — home time, finishing on time, personal events, cancellations, delays.
    //    Checked before "customer" so "can I get home on time after the Sharma visit" is a schedule question.
    if (
      /\bhome\b|\bghar\b/.test(q) ||
      /\bon time\b/.test(q) ||
      /\b(finish|done|wrap up|leave|free)\b.*\b(by|before|at)\b\s*\d/.test(q) ||
      /\bfinish\b.*\bby\b/.test(q) ||
      /\b(personal|family) (event|commitment|time|function|plan)s?\b/.test(q) ||
      /\bappointments?\b|\bcommitments?\b/.test(q) ||
      /\b(cancel(led|ed)?|postpone[d]?|running late|late for|delayed?|no show|did not turn up)\b/.test(q) ||
      /\bwhat time\b/.test(q)
    ) {
      return 'schedule'
    }

    // 1b. Improve performance — "how can I improve my performance / do better / sell more".
    //     Must run BEFORE the review rule (4), which matches any question containing "performance".
    if (
      (/\b(improv\w*|boost|increase|raise|enhance|better)\b/.test(q) &&
        /\b(performance|results?|sales|numbers)\b/.test(q)) ||
      /\b(perform|do|sell|work) better\b/.test(q) ||
      /\b(sell|earn|make) more\b/.test(q)
    ) {
      return 'improve_performance'
    }

    // 1c. Today's visit STATUS: "which visits are pending / completed / unavailable / rescheduled".
    //     Needs a visit word AND a visit-state word, and must not mention another topic
    //     (target, sales, follow-ups, performance review, improving, tomorrow, travel/route,
    //     hours available, energy/workload).
    //     It sits before the target and follow-up rules so that words like "pending" and
    //     "remaining" in a VISIT question are not mistaken for follow-ups or the monthly target.
    if (
      (/\bvisits?\b|\bvisited\b|\bstops?\b/.test(q) ||
        /\b(customers?|clients?)\b.{0,20}\b(pending|left|remaining|outstanding|yet)\b/.test(q)) &&
      /\b(pending|left|remaining|outstanding|yet to|not yet|not visited|unvisited|completed|finished|unavailable|not available|rescheduled)\b/.test(q) &&
      !/\b(target|quota|sales?|follow ?-?ups?|followups?|how (did|was|has|have)|improv\w*|perform\w*|results?|tomorrow|tmrw|tmr|next day|next-day|travel\w*|routes?|driv\w*|distance|petrol|fuel|nearby|nearest|closest|sequence|hours?|hrs?|tired|energy|stress\w*|busy|heavy|too many|too much|overload\w*)\b/.test(q)
    ) {
      return 'visit_status'
    }

    // 2. Sales / target
    if (
      /\b(target|quota|behind|achieve\w*|remaining|shortfall|on track|pace)\b/.test(q) ||
      /\bmonth(ly)?\b/.test(q) ||
      /\bsales? (performance|progress|so far|this month|figures?)\b/.test(q) ||
      /\bprogress\b/.test(q) ||
      /\bhow much (more )?(do i|should i|must i|to) (need|sell|make|earn)\b/.test(q)
    ) {
      return 'target'
    }

    // 3. Health / wellbeing
    if (
      /\b(energy|tired|exhaust\w*|fatigue\w*|stress\w*|sleep\w*|burn ?out|well-?being|health\w*|overwhelm\w*)\b/.test(q) ||
      /\bbalance\b.*\b(work|life|family)\b|\bwork.?life\b/.test(q)
    ) {
      return 'health'
    }

    // 4. Performance — reviewing completed work and today's results
    if (
      /\bhow (did|was|has|have)\b/.test(q) ||
      /\btoday'?s (results?|performance|sales|work|numbers)\b/.test(q) ||
      /\bsales today\b/.test(q) ||
      /\bresults?\b|\bperformance\b|\bperformed\b|\bperform\b/.test(q) ||
      /\breview (my|the|today)\b/.test(q) ||
      /\bwhat did i (do|complete|achieve|finish|sell)\b/.test(q) ||
      /\bcompleted\b/.test(q)
    ) {
      return 'performance'
    }

    // 5. Route / travel
    if (
      /\b(travel\w*|route|routes|driving|drive|distance|commut\w*|backtrack\w*|petrol|fuel|nearby|near by|nearest|closest)\b/.test(q) ||
      /\bwast\w* (travel|km|distance|fuel)\b/.test(q) ||
      /\barrange\b.*\bvisits\b|\border of (the |my )?visits\b|\bsequence\b/.test(q)
    ) {
      return 'route'
    }

    // 6. Follow-ups
    if (/\bfollow ?-?ups?\b|\bfollowups?\b|\boverdue\b|\bpending\b|\bcall ?back\b/.test(q)) {
      return 'followups'
    }

    // 7. Workload / limited time
    if (
      /\btoo (much|many)\b|\boverload\w*|\bheavy\b|\bbusy\b|\bhectic\b|\bworkload\b|\bcapacity\b/.test(q) ||
      /\bhow many (visits|calls|customers)\b/.test(q) ||
      /\blimited (time|hours)\b|\bnot enough time\b|\bhalf day\b/.test(q) ||
      /\b(few|couple of|only|just) hours?\b|\bhours? (left|remaining|available|free)\b/.test(q) ||
      /\bhave\b.{0,14}\bhours?\b/.test(q) ||
      /\bcan'?t (fit|finish|manage|cope)\b/.test(q)
    ) {
      return 'workload'
    }

    // 8. Customers
    if (
      /\bcustomers?\b|\bclients?\b|\bwhom\b|\bpriority\b|\bpriorities\b|\bhigh value\b/.test(q) ||
      /\bwho (should|to|do|can)\b/.test(q) ||
      /\bvisit next\b|\bnext (visit|customer|call)\b/.test(q) ||
      /\bwhich (shop|party|dealer|account|one)\b/.test(q)
    ) {
      return 'customers'
    }

    // 9. Tomorrow (generic planning)
    if (wantsTomorrow(q)) return 'tomorrow'

    // 10. Improve — make the day more useful, productivity, better use of time, finishing well
    if (
      /\buseful\w*|\bproductiv\w*|\bbetter\b|\bimprov\w*|\bwast\w*|\befficien\w*/.test(q) ||
      /\bmake (the |my |this )?(day|time)\b|\bbest use\b|\buse (my |the )?time\b/.test(q) ||
      /\b(finish|end|close|wrap up|complete)\b.*\b(day|today)\b/.test(q) ||
      /\bwhat (should|can|do) i do (now|next|first|today)\b|\bwhat now\b|\bnext (step|action|move)\b/.test(q) ||
      /\bfocus\b|\bmost important\b|\bworth\b/.test(q)
    ) {
      return 'improve'
    }

    // 11. A specific customer was named
    if (findNamedCustomer(q)) return 'customers'

    // 12. Weak schedule words
    if (/\bschedule\b|\bplan\b|\bagenda\b|\bevents?\b|\bmeetings?\b/.test(q)) return 'schedule'

    return 'unknown'
  }

  /* ---------------- answer builders ---------------- */

  function buildOverviewAnswer(prefix?: string) {
    const s = snapshot()
    let r = prefix ? prefix + '\n\n' : ''
    r += 'TODAY AT A GLANCE\n\n'
    r += `Visits still ahead: ${s.todayUpcoming.length}\n`
    r += `Visits completed: ${s.todayDone.length}\n`
    r += `Follow-ups due or overdue: ${s.overdue.length + s.dueToday.length}\n`
    r += `Sales recorded today: ${inr(s.todaySales)}\n`
    if (s.target > 0) r += `Month so far: ${inr(s.mtd)} of ${inr(s.target)}\n`

    const urgent = [...s.overdue, ...s.dueToday][0]
    const next = s.todayUpcoming[0]
    if (next) {
      r += `\nNext: ${customerName(next.customer_id)} at ${visitClock(next)}.`
    } else if (urgent) {
      r += `\nNext: ${customerName(urgent.customer_id)} — ${urgent.action}.`
    } else {
      r += '\nNothing is scheduled or due. Ask me who to visit or what to do tomorrow.'
    }
    r += energyNote(s)
    if (prefix) {
      r += '\nTry asking: "Who should I visit next?", "Can I get home on time?", "How am I against target?" or "How can I reduce travel?"'
    }
    return r
  }

  function buildUnknownAnswer() {
    return (
      'COACH CANNOT ANSWER THAT YET\n\n' +
      'I could not match your question to something I can answer from your saved FieldOS data, so I will not guess.\n\n' +
      'I can help with:\n' +
      '• Today\'s plan, schedule and getting home on time\n' +
      '• Tomorrow\'s plan\n' +
      '• Who to visit next, and one named customer\n' +
      '• Follow-ups, and which one matters most\n' +
      '• Monthly sales, target and amount remaining\n' +
      '• Workload and how many visits fit\n' +
      '• Reducing travel (from saved addresses)\n' +
      '• Energy, stress and sleep\n' +
      '• Making your day more useful\n\n' +
      'Try rewording your question using one of these.'
    )
  }

  function buildImproveAnswer(q: string) {
    const s = snapshot()
    const finishing = /\b(finish|end|close|wrap|complete)\b/.test(q)
    let r = finishing ? 'FINISH YOUR DAY WELL\n\n' : 'MAKE YOUR DAY MORE USEFUL\n\n'

    const parts: string[] = [`It is ${fmtClock(s.nowMins)}`]
    parts.push(`${s.todayUpcoming.length} visit${s.todayUpcoming.length === 1 ? '' : 's'} still ahead`)
    parts.push(`${s.overdue.length + s.dueToday.length} follow-up${s.overdue.length + s.dueToday.length === 1 ? '' : 's'} due or overdue`)
    if (s.homeMins === null) {
      parts.push('no home time set in your profile')
    } else if (s.minsToHome !== null) {
      parts.push(`${fmtDuration(s.minsToHome)} until your home time (${fmtClock(s.homeMins)})`)
    } else {
      parts.push(`your home time (${fmtClock(s.homeMins)}) has already passed`)
    }
    r += parts.join(' · ') + '.\n\n'

    const urgent = [...s.overdue, ...s.dueToday].sort(
      (a, b) =>
        Number(b.expected_value || 0) - Number(a.expected_value || 0) ||
        a.due_date.localeCompare(b.due_date)
    )
    const nextVisit = s.todayUpcoming[0]
    const nextVisitIn = nextVisit ? visitMinutes(nextVisit) - s.nowMins : null

    r += 'BEST NEXT ACTION\n'
    if (nextVisit && nextVisitIn !== null && nextVisitIn <= 45) {
      r += `Get ready for ${customerName(nextVisit.customer_id)} at ${visitClock(nextVisit)}`
      r += nextVisitIn > 0 ? ` (starts in ${nextVisitIn} min).` : ' (starting now).'
      if (nextVisit.next_action) r += ` Focus: ${nextVisit.next_action}.`
      r += '\n'
    } else if (urgent[0]) {
      const f = urgent[0]
      r += `Call ${customerName(f.customer_id)} about "${f.action}" (due ${f.due_date}${valueText(f.expected_value)}). `
      r += 'A call needs no travel, so it fills the gap before your next visit.\n'
    } else if (nextVisit) {
      r += `Prepare for ${customerName(nextVisit.customer_id)} at ${visitClock(nextVisit)}.`
      if (nextVisit.next_action) r += ` Focus: ${nextVisit.next_action}.`
      r += '\n'
    } else {
      const visitedIds = new Set(s.todayDone.map(v => v.customer_id))
      const pick = customers
        .filter(c => !visitedIds.has(c.id))
        .sort((a, b) => a.priority - b.priority || Number(b.potential_amount || 0) - Number(a.potential_amount || 0))[0]
      if (pick) {
        r += `No visits or follow-ups are due. Contact ${pick.name} — your highest-priority customer${pick.potential_amount > 0 ? ` (potential ${inr(Number(pick.potential_amount))})` : ''} — and set a follow-up.\n`
      } else {
        r += 'I cannot see any visits, follow-ups or active customers. Add a customer or a follow-up first.\n'
      }
    }

    const thenItems: string[] = []
    urgent.slice(urgent[0] && !(nextVisit && nextVisitIn !== null && nextVisitIn <= 45) ? 1 : 0, 3).forEach(f => {
      thenItems.push(`Call ${customerName(f.customer_id)} — ${f.action} (due ${f.due_date})`)
    })
    s.todayUpcoming.slice(nextVisit && nextVisitIn !== null && nextVisitIn <= 45 ? 1 : 0, 3).forEach(v => {
      thenItems.push(`Visit ${customerName(v.customer_id)} at ${visitClock(v)}`)
    })
    if (thenItems.length > 0) {
      r += '\nTHEN\n'
      thenItems.slice(0, 3).forEach((item, i) => { r += `${i + 1}. ${item}\n` })
    }

    if (s.todayPassed.length > 0) {
      r += `\nLOOSE ENDS\n${listNames(s.todayPassed.map(v => customerName(v.customer_id)))} ${s.todayPassed.length === 1 ? 'was' : 'were'} planned earlier but no result is recorded. Record the outcome or reschedule so tomorrow starts clean.\n`
    }

    if (s.target > 0 && s.remaining > 0 && s.avg < s.required) {
      r += `\nTARGET\n${inr(s.remaining)} is left over ${s.daysLeft} selling day${s.daysLeft === 1 ? '' : 's'}: ${inr(s.required)} a day needed against ${inr(s.avg)} a day so far.\n`
    }

    r += energyNote(s)

    if (finishing) {
      r += '\nBEFORE YOU STOP\n'
      const first = s.tomorrowPlanned[0]
      r += first
        ? `Tomorrow starts with ${customerName(first.customer_id)} at ${visitClock(first)} — check what you need for it tonight.\n`
        : 'Nothing is planned for tomorrow yet. Save at least the first visit or one follow-up.\n'
      const lifeList = profile?.life_priorities ?? []
      if (lifeList.length > 0 && s.homeMins !== null) {
        r += `You listed ${listNames(lifeList.slice(0, 2))} among your priorities, so stop adding work as ${fmtClock(s.homeMins)} gets close.\n`
      }
    }

    return r
  }

  function buildScheduleAnswer(q: string) {
    const s = snapshot()
    const tomorrow = wantsTomorrow(q)
    const day = tomorrow ? s.tomorrow : s.today
    const list = tomorrow ? s.tomorrowPlanned : s.todayPlanned
    const events = s.eventsOn(day)
    const cancelOrLate = /\b(cancel(led|ed)?|postpone[d]?|running late|late for|delayed?|no show|did not turn up)\b/.test(q)

    let r = tomorrow ? 'TOMORROW — SCHEDULE AND HOME TIME\n\n' : 'TODAY — SCHEDULE AND HOME TIME\n\n'

    if (s.homeMins !== null) {
      r += `Preferred home time: ${fmtClock(s.homeMins)}.`
      if (!tomorrow && health?.home_time_status === 'late') r += ' Your check-in says you expect to be late.'
      r += '\n\n'
    } else {
      r += 'No preferred home time is saved in your profile, so I cannot check the day against it.\n\n'
    }

    if (list.length === 0) {
      r += `No planned visits found for ${tomorrow ? 'tomorrow' : 'today'}.\n`
    } else {
      r += `Planned visits (${list.length}):\n`
      list.forEach((v, i) => {
        const c = customerById(v.customer_id)
        const passed = !tomorrow && visitMinutes(v) < s.nowMins - 15
        r += `${i + 1}. ${visitClock(v)} — ${customerName(v.customer_id)}${c ? ` (priority ${c.priority})` : ''}${passed ? ' — time has passed, no result recorded' : ''}\n`
      })
    }

    const timedEvents = events.filter(e => !e.all_day)
    if (events.length > 0) {
      r += '\nPersonal events:\n'
      events.forEach(e => {
        r += e.all_day
          ? `• ${e.title} — all day\n`
          : `• ${e.title} — ${eventClock(e.starts_at)}${e.ends_at ? ` to ${eventClock(e.ends_at)}` : ''}${e.location ? ` · ${e.location}` : ''}\n`
      })
    }

    // Conflicts between a visit and a personal event with a known end time
    const conflicts: string[] = []
    list.forEach(v => {
      const vm = visitMinutes(v)
      timedEvents.forEach(e => {
        if (!e.ends_at) return
        const es = istMinutes(new Date(e.starts_at))
        const ee = istMinutes(new Date(e.ends_at))
        if (vm >= es && vm < ee) conflicts.push(`${customerName(v.customer_id)} at ${visitClock(v)} falls inside "${e.title}"`)
      })
    })
    if (conflicts.length > 0) {
      r += `\nCONFLICT\n${conflicts.join('\n')}\nMove or call about the visit.\n`
    }

    // Time check against the next fixed point: a later personal event, otherwise home time
    const upcoming = tomorrow ? list : s.todayUpcoming
    const lastVisit = upcoming[upcoming.length - 1]
    if (lastVisit) {
      const lastStart = visitMinutes(lastVisit)
      const laterEvent = timedEvents.find(e => istMinutes(new Date(e.starts_at)) > lastStart)
      const eventStart = laterEvent ? istMinutes(new Date(laterEvent.starts_at)) : null
      // Use whichever fixed point comes first: home time or the later personal event
      const useEvent = eventStart !== null && (s.homeMins === null || eventStart <= s.homeMins)
      const anchor: number | null = useEvent ? eventStart : s.homeMins
      const anchorLabel = useEvent && laterEvent
        ? `"${laterEvent.title}" (${fmtClock(eventStart as number)})`
        : s.homeMins !== null
          ? `your home time (${fmtClock(s.homeMins)})`
          : ''
      r += '\nTIME CHECK\n'
      if (anchor !== null && anchorLabel) {
        const buffer = anchor - lastStart
        r += `Your last visit (${customerName(lastVisit.customer_id)}) starts at ${visitClock(lastVisit)}, which leaves ${buffer > 0 ? fmtDuration(buffer) : 'no time'} before ${anchorLabel}. `
        r += 'That must cover the visit, travel and getting ready. FieldOS has no saved visit durations or live travel times, so I cannot confirm it fits.\n'
        if (buffer <= 0) {
          r += 'RESULT: the last visit starts after that time. Do not keep it unless you are willing to be late.\n'
        } else if (buffer < 90) {
          r += 'RESULT: tight (under 90 minutes is my rule of thumb, not a measured value). Keep that visit short or move it.\n'
        } else {
          r += 'RESULT: there is room on paper. Re-check if an earlier visit runs over.\n'
        }
      } else {
        r += `Your last visit starts at ${visitClock(lastVisit)}. Set a preferred home time in your profile and I can check it.\n`
      }
    }

    if ((cancelOrLate || list.length >= 3) && list.length >= 2) {
      const lowest = list
        .map(v => ({ v, p: priorityOf(v.customer_id) }))
        .filter(x => x.p !== 999)
        .sort((a, b) => b.p - a.p)[0]
      r += cancelOrLate ? '\nIF A VISIT FALLS AWAY OR YOU ARE LATE\n' : '\nIF YOU START RUNNING LATE\n'
      if (lowest) {
        r += `Call ${customerName(lowest.v.customer_id)} first (priority ${lowest.p}, the lowest in today's list) and agree a new time. `
      }
      const topFollowUp = [...s.overdue, ...s.dueToday][0]
      if (cancelOrLate && topFollowUp) {
        r += `Use any freed time to call ${customerName(topFollowUp.customer_id)} about "${topFollowUp.action}".`
      }
      r += '\n'
    }

    if (!tomorrow) r += energyNote(s)
    return r
  }

  function buildTomorrowAnswer() {
    const s = snapshot()
    const events = s.eventsOn(s.tomorrow)
    const carried = [...s.overdue, ...s.dueTomorrow]

    let r = `TOMORROW — ${s.tomorrow}\n\n`

    if (s.tomorrowPlanned.length === 0) {
      r += 'No planned or rescheduled visits are saved for tomorrow.\n'
    } else {
      r += `${s.tomorrowPlanned.length} planned visit${s.tomorrowPlanned.length === 1 ? '' : 's'}, in time order:\n`
      s.tomorrowPlanned.slice(0, 8).forEach((v, i) => {
        const c = customerById(v.customer_id)
        r += `${i + 1}. ${visitClock(v)} — ${customerName(v.customer_id)}${c ? ` (priority ${c.priority})` : ''}${v.next_action ? ` — ${v.next_action}` : ''}\n`
      })
    }

    if (events.length > 0) {
      r += '\nPersonal events:\n'
      events.forEach(e => {
        r += `• ${e.title}${e.all_day ? ' — all day' : ` — ${eventClock(e.starts_at)}`}\n`
      })
    }

    if (carried.length > 0) {
      r += `\nFollow-ups to clear (${s.overdue.length} overdue, ${s.dueTomorrow.length} due tomorrow):\n`
      carried.slice(0, 5).forEach((f, i) => {
        r += `${i + 1}. ${customerName(f.customer_id)} — ${f.action} — due ${f.due_date}${valueText(f.expected_value)}\n`
      })
    } else {
      r += '\nNo follow-ups are overdue or due tomorrow.\n'
    }

    r += '\nCOACH PRIORITY\n'
    const itemCount = s.tomorrowPlanned.length + carried.length
    if (s.tomorrowPlanned.length === 0 && carried.length === 0) {
      const top = customers
        .slice()
        .sort((a, b) => a.priority - b.priority || Number(b.potential_amount || 0) - Number(a.potential_amount || 0))
        .slice(0, 3)
      r += top.length > 0
        ? `Tomorrow is open. Fill it with your top-priority customers: ${listNames(top.map(c => c.name))}. Save the visits so I can plan around them.`
        : 'Tomorrow is open and I have no customers to suggest. Add customers or visits first.'
    } else if (s.tomorrowPlanned.length >= 5 || itemCount >= 8) {
      r += 'Tomorrow is heavy. Keep the highest-priority visits, turn low-priority ones into calls and protect your home time.'
    } else if (s.heavyDay) {
      r += 'Your latest check-in shows a heavy or low-energy day. Do not add anything to tomorrow beyond what is listed.'
    } else {
      r += 'Tomorrow looks manageable. Clear overdue follow-ups by phone early, then start the first visit.'
    }

    const first = s.tomorrowPlanned[0]
    if (first) {
      r += `\n\nFirst visit: ${customerName(first.customer_id)} at ${visitClock(first)}.`
      if (first.next_action) r += ` Prepare: ${first.next_action}.`
    }
    return r
  }

  // Today's visits grouped by their SAVED status (read-only; uses snapshot() only):
  //   planned     -> pending (split into "still ahead" and "time passed, not recorded yet")
  //   visited     -> completed
  //   unavailable -> neither completed nor pending
  //   rescheduled -> moved to another day, NOT pending today
  //   cancelled   -> neither completed nor pending
  function buildVisitStatusAnswer(q: string) {
    const s = snapshot()
    const all = s.todayAll

    if (all.length === 0) {
      return "TODAY'S VISITS\n\nNo visits are on today's route yet. Add stops in the ROUTE tab and I will track them here."
    }

    const pending = all.filter(v => v.status === 'planned')
    const ahead = pending.filter(v => visitMinutes(v) >= s.nowMins - 15)
    const passed = pending.filter(v => visitMinutes(v) < s.nowMins - 15)
    const visited = all.filter(v => v.status === 'visited')
    const unavailable = all.filter(v => v.status === 'unavailable')
    const rescheduled = all.filter(v => v.status === 'rescheduled')
    const cancelled = all.filter(v => v.status === 'cancelled')
    const other = all.filter(
      v => !['planned', 'visited', 'unavailable', 'rescheduled', 'cancelled'].includes(v.status)
    )

    const sale = (v: Visit) => (Number(v.sale_amount) > 0 ? ` — Sale ${inr(Number(v.sale_amount))}` : '')
    const line = (v: Visit) => `• ${customerName(v.customer_id)}`
    const section = (title: string, rows: string[]) =>
      `${title} (${rows.length})\n` + (rows.length > 0 ? rows.join('\n') : 'None') + '\n\n'

    const sections = {
      pending:
        section('PENDING', [
          ...ahead.map(v => `${line(v)} — planned ${visitClock(v)}`),
          ...passed.map(v => `${line(v)} — planned ${visitClock(v)} (time has passed, not recorded yet)`),
        ]),
      visited: section('VISITED', visited.map(v => `${line(v)}${sale(v)}`)),
      unavailable: section(
        'UNAVAILABLE — not counted as completed or pending',
        unavailable.map(v => line(v))
      ),
      rescheduled: section(
        'RESCHEDULED — moved to another day, not pending today',
        rescheduled.map(v => line(v))
      ),
    }

    // Lead with the status the user asked about; pending is the default
    const asksUnavailable = /\b(unavailable|not available)\b/.test(q)
    const asksRescheduled = /\brescheduled\b/.test(q)
    const asksPending = /\b(pending|left|remaining|outstanding|yet to|not yet|not visited|unvisited)\b/.test(q)
    const asksDone = !asksPending && /\b(completed|finished|visited)\b/.test(q)

    let lead = 'pending'
    if (asksUnavailable) lead = 'unavailable'
    else if (asksRescheduled) lead = 'rescheduled'
    else if (asksDone) lead = 'visited'

    let r = "TODAY'S VISITS\n\n"
    if (lead === 'pending') {
      r += pending.length === 0
        ? 'No customer visits are still pending today.\n\n'
        : `${pending.length} customer visit${pending.length === 1 ? ' is' : 's are'} still pending today.\n\n`
    }
    r += `Pending: ${pending.length} · Visited: ${visited.length} · Unavailable: ${unavailable.length} · Rescheduled: ${rescheduled.length}`
    if (cancelled.length > 0) r += ` · Cancelled: ${cancelled.length}`
    r += '\n\n'

    const order: (keyof typeof sections)[] = [lead as keyof typeof sections]
    for (const key of ['pending', 'visited', 'unavailable', 'rescheduled'] as const) {
      if (!order.includes(key)) order.push(key)
    }
    for (const key of order) {
      // Always show the section asked about and pending; show the others only when they have visits
      const count = { pending: pending.length, visited: visited.length, unavailable: unavailable.length, rescheduled: rescheduled.length }[key]
      if (key === lead || key === 'pending' || count > 0) r += sections[key]
    }

    if (cancelled.length > 0) {
      r += section('CANCELLED — not counted as completed or pending', cancelled.map(v => line(v)))
    }
    if (other.length > 0) {
      r += section('OTHER STATUS', other.map(v => `${line(v)} — ${v.status}`))
    }

    if (ahead[0]) {
      r += `Next: ${customerName(ahead[0].customer_id)} at ${visitClock(ahead[0])}.`
    } else if (passed.length > 0) {
      r += 'Open the ROUTE tab and record the outcome of the visits whose time has passed.'
    } else {
      r += "Nothing is left on today's route."
    }
    return r
  }

  function buildFollowUpAnswer(q: string) {
    const s = snapshot()
    const tomorrow = wantsTomorrow(q)
    const pool = tomorrow ? s.dueTomorrow : [...s.overdue, ...s.dueToday, ...s.dueTomorrow]

    let r = tomorrow ? 'FOLLOW-UPS DUE TOMORROW\n\n' : 'FOLLOW-UPS\n\n'
    if (pool.length === 0) {
      r += tomorrow
        ? 'No open follow-ups are due tomorrow.'
        : 'No open follow-ups are overdue, due today or due tomorrow.'
      if (!tomorrow && s.dueLater.length > 0) {
        r += `\n\nYou have ${s.dueLater.length} later follow-up${s.dueLater.length === 1 ? '' : 's'}; the next is ${customerName(s.dueLater[0].customer_id)} on ${s.dueLater[0].due_date}.`
      }
      return r
    }

    if (!tomorrow) {
      r += `Overdue: ${s.overdue.length} · Due today: ${s.dueToday.length} · Due tomorrow: ${s.dueTomorrow.length}\n\n`
    }

    // Most important: overdue/due-today first, ranked by the value you entered, then oldest
    const ranked = tomorrow ? pool : [...s.overdue, ...s.dueToday].length > 0 ? [...s.overdue, ...s.dueToday] : pool
    const top = ranked.slice().sort((a, b) =>
      Number(b.expected_value || 0) - Number(a.expected_value || 0) || a.due_date.localeCompare(b.due_date)
    )[0]
    const daysLate = top.due_date < s.today
      ? Math.round((new Date(s.today).getTime() - new Date(top.due_date).getTime()) / 86400000)
      : 0
    r += 'MOST IMPORTANT\n'
    r += `${customerName(top.customer_id)} — ${top.action}`
    r += daysLate > 0 ? ` — ${daysLate} day${daysLate === 1 ? '' : 's'} overdue` : ` — due ${top.due_date}`
    r += valueText(top.expected_value) + '\n'
    r += 'Why: it is the highest-value item among those due, using the values you saved.\n\n'

    r += 'FULL LIST\n'
    pool.slice(0, 8).forEach((f, i) => {
      r += `${i + 1}. ${customerName(f.customer_id)} — ${f.action} — due ${f.due_date}${valueText(f.expected_value)}\n`
    })
    r += '\nPhone follow-ups first: they need no travel and protect your home time.'
    return r
  }

  function buildCustomerAnswer(q: string) {
    const s = snapshot()
    const tomorrow = wantsTomorrow(q)
    const named = findNamedCustomer(q)

    if (named) {
      const planned = [...s.todayPlanned, ...s.tomorrowPlanned].filter(v => v.customer_id === named.id)
      const fups = s.open.filter(f => f.customer_id === named.id)
      const monthTotal = sales
        .filter(x => x.customer_id === named.id && x.status !== 'cancelled')
        .reduce((sum, x) => sum + Number(x.amount || 0), 0)
      let r = `${named.name.toUpperCase()}\n\n`
      r += `Priority ${named.priority}${named.potential_amount > 0 ? ` · potential ${inr(Number(named.potential_amount))}` : ''}\n`
      if (named.address) r += `Address: ${named.address}\n`
      r += `Sales recorded this month: ${monthTotal > 0 ? inr(monthTotal) : 'none'}\n`
      r += planned.length > 0
        ? `Planned: ${planned.map(v => `${istDate(v.planned_start) === s.today ? 'today' : 'tomorrow'} at ${visitClock(v)}`).join(', ')}\n`
        : 'No visit is planned for today or tomorrow.\n'
      if (fups.length > 0) {
        r += '\nOpen follow-ups:\n'
        fups.slice(0, 4).forEach(f => { r += `• ${f.action} — due ${f.due_date}${valueText(f.expected_value)}\n` })
      }
      r += '\nSuggested action: '
      r += fups[0]
        ? `${fups[0].due_date <= s.today ? 'Clear' : 'Prepare'} the follow-up "${fups[0].action}".`
        : planned[0]
          ? 'Prepare for the planned visit and decide one outcome you want from it.'
          : 'Plan a visit or call and record a follow-up date.'
      return r
    }

    const day = tomorrow ? s.tomorrow : s.today
    const plannedList = tomorrow ? s.tomorrowPlanned : s.todayUpcoming
    const doneIds = new Set(s.todayDone.map(v => v.customer_id))
    const dueFollowUps = s.open
      .filter(f => f.due_date <= day)
      .sort((a, b) => Number(b.expected_value || 0) - Number(a.expected_value || 0) || a.due_date.localeCompare(b.due_date))

    type Pick = { id: string; reason: string }
    const picks: Pick[] = []
    const seen = new Set<string>()
    const add = (id: string, reason: string) => {
      if (seen.has(id)) return
      seen.add(id)
      picks.push({ id, reason })
    }

    const asksNext = /\bnext\b|\bnow\b/.test(q)
    if (asksNext || tomorrow) {
      plannedList.forEach(v => add(v.customer_id, `already planned at ${visitClock(v)}`))
    } else {
      plannedList.forEach(v => add(v.customer_id, `already planned at ${visitClock(v)}`))
    }
    dueFollowUps.forEach(f =>
      add(f.customer_id, `follow-up "${f.action}" ${f.due_date < s.today ? 'overdue since' : 'due'} ${f.due_date}${valueText(f.expected_value)}`)
    )
    customers
      .filter(c => !doneIds.has(c.id))
      .slice()
      .sort((a, b) => a.priority - b.priority || Number(b.potential_amount || 0) - Number(a.potential_amount || 0))
      .forEach(c => add(c.id, `priority ${c.priority}${c.potential_amount > 0 ? `, potential ${inr(Number(c.potential_amount))}` : ''}, nothing planned`))

    if (picks.length === 0) {
      return 'CUSTOMER PRIORITY\n\nNo active customers, planned visits or follow-ups found. Add customers first.'
    }

    let r = tomorrow ? 'WHO TO VISIT TOMORROW\n\n' : asksNext ? 'WHO TO VISIT NEXT\n\n' : 'CUSTOMER PRIORITY\n\n'
    const top = picks[0]
    const topCustomer = customerById(top.id)
    r += `Start with ${customerName(top.id)} — ${top.reason}.\n`
    if (topCustomer?.address) r += `Address: ${topCustomer.address}\n`
    if (picks.length > 1) {
      r += '\nThen:\n'
      picks.slice(1, 4).forEach((p, i) => { r += `${i + 2}. ${customerName(p.id)} — ${p.reason}\n` })
    }
    r += '\nOrder used: planned visits first, then due or overdue follow-ups by value, then your priority and potential numbers. It is a simple ranking of your saved data, not a prediction.'
    if (!tomorrow) r += energyNote(s)
    return r
  }

  function buildRouteAnswer(q: string) {
    const s = snapshot()
    const tomorrow = wantsTomorrow(q)
    const list = tomorrow ? s.tomorrowPlanned : s.todayUpcoming

    let r = tomorrow ? 'TRAVEL — TOMORROW\n\n' : 'TRAVEL — REST OF TODAY\n\n'
    if (list.length === 0) {
      return r + 'No planned visits found, so there is no route to improve. Save your visits and I will check their order.'
    }

    r += 'Current order:\n'
    list.forEach((v, i) => {
      const c = customerById(v.customer_id)
      r += `${i + 1}. ${visitClock(v)} — ${customerName(v.customer_id)}${c?.address ? ` — ${c.address}` : ' — no address saved'}\n`
    })

    const missing = list.filter(v => !customerById(v.customer_id)?.address).length
    r += '\nWHAT I CAN AND CANNOT SEE\nI have addresses but no distances or live traffic, so I cannot give travel times. I only compare the address text.\n'
    if (missing > 0) {
      r += `${missing} of ${list.length} visits have no address, so they are left out of the check. Add addresses to those customers.\n`
    }

    const keys = list.map(v => areaKey(customerById(v.customer_id)?.address ?? null))
    const backtrack: string[] = []
    for (let i = 0; i + 2 < list.length; i++) {
      if (keys[i] && keys[i] === keys[i + 2] && keys[i + 1] && keys[i + 1] !== keys[i]) {
        backtrack.push(`${customerName(list[i].customer_id)} (#${i + 1}) and ${customerName(list[i + 2].customer_id)} (#${i + 3}) look to be in the same area, but ${customerName(list[i + 1].customer_id)} (#${i + 2}) is elsewhere`)
      }
    }

    r += '\nSUGGESTION\n'
    if (backtrack.length > 0) {
      r += `Possible backtracking: ${backtrack[0]}. If the appointment times are flexible, group the same-area visits together.\n`
    } else if (list.length >= 2) {
      r += 'I do not see an obvious back-and-forth pattern in the addresses.\n'
    }

    const callable = list
      .map(v => ({ v, c: customerById(v.customer_id) }))
      .filter(x => x.c && x.c.phone)
      .sort((a, b) => (b.c as Customer).priority - (a.c as Customer).priority)[0]
    if (list.length >= 3 && callable) {
      r += `To cut travel further, turn the lowest-priority visit (${(callable.c as Customer).name}, priority ${(callable.c as Customer).priority}) into a phone call if it does not need you in person.\n`
    }
    r += 'Use the ROUTE tab for the Google Maps links.'
    return r
  }

  function buildTargetAnswer(q: string) {
    const s = snapshot()
    let r = 'SALES AND TARGET\n\n'
    if (s.target <= 0) {
      return r + 'No monthly target is saved in your profile, so I cannot say whether you are behind. Set your target and I will compare it with your recorded sales.'
    }

    r += `Target: ${inr(s.target)}\n`
    r += `Achieved this month: ${inr(s.mtd)}${s.todaySales > 0 ? ` (${inr(s.todaySales)} today)` : ''}\n`
    r += `Remaining: ${inr(s.remaining)}\n`
    r += `Selling days left: ${s.daysLeft} (Monday to Saturday, including today)\n`

    if (s.remaining === 0) {
      return r + '\nYou have reached your monthly target on recorded sales. Protect the relationships and set up next month\'s follow-ups.'
    }

    r += `Needed per day: ${inr(s.required)}\n`
    r += `Your average so far: ${inr(s.avg)} per day\n`

    const behind = s.avg < s.required
    r += behind
      ? `\nYou are behind pace by about ${inr(s.required - s.avg)} a day.\n`
      : '\nYou are on pace at your current daily average.\n'

    // Due or overdue items first, then the rest; within each group, highest value first
    const withValue = s.open
      .filter(f => Number(f.expected_value || 0) > 0)
      .sort((a, b) => {
        const aDue = a.due_date <= s.today ? 0 : 1
        const bDue = b.due_date <= s.today ? 0 : 1
        return aDue - bDue || Number(b.expected_value) - Number(a.expected_value)
      })
      .slice(0, 3)

    r += '\nBEST NEXT MOVE\n'
    if (withValue.length > 0) {
      const total = withValue.reduce((sum, f) => sum + Number(f.expected_value), 0)
      withValue.forEach((f, i) => {
        r += `${i + 1}. ${customerName(f.customer_id)} — ${f.action} — due ${f.due_date}${valueText(f.expected_value)}\n`
      })
      r += `These three carry ${inr(total)} of expected value (figures you entered), about ${Math.round((total / s.remaining) * 100)}% of what remains. That is not a guarantee.\n`
      r += `Start with ${customerName(withValue[0].customer_id)}.\n`
    } else {
      const top = customers
        .slice()
        .sort((a, b) => Number(b.potential_amount || 0) - Number(a.potential_amount || 0))
        .slice(0, 3)
        .filter(c => c.potential_amount > 0)
      if (top.length > 0) {
        r += 'No follow-ups have an expected value saved. Your highest-potential customers are:\n'
        top.forEach((c, i) => { r += `${i + 1}. ${c.name} — potential ${inr(Number(c.potential_amount))}\n` })
        r += `Start with ${top[0].name} and record an expected value on the follow-up.\n`
      } else {
        r += 'No follow-up values or customer potentials are saved, so I cannot rank opportunities. Add expected values to follow-ups.\n'
      }
    }

    r += energyNote(s)
    if (/\bbehind\b/.test(q) && !behind) {
      r += '\nNote: your recorded sales do not show you behind pace. If you expected a different figure, check that every sale has been entered.\n'
    }
    return r
  }

  function buildHealthAnswer() {
    const s = snapshot()
    let r = 'ENERGY AND WELLBEING\n\n'
    if (!health) {
      return r + 'No health check-in is saved for today. Complete it in the HEALTH tab and I will adjust today\'s plan to it.'
    }

    r += `Energy ${s.energy ?? '—'}/10 · Stress ${s.stress ?? '—'}/10 · Sleep ${health.sleep_hours ?? '—'} hours`
    if (health.day_weight) r += ` · Day: ${health.day_weight}`
    if (health.home_time_status) r += ` · Home time: ${health.home_time_status}`
    r += '\n'
    if (health.pressure_tags && health.pressure_tags.length > 0) {
      r += `Pressure: ${health.pressure_tags.join(', ')}\n`
    }

    r += `\nWork still ahead: ${s.todayUpcoming.length} visit${s.todayUpcoming.length === 1 ? '' : 's'} and ${s.overdue.length + s.dueToday.length} follow-up${s.overdue.length + s.dueToday.length === 1 ? '' : 's'}`
    if (s.homeMins !== null) {
      r += s.minsToHome !== null
        ? `, with ${fmtDuration(s.minsToHome)} until your ${fmtClock(s.homeMins)} home time.\n`
        : `. Your ${fmtClock(s.homeMins)} home time has already passed.\n`
    } else {
      r += '.\n'
    }

    r += '\nWHAT TO DO\n'
    if (s.energy !== null && s.energy <= 3) {
      r += 'Energy is low. Keep only the highest-priority visit and the most valuable follow-up call. Move or call the rest.\n'
    } else if (s.stress !== null && s.stress >= 8) {
      r += 'Stress is high. Pick one valuable action, finish it, then decide the next. Avoid adding new commitments today.\n'
    } else if (health.sleep_hours !== null && health.sleep_hours < 6) {
      r += `You slept ${health.sleep_hours} hours. Avoid stacking long travel late in the day and keep the last visit short.\n`
    } else if (health.day_weight === 'heavy' || health.home_time_status === 'late') {
      r += 'The day is marked heavy or late. Cut the lowest-priority visit to a call so you get home near your target.\n'
    } else {
      r += 'Nothing in your check-in is a warning sign. Follow your plan and take a short break between visits.\n'
    }

    const lifeList = profile?.life_priorities ?? []
    if (lifeList.length > 0 && (s.heavyDay || (s.stress !== null && s.stress >= 8))) {
      r += `\nYou listed ${listNames(lifeList.slice(0, 2))} among your priorities. A lighter finish today protects them.\n`
    }
    r += '\nThis is planning guidance, not medical advice.'
    return r
  }

  function buildWorkloadAnswer(q: string) {
    const s = snapshot()
    const tomorrow = wantsTomorrow(q)
    const hoursGiven = parseHours(q)
    const planned = tomorrow ? s.tomorrowPlanned : s.todayUpcoming
    const dueFollowUps = tomorrow ? [...s.overdue, ...s.dueTomorrow] : [...s.overdue, ...s.dueToday]
    const hours = hoursGiven ?? (!tomorrow && s.minsToHome !== null ? s.minsToHome / 60 : null)

    let r = tomorrow ? 'WORKLOAD — TOMORROW\n\n' : 'WORKLOAD — REST OF TODAY\n\n'
    r += `Planned visits: ${planned.length}\n`
    r += `Follow-ups due or overdue: ${dueFollowUps.length}\n`
    if (hours !== null) {
      r += `Time available: ${fmtDuration(hours * 60)}${hoursGiven === null ? ' (until your home time)' : ' (as you told me)'}\n`
    } else if (!tomorrow) {
      r += 'Time available: unknown — no home time is saved, and you did not give hours.\n'
    }

    r += '\n'
    if (hours !== null) {
      const capacity = Math.max(1, Math.floor((hours * 60) / ASSUMED_MINUTES_PER_VISIT))
      r += `Assumption: about ${ASSUMED_MINUTES_PER_VISIT} minutes per visit including travel, because FieldOS has no saved durations. That fits about ${capacity} visit${capacity === 1 ? '' : 's'}.\n\n`
      const ranked = planned
        .slice()
        .sort((a, b) => priorityOf(a.customer_id) - priorityOf(b.customer_id))
      if (ranked.length > 0) {
        const keep = ranked.slice(0, capacity)
        const drop = ranked.slice(capacity)
        r += 'KEEP\n'
        keep.forEach(v => { r += `• ${customerName(v.customer_id)} at ${visitClock(v)} (priority ${priorityOf(v.customer_id) === 999 ? 'not set' : priorityOf(v.customer_id)})\n` })
        if (drop.length > 0) {
          r += '\nCALL OR MOVE\n'
          drop.forEach(v => { r += `• ${customerName(v.customer_id)} at ${visitClock(v)} — call, or move to another day\n` })
        } else {
          r += '\nEverything planned fits on this assumption.\n'
        }
      } else {
        r += 'No visits are planned. Use the time on follow-up calls first'
        r += dueFollowUps[0] ? `, starting with ${customerName(dueFollowUps[0].customer_id)} — ${dueFollowUps[0].action}.\n` : '.\n'
      }
    } else {
      const items = planned.length + dueFollowUps.length
      if (planned.length >= 6 || items >= 8) {
        r += 'Assessment: heavy. Keep only the high-priority visits and turn the rest into calls.\n'
      } else if (planned.length >= 4 || items >= 6) {
        r += 'Assessment: moderate. Keep the order disciplined and avoid unnecessary travel.\n'
      } else {
        r += 'Assessment: manageable on the records I have.\n'
      }
    }

    if (!tomorrow) r += energyNote(s)
    return r
  }

  function buildPerformanceAnswer() {
    const s = snapshot()
    const cancelled = s.todayAll.filter(v => v.status !== 'visited' && !isPlannedVisit(v)).length

    let r = 'TODAY — RESULTS\n\n'
    r += `Visits completed: ${s.todayDone.length}\n`
    r += `Still planned: ${s.todayUpcoming.length}\n`
    if (s.todayPassed.length > 0) r += `Planned but no result recorded: ${s.todayPassed.length}\n`
    if (cancelled > 0) r += `Cancelled or unavailable: ${cancelled}\n`
    r += `Sales recorded today: ${inr(s.todaySales)}\n`
    if (s.target > 0) r += `Month so far: ${inr(s.mtd)} of ${inr(s.target)} (${inr(s.remaining)} left)\n`

    r += '\nASSESSMENT\n'
    if (s.todaySales > 0 && s.todayDone.length > 0) {
      r += `${s.todayDone.length} completed visit${s.todayDone.length === 1 ? '' : 's'} and ${inr(s.todaySales)} recorded today.`
    } else if (s.todayDone.length > 0) {
      r += 'You completed visits but no sale is recorded today. Make sure each visit has an outcome or a follow-up date.'
    } else if (s.todaySales > 0) {
      r += 'A sale is recorded but no completed visit. Check that the related visit is marked visited.'
    } else {
      r += 'No completed visits or sales are recorded yet today.'
    }
    if (s.todayPassed.length > 0) {
      r += `\nRecord the outcome for ${listNames(s.todayPassed.map(v => customerName(v.customer_id)))} so the day's results are accurate.`
    }
    return r
  }

  function buildImprovePerformanceAnswer() {
    const s = snapshot()
    const monthSalesCount = sales.filter(x => x.status !== 'cancelled').length
    const urgent = [...s.overdue, ...s.dueToday].sort(
      (a, b) =>
        Number(b.expected_value || 0) - Number(a.expected_value || 0) ||
        a.due_date.localeCompare(b.due_date)
    )
    const behind = s.target > 0 && s.remaining > 0 && s.avg < s.required

    let r = 'IMPROVE YOUR PERFORMANCE\n\n'
    r += 'WHAT YOUR SAVED DATA SHOWS\n'
    r += `Today: ${s.todayDone.length} visit${s.todayDone.length === 1 ? '' : 's'} completed, ${s.todayUpcoming.length} still ahead`
    if (s.todayPassed.length > 0) r += `, ${s.todayPassed.length} planned earlier with no outcome recorded`
    r += `. Sales recorded today: ${inr(s.todaySales)}.\n`
    r += `Follow-ups: ${s.overdue.length} overdue, ${s.dueToday.length} due today, ${s.open.length} open in total.\n`
    if (s.target > 0) {
      r += `Month: ${inr(s.mtd)} of ${inr(s.target)} from ${monthSalesCount} recorded sale${monthSalesCount === 1 ? '' : 's'}`
      if (s.remaining > 0) {
        r += `; ${inr(s.remaining)} left over ${s.daysLeft} selling day${s.daysLeft === 1 ? '' : 's'} (${inr(s.required)} a day needed, ${inr(s.avg)} a day so far)`
      } else {
        r += '; target reached'
      }
      r += '.\n'
    } else {
      r += `Month: ${inr(s.mtd)} recorded. No monthly target is saved in your profile, so I cannot judge pace.\n`
    }
    if (health) {
      const bits: string[] = []
      if (s.energy !== null) bits.push(`energy ${s.energy}/10`)
      if (s.stress !== null) bits.push(`stress ${s.stress}/10`)
      r += bits.length > 0 ? `Check-in today: ${bits.join(', ')}.\n` : 'Check-in today is saved but has no energy or stress score.\n'
    } else {
      r += 'No health check-in saved today.\n'
    }

    const actions: string[] = []
    if (s.todayPassed.length > 0) {
      actions.push(`Record the outcome for ${listNames(s.todayPassed.map(v => customerName(v.customer_id)))}. Unrecorded visits hide your real results and lose the follow-up.`)
    }
    if (urgent[0]) {
      const f = urgent[0]
      actions.push(`Call ${customerName(f.customer_id)} about "${f.action}" (due ${f.due_date}${valueText(f.expected_value)}).${urgent.length > 1 ? ` ${urgent.length - 1} more follow-up${urgent.length - 1 === 1 ? ' is' : 's are'} due or overdue.` : ''}`)
    }
    if (s.todayUpcoming[0]) {
      const v = s.todayUpcoming[0]
      actions.push(`Make the ${visitClock(v)} visit to ${customerName(v.customer_id)} count${v.next_action ? `: ${v.next_action}` : ''}. Leave with a sale or a dated follow-up.`)
    }
    if (s.todayDone.length > 0 && s.todaySales === 0) {
      actions.push('You completed visits but no sale is recorded today. Check each visit has a sale or a follow-up date saved.')
    }
    if (behind) {
      actions.push(`You are about ${inr(s.required - s.avg)} a day behind the pace your target needs, so give first priority to the highest-value follow-ups.`)
    }
    const firstTomorrow = s.tomorrowPlanned[0]
    if (firstTomorrow) {
      actions.push(`Tomorrow starts with ${customerName(firstTomorrow.customer_id)} at ${visitClock(firstTomorrow)}.`)
    } else {
      actions.push('Nothing is planned for tomorrow. Save at least the first visit or one follow-up tonight.')
    }

    r += '\nNEXT ACTIONS\n'
    actions.slice(0, 4).forEach((a, i) => { r += `${i + 1}. ${a}\n` })

    r += energyNote(s)
    r += '\nBased on your saved visits for today and tomorrow, open follow-ups, this month\'s sales and today\'s check-in.'
    return r
  }

  function buildCoachAnswer(userQuestion: string) {
    const intent = getIntent(userQuestion)
    const q = normaliseQuestion(userQuestion)

    switch (intent) {
      case 'schedule': return buildScheduleAnswer(q)
      case 'workload': return buildWorkloadAnswer(q)
      case 'customers': return buildCustomerAnswer(q)
      case 'followups': return buildFollowUpAnswer(q)
      case 'visit_status': return buildVisitStatusAnswer(q)
      case 'target': return buildTargetAnswer(q)
      case 'route': return buildRouteAnswer(q)
      case 'health': return buildHealthAnswer()
      case 'improve': return buildImproveAnswer(q)
      case 'tomorrow': return buildTomorrowAnswer()
      case 'performance': return buildPerformanceAnswer()
      case 'improve_performance': return buildImprovePerformanceAnswer()
      case 'today': return buildOverviewAnswer()
      default:
        return buildUnknownAnswer()
    }
  }

  /* ---------------- ask ---------------- */

  async function askCoach() {
    const trimmed = question.trim()

    if (!trimmed) {
      setAnswer(buildOverviewAnswer())
      return
    }

    setAsking(true)
    setError('')

    let coachAnswer = ''
    let context: Record<string, unknown> = {}

    try {
      const intent = getIntent(trimmed)
      coachAnswer = buildCoachAnswer(trimmed)
      setAnswer(coachAnswer)

      const s = snapshot()
      context = {
        question_intent: intent,
        health,
        today: s.today,
        tomorrow: s.tomorrow,
        today_visits: s.todayAll.length,
        today_planned_ahead: s.todayUpcoming.length,
        tomorrow_visits: s.tomorrowPlanned.length,
        follow_ups_overdue: s.overdue.length,
        follow_ups_due_today: s.dueToday.length,
        follow_ups_due_tomorrow: s.dueTomorrow.length,
        personal_events_today: s.eventsOn(s.today).map(e => ({
          title: e.title,
          starts_at: e.starts_at,
          ends_at: e.ends_at,
          all_day: e.all_day,
        })),
        month_target: s.target,
        month_sales: s.mtd,
        sales_today: s.todaySales,
        customers_count: customers.length,
      }
    } catch (err) {
      // Never leave the button stuck: show what went wrong instead
      const message = err instanceof Error ? err.message : String(err)
      setError(`Coach could not build an answer: ${message}`)
      if (!coachAnswer) {
        setAnswer('Coach hit an error while reading your data, so it cannot answer this right now. Please try again, or reopen the COACH tab.')
      }
    } finally {
      setAsking(false)
    }

    // The answer is already on screen. Saving history must never block or hide it.
    if (coachAnswer) {
      if (typeof document !== 'undefined') {
        setTimeout(() => {
          document.getElementById('coach-answer')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }, 50)
      }
      try {
        const { error: insertError } = await supabase.from('coach_events').insert({
          user_id: userId,
          question: trimmed,
          answer: coachAnswer,
          context_json: context,
        })
        if (insertError) setError(`Answer shown, but your Coach history was not saved: ${insertError.message}`)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        setError(`Answer shown, but your Coach history was not saved: ${message}`)
      }
    }
  }

  /* ---------------- screen ---------------- */

  if (loading) {
    return (
      <div className="card">
        <h2>COACH</h2>
        <p>Preparing your FieldOS data...</p>
      </div>
    )
  }

  const view = snapshot()

  return (
    <div className="stack">
      <div className="card">
        <h2>COACH</h2>
        <p className="muted">
          Your personal FieldOS decision support for today, tomorrow and your highest-priority work.
        </p>
      </div>

      {error && (
        <div className="card">
          <p className="muted">Something needs attention: {error}</p>
        </div>
      )}

      <div className="card">
        <h3>YOUR DAY</h3>

        {health ? (
          <>
            <p>Energy: <strong>{health.energy ?? '—'}/10</strong></p>
            <p>Stress: <strong>{health.stress ?? '—'}/10</strong></p>
            <p>Sleep: <strong>{health.sleep_hours ?? '—'} hours</strong></p>
            <p>Day weight: <strong>{health.day_weight ?? '—'}</strong></p>
            <p>Home time: <strong>{health.home_time_status ?? '—'}</strong></p>
            {health.pressure_tags && health.pressure_tags.length > 0 && (
              <p>Pressure: <strong>{health.pressure_tags.join(', ')}</strong></p>
            )}
          </>
        ) : (
          <p className="muted">
            Complete your HEALTH check-in first so Coach can understand your day.
          </p>
        )}
      </div>

      <div className="card">
        <h3>REVENUE & WORK</h3>
        <p>Today's visits: <strong>{view.todayAll.length}</strong></p>
        <p>Tomorrow's planned visits: <strong>{view.tomorrowPlanned.length}</strong></p>
        <p>Completed visits today: <strong>{view.todayDone.length}</strong></p>
        <p>Follow-ups due/overdue: <strong>{view.overdue.length + view.dueToday.length}</strong></p>
        <p>Follow-ups due tomorrow: <strong>{view.dueTomorrow.length}</strong></p>
        <p>Sales today: <strong>{inr(view.todaySales)}</strong></p>
        {view.target > 0 && (
          <p>Month so far: <strong>{inr(view.mtd)} of {inr(view.target)}</strong></p>
        )}
      </div>

      <div className="card">
        <h3>ASK COACH</h3>

        <textarea
          value={question}
          onChange={e => setQuestion(e.target.value)}
          placeholder="Example: Who should I visit next? Can I get home on time? How do I reduce travel?"
          rows={4}
        />

        <button className="primary" onClick={askCoach} disabled={asking}>
          {asking ? 'THINKING…' : 'ASK COACH'}
        </button>
      </div>

      <div className="card" id="coach-answer">
        <h3>COACH'S RECOMMENDATION</h3>
        <p style={{ whiteSpace: 'pre-line' }}>{answer || buildOverviewAnswer()}</p>
      </div>
    </div>
  )
}
