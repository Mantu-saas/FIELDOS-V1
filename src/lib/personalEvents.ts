// MY WEEK helpers. Uses the existing personal_events table only (no schema changes).

import { supabase } from './supabase'

export const CATEGORIES = [
  'work',
  'family',
  'health',
  'finance',
  'travel',
  'personal',
  'important'
] as const

export const PRIORITIES = ['low', 'normal', 'high'] as const

export const REMINDERS = [
  { value: 'none', label: 'No reminder', minutes: null as number | null },
  { value: '15', label: '15 minutes before', minutes: 15 },
  { value: '30', label: '30 minutes before', minutes: 30 },
  { value: '60', label: '60 minutes before', minutes: 60 },
  { value: '1440', label: '1 day before', minutes: 1440 }
]

export const DAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday'
]

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

// ----------------------------------------------------
// India / Asia-Kolkata date helpers
// ----------------------------------------------------

const IST = 'Asia/Kolkata'

export const istDate = (date: Date): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: IST
  }).format(date)

export const istToday = (): string =>
  istDate(new Date())

export const isToday = (date: Date): boolean =>
  istDate(date) === istToday()

export function addDaysStr(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const value = new Date(Date.UTC(y, m - 1, d))
  value.setUTCDate(value.getUTCDate() + n)

  return value.toISOString().slice(0, 10)
}

export function weekStartMonday(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const value = new Date(Date.UTC(y, m - 1, d))

  const day = value.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day

  value.setUTCDate(value.getUTCDate() + diff)

  return value.toISOString().slice(0, 10)
}

export function weekDates(monday: string): string[] {
  return Array.from({ length: 7 }, (_, index) =>
    addDaysStr(monday, index)
  )
}
export function istStamp(date: string, time: string): string {
  return `${date}T${time}+05:30`
}

export function formatTimeIST(value: string | null): string {
  if (!value) return ''

  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }).format(new Date(value))
}

export function formatDayShort(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const value = new Date(Date.UTC(y, m - 1, d))

  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC'
  }).format(value)
}

export function inrText(value: number | null): string {
  if (value === null || value === undefined) return ''

  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(Number(value))
}

// ----------------------------------------------------
// Load events for one week
// ----------------------------------------------------

export async function loadWeekEvents(
  userId: string,
  monday: string
): Promise<{
  events: PersonalEvent[]
  error: string
}> {
  const weekEnd = addDaysStr(monday, 7)

  const { data, error } = await supabase
    .from('personal_events')
    .select(
      'id,user_id,title,category,starts_at,ends_at,all_day,priority,location,amount,notes,reminder_minutes,status'
    )
    .eq('user_id', userId)
    .gte('starts_at', istStamp(monday, '00:00'))
    .lt('starts_at', istStamp(weekEnd, '00:00'))
    .order('starts_at', { ascending: true })

  if (error) {
    return {
      events: [],
      error: error.message
    }
  }

  return {
    events: (data ?? []) as PersonalEvent[],
    error: ''
  }
}

// ----------------------------------------------------
// Create event
// ----------------------------------------------------

export async function createEvent(
  event: NewEvent
): Promise<{
  event: PersonalEvent | null
  error: string
}> {
  const { data, error } = await supabase
    .from('personal_events')
    .insert({
      user_id: event.userId,
      title: event.title,
      category: event.category,
      starts_at: event.startsAt,
      ends_at: event.endsAt,
      all_day: event.allDay,
      priority: event.priority,
      location: event.location,
      amount: event.amount,
      notes: event.notes,
      reminder_minutes: event.reminderMinutes,
      status: 'planned'
    })
    .select(
      'id,user_id,title,category,starts_at,ends_at,all_day,priority,location,amount,notes,reminder_minutes,status'
    )
    .single()

  if (error) {
    return {
      event: null,
      error: error.message
    }
  }

  return {
    event: data as PersonalEvent,
    error: ''
  }
}