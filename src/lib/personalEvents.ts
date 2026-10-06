// MY WEEK helpers. Uses the existing personal_events table only (no schema changes).
import { supabase } from './supabase'

export const CATEGORIES = ['work', 'family', 'health', 'finance', 'travel', 'personal', 'important'] as const
export const PRIORITIES = ['low', 'normal', 'high'] as const
export const REMINDERS = [
  { value: 'none', label: 'No reminder', minutes: null as number | null },
  { value: '15', label: '15 minutes before', minutes: 15 },
  { value: '30', label: '30 minutes before', minutes: 30 },
  { value: '60', label: '60 minutes before', minutes: 60 },
  { value: '1440', label: '1 day before', minutes: 1440 }
]
export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export type PersonalEvent = {
  id: string
  user_id: string
  title: string
  category: string
  starts_at: string
  ends_at: string | null
  all_day: boolean
  priority: string
  location: string | null
  amount: number | null
  notes: string | null
  reminder_minutes: number | null
  status: string
}

export type NewEvent = {
  userId: string
  title: string
  category: string
  startsAt: string
  endsAt: string | null
  allDay: boolean
  priority: string
  location: string | null
  amount: number | null
  notes: string | null
  reminderMinutes: number | null
}

// ---- India (Asia/Kolkata) date helpers. Dates are plain YYYY-MM-DD strings. ----
const IST = 'Asia/Kolkata'
export const istDate = (d: Date): string => new Intl.DateTimeFormat('en-CA', { timeZone: IST }).format(d)
export const istToday = (): string => istDate(new Date())

export function addDaysStr(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

// Monday of the week containing `date`. Sunday belongs to the week that started the Monday before.
export function weekStartMonday(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0 = Sunday
  return addDaysStr(date, -((dow + 6) % 7))
}

export const weekDates = (monday: string): string[] => [0, 1, 2, 3, 4, 5, 6].map(i => addDaysStr(monday, i))

// Builds a timestamp that carries the India offset, e.g. 2026-10-06T10:30:00+05:30
export const istStamp = (date: string, time: string): string => `${date}T${time}:00+05:30`

export function formatTimeIST(iso: string): string {
  return new Intl.DateTimeFormat('en-IN', { timeZone: IST, hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso))
}

export function formatDayShort(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(new Date(Date.UTC(y, m - 1, d)))
}

export const inrText = (n: number): string =>
  '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n)

// ---- Database access ----
export async function loadWeekEvents(userId: string, monday: string): Promise<{ events: PersonalEvent[]; error: string | null }> {
  const { data, error } = await supabase
    .from('personal_events')
    .select('id,user_id,title,category,starts_at,ends_at,all_day,priority,location,amount,notes,reminder_minutes,status')
    .eq('user_id', userId)
    .gte('starts_at', istStamp(monday, '00:00'))
    .lt('starts_at', istStamp(addDaysStr(monday, 7), '00:00'))
    .order('starts_at', { ascending: true })
  if (error) return { events: [], error: error.message }
  const events = ((data ?? []) as PersonalEvent[]).map(e => ({ ...e, amount: e.amount === null ? null : Number(e.amount) }))
  return { events, error: null }
}

export async function createEvent(e: NewEvent): Promise<string | null> {
  const { error } = await supabase.from('personal_events').insert({
    user_id: e.userId, // required: the table has no default for user_id
    title: e.title,
    category: e.category,
    starts_at: e.startsAt,
    ends_at: e.endsAt,
    all_day: e.allDay,
    priority: e.priority,
    location: e.location,
    amount: e.amount,
    notes: e.notes,
    reminder_minutes: e.reminderMinutes,
    status: 'planned'
  })
  return error ? error.message : null
}
