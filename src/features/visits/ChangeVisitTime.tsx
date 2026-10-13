import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { todayIST } from '../../lib/format'
import type { VisitRow } from '../../types'
import { buildPlannedStart, isTimeSlot, istClockOf, istDateOf, nextDay, SLOT_MESSAGE } from '../../lib/visitTime'
import TimeSelect from '../../components/TimeSelect'
import { STOP_BLOCKING_STATUSES } from '../../lib/rules'

// C10: change the date/time of a PLANNED visit in place.
// Updates only this visit's planned_start. Never deletes or recreates the visit.
export default function ChangeVisitTime({
  userId,
  visit,
  onSaved
}: {
  userId: string
  visit: VisitRow
  onSaved: () => void
}) {
  const today = todayIST()
  const currentDate = istDateOf(visit.planned_start) ?? today
  const currentTime = istClockOf(visit.planned_start) ?? ''

  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(currentDate)
  const [time, setTime] = useState(currentTime)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  if (visit.status !== 'planned') return null

  async function save() {
    if (busy) return
    setMsg('')

    const plannedStart = buildPlannedStart(date, time)
    if (!plannedStart) return setMsg('Choose a valid date and time.')
    if (date < today) return setMsg('The date cannot be in the past.')
    if (date === currentDate && time === currentTime) return setMsg('That is already the planned time.')
    if (!isTimeSlot(time)) return setMsg(SLOT_MESSAGE)   // C19: 5-minute steps only

    setBusy(true)
    try {
      // One visit per customer per day (C20 rule): another planned, visited or rescheduled
      // visit that day blocks the move. Cancelled or unavailable visits do not.
      const dup = await supabase
        .from('visits')
        .select('id')
        .eq('user_id', userId)
        .eq('customer_id', visit.customer_id)
        .in('status', [...STOP_BLOCKING_STATUSES])
        .neq('id', visit.id)
        .gte('planned_start', `${date}T00:00:00+05:30`)
        .lt('planned_start', `${nextDay(date)}T00:00:00+05:30`)
        .limit(1)

      if (dup.error) return setMsg('Could not check your schedule: ' + dup.error.message)
      if ((dup.data ?? []).length > 0) {
        return setMsg(`${visit.customers?.name ?? 'This customer'} already has another visit on ${date}. Choose another date.`)
      }

      // Update only this visit, only if it is still planned and still belongs to this user and customer.
      const result = await supabase
        .from('visits')
        .update({ planned_start: plannedStart })
        .eq('id', visit.id)
        .eq('user_id', userId)
        .eq('customer_id', visit.customer_id)
        .eq('status', 'planned')
        .select('id')

      if (result.error) return setMsg('Could not change the time: ' + result.error.message)
      if (!result.data || result.data.length !== 1) {
        return setMsg('The change was not confirmed. The visit may have changed. Go back to the route and check before trying again.')
      }

      onSaved()
    } catch {
      setMsg('Something went wrong while saving. Go back to the route and check before trying again.')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <div className="card">
        <button className="link" style={{ textAlign: 'left' }} onClick={() => setOpen(true)}>
          Change time or date
        </button>
      </div>
    )
  }

  return (
    <div className="card">
      <h2>Change time</h2>
      <p className="small">This moves the same visit. Nothing is deleted or duplicated.</p>
      <label>Date<input type="date" min={today} value={date} disabled={busy} onChange={e => setDate(e.target.value)} /></label>
      <TimeSelect label="Time" value={time} disabled={busy} onChange={setTime} />
      {msg && <p className="msg">{msg}</p>}
      <button className="primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save new time'}</button>
      <button
        className="link"
        disabled={busy}
        onClick={() => { setOpen(false); setDate(currentDate); setTime(currentTime); setMsg('') }}
      >
        Cancel
      </button>
    </div>
  )
}
