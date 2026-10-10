import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { todayIST } from '../../lib/format'
import type { VisitRow } from '../../types'

// Reschedule an Unavailable or Cancelled visit by creating a NEW planned visit.
// The original visit record is never updated or deleted.

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

  // Only Unavailable and Cancelled visits can be rescheduled this way
  if (visit.status !== 'unavailable' && visit.status !== 'cancelled') return null
  const label = STATUS_LABEL[visit.status]

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
      .select('id')
      .eq('user_id', userId)
      .eq('customer_id', visit.customer_id)
      .eq('status', 'planned')
      .gte('planned_start', `${date}T00:00:00+05:30`)
      .lte('planned_start', `${date}T23:59:59+05:30`)
      .limit(1)

    if (existing.error) {
      setBusy(false)
      return setMsg('Could not check your schedule: ' + existing.error.message)
    }
    if ((existing.data ?? []).length > 0) {
      setBusy(false)
      return setMsg(`This customer already has a planned visit on ${date}. Choose another date, or open that visit from the route.`)
    }

    const original = istDay(visit.planned_start) ?? today
    const { error } = await supabase.from('visits').insert({
      user_id: userId,
      customer_id: visit.customer_id,
      planned_start: plannedStart,
      status: 'planned',
      notes: `Rescheduled from ${original} (${label})`
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
    return <button className="primary" onClick={() => { setOpen(true); setMsg('') }}>Reschedule this visit</button>
  }

  return (
    <div>
      <h2>Reschedule</h2>
      <p className="small">A new visit will be added. This {label} record stays exactly as it is.</p>
      <label>New date<input type="date" min={today} value={date} onChange={e => setDate(e.target.value)} /></label>
      <label>New time<input type="time" value={time} onChange={e => setTime(e.target.value)} /></label>
      {msg && <p className="msg">{msg}</p>}
      <button className="primary" disabled={busy} onClick={reschedule}>{busy ? 'Scheduling…' : 'Schedule new visit'}</button>
      <button className="link" disabled={busy} onClick={() => { setOpen(false); setMsg('') }}>Cancel</button>
    </div>
  )
}
