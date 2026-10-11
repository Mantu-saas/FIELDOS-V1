import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { todayIST } from '../../lib/format'
import type { VisitRow } from '../../types'

// Reschedule an Unavailable or Cancelled visit by creating a NEW planned visit.
// The original visit record is never updated or deleted.
//
// Every new visit gets the note "Rescheduled from <date> (<status>)". This screen
// uses that note to recognise visits already created from this record, so it can
// show them instead of quietly offering to create another one.

const IST = 'Asia/Kolkata'
const STATUS_LABEL: Record<string, string> = { unavailable: 'Unavailable', cancelled: 'Cancelled' }

function istDay(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : new Intl.DateTimeFormat('en-CA', { timeZone: IST }).format(d)
}

// Time of day (HH:MM, India time) of the original visit; 10:00 if it has none
function istClock(iso: string | null): string {
  if (!iso) return '10:00'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '10:00'
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: IST, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d)
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? ''
  const hh = get('hour')
  const mm = get('minute')
  return hh && mm ? `${hh}:${mm}` : '10:00'
}

// e.g. "12 Oct, 1:07 am" (India time)
function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('en-IN', { timeZone: IST, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }).format(d)
}

// e.g. "1:07 am" (India time)
function formatClock(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('en-IN', { timeZone: IST, hour: 'numeric', minute: '2-digit', hour12: true }).format(d)
}

type CreatedFromThis = { id: string; planned_start: string }

function nextDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
}

export default function RescheduleVisit({ userId, visit, onDone }: { userId: string; visit: VisitRow; onDone: () => void }) {
  const today = todayIST()
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(nextDay(today))
  const [time, setTime] = useState(istClock(visit.planned_start))
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [createdFor, setCreatedFor] = useState<string | null>(null)
  // Planned visits that were already created from this cancelled/unavailable record
  const [already, setAlready] = useState<CreatedFromThis[]>([])

  const eligible = visit.status === 'unavailable' || visit.status === 'cancelled'
  const label = eligible ? STATUS_LABEL[visit.status] : ''
  const marker = `Rescheduled from ${istDay(visit.planned_start) ?? today} (${label})`

  useEffect(() => {
    if (!eligible) return
    let off = false
    async function findExisting() {
      const r = await supabase
        .from('visits')
        .select('id,planned_start')
        .eq('user_id', userId)
        .eq('customer_id', visit.customer_id)
        .eq('status', 'planned')
        .eq('notes', marker)
        .order('planned_start', { ascending: true })
      // If this lookup fails, carry on as before: the same-date check below still protects against duplicates
      if (off || r.error) return
      const rows = (r.data ?? []) as unknown as { id: string; planned_start: string | null }[]
      setAlready(rows.filter(row => row.planned_start).map(row => ({ id: row.id, planned_start: row.planned_start as string })))
    }
    void findExisting()
    return () => { off = true }
  }, [eligible, userId, visit.customer_id, marker])

  // Only Unavailable and Cancelled visits can be rescheduled this way
  if (!eligible) return null

  async function reschedule() {
    if (busy || createdFor) return
    setMsg('')

    if (!date || !time) return setMsg('Please choose a date and a time.')
    if (date < today) return setMsg('The new date cannot be in the past.')
    const plannedStart = `${date}T${time}:00+05:30`
    const startMs = new Date(plannedStart).getTime()
    if (!Number.isFinite(startMs)) return setMsg('Please enter a valid date and time.')
    if (startMs <= Date.now()) return setMsg('The new time must be in the future.')

    setBusy(true)

    // Block a second planned visit for the same customer on the same date
    const existing = await supabase
      .from('visits')
      .select('id,planned_start')
      .eq('user_id', userId)
      .eq('customer_id', visit.customer_id)
      .eq('status', 'planned')
      .gte('planned_start', `${date}T00:00:00+05:30`)
      .lt('planned_start', `${nextDay(date)}T00:00:00+05:30`)
      .order('planned_start', { ascending: true })
      .limit(1)

    if (existing.error) {
      setBusy(false)
      return setMsg('Could not check your schedule: ' + existing.error.message)
    }
    const found = (existing.data ?? []) as unknown as { planned_start: string | null }[]
    if (found.length > 0) {
      setBusy(false)
      const who = visit.customers?.name ?? 'This customer'
      const at = found[0].planned_start ? ` at ${formatClock(found[0].planned_start)}` : ''
      // The route screen only lists today's visits, so only point to it when the clash is today
      const advice = date === today ? "Open it from today's route, or choose another date." : 'Choose another date.'
      return setMsg(`${who} already has a planned visit on ${date}${at}. ${advice}`)
    }

    const { error } = await supabase.from('visits').insert({
      user_id: userId,
      customer_id: visit.customer_id,
      planned_start: plannedStart,
      status: 'planned',
      notes: marker
    })

    setBusy(false)
    if (error) return setMsg('Could not schedule the new visit: ' + error.message)
    setCreatedFor(`${date} at ${time}`)
  }

  if (createdFor) {
    return (
      <div className="tip">
        <b>New visit scheduled for {createdFor}.</b>
        <p className="small">The original {label} record has not been changed.</p>
        <button className="link" onClick={onDone}>Back to route</button>
      </div>
    )
  }

  if (!open) {
    if (already.length > 0) {
      return (
        <div className="tip">
          <b>Already rescheduled to {already.map(v => formatWhen(v.planned_start)).join('; ')}.</b>
          <p className="small">These planned visits were created from this record. Open them from the route on their day.</p>
          <button className="link" onClick={() => { setOpen(true); setMsg('') }}>Schedule another visit anyway</button>
        </div>
      )
    }
    return <button className="primary" onClick={() => { setOpen(true); setMsg('') }}>Reschedule this visit</button>
  }

  return (
    <div>
      <h2>Reschedule</h2>
      <p className="small">A new visit will be added. This {label} record stays exactly as it is.</p>
      {already.length > 0 && <p className="small">Already scheduled from this record: {already.map(v => formatWhen(v.planned_start)).join('; ')}.</p>}
      <label>New date<input type="date" min={today} value={date} onChange={e => setDate(e.target.value)} /></label>
      <label>New time<input type="time" value={time} onChange={e => setTime(e.target.value)} /></label>
      {msg && <p className="msg">{msg}</p>}
      <button className="primary" disabled={busy} onClick={reschedule}>{busy ? 'Scheduling…' : 'Schedule new visit'}</button>
      <button className="link" disabled={busy} onClick={() => { setOpen(false); setMsg('') }}>Cancel</button>
    </div>
  )
}
