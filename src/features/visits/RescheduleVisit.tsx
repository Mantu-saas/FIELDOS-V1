
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { todayIST } from '../../lib/format'
import type { VisitRow } from '../../types'
import {
  buildPlannedStart,
  istClockOf,
  suggestRescheduleTime,
  workingHours
} from '../../lib/visitTime'

const IST = 'Asia/Kolkata'

const STATUS_LABEL: Record<string, string> = {
  unavailable: 'Unavailable',
  cancelled: 'Cancelled',
  rescheduled: 'Rescheduled'
}

type PlannedVisit = {
  id: string
  planned_start: string
}

function istDay(iso: string | null): string | null {
  if (!iso) return null

  const date = new Date(iso)

  if (Number.isNaN(date.getTime())) return null

  return new Intl.DateTimeFormat('en-CA', {
    timeZone: IST
  }).format(date)
}

function formatWhen(iso: string): string {
  const date = new Date(iso)

  if (Number.isNaN(date.getTime())) return 'Unknown time'

  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(date)
}

function formatClock(iso: string): string {
  const date = new Date(iso)

  if (Number.isNaN(date.getTime())) return ''

  return new Intl.DateTimeFormat('en-IN', {
    timeZone: IST,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(date)
}

function nextDay(date: string): string {
  const [year, month, day] = date.split('-').map(Number)

  return new Date(
    Date.UTC(year, month - 1, day + 1)
  ).toISOString().slice(0, 10)
}

export default function RescheduleVisit({
  userId,
  visit,
  onDone,
  workStart,
  workEnd
}: {
  userId: string
  visit: VisitRow
  onDone: () => void
  workStart?: string | null
  workEnd?: string | null
}) {
  const today = todayIST()
  const hours = workingHours(workStart, workEnd)

  // Keep an original time only if it was within working hours; otherwise suggest
  // the start of the working day (C10: never carry over a 1:07 AM time).
  const suggestTime = (iso: string | null) =>
    suggestRescheduleTime(istClockOf(iso), hours)

  const [mode, setMode] = useState<'move' | 'additional' | null>(null)
  const [date, setDate] = useState(nextDay(today))
  const [time, setTime] = useState(suggestTime(visit.planned_start))
  const [moveId, setMoveId] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [success, setSuccess] = useState('')
  const [already, setAlready] = useState<PlannedVisit[]>([])

  const eligible =
    visit.status === 'unavailable' ||
    visit.status === 'cancelled' ||
    visit.status === 'rescheduled'

  const label = eligible ? STATUS_LABEL[visit.status] : ''

  const marker =
    `Rescheduled from ${istDay(visit.planned_start) ?? today} (${label})`

  useEffect(() => {
    if (!eligible) return

    let cancelled = false

    async function loadRelatedVisits() {
      const result = await supabase
        .from('visits')
        .select('id,planned_start')
        .eq('user_id', userId)
        .eq('customer_id', visit.customer_id)
        .eq('status', 'planned')
        .eq('notes', marker)
        .order('planned_start', { ascending: true })

      if (cancelled) return

      if (result.error) {
        setMsg(
          'Could not load existing planned visits: ' +
          result.error.message
        )
        return
      }

      const rows = (result.data ?? []) as PlannedVisit[]

      setAlready(
        rows.filter(
          row => row.id && row.planned_start
        )
      )
    }

    void loadRelatedVisits()

    return () => {
      cancelled = true
    }
  }, [
    eligible,
    userId,
    visit.customer_id,
    marker
  ])

  if (!eligible) return null

  function startMode(nextMode: 'move' | 'additional') {
    setMsg('')
    setSuccess('')
    setMode(nextMode)

    if (nextMode === 'move' && already.length > 0) {
      setMoveId(already[0].id)
      setDate(nextDay(today))
      setTime(suggestTime(already[0].planned_start))
    } else {
      setMoveId('')
      setDate(nextDay(today))
      setTime(suggestTime(visit.planned_start))
    }
  }

  async function saveVisit() {
    if (busy) return

    setMsg('')
    setSuccess('')

    if (mode === 'move' && !moveId) {
      setMsg('Choose the planned visit you want to move.')
      return
    }

    if (!date || !time) {
      setMsg('Please choose a date and time.')
      return
    }

    if (date < today) {
      setMsg('The new date cannot be in the past.')
      return
    }

    const plannedStart = buildPlannedStart(date, time)
    const startMs = plannedStart ? new Date(plannedStart).getTime() : NaN

    if (!plannedStart || !Number.isFinite(startMs)) {
      setMsg('Please enter a valid date and time.')
      return
    }

    if (startMs <= Date.now()) {
      setMsg('The new time must be in the future.')
      return
    }

    setBusy(true)

    try {
      // Check the selected customer's schedule for this date.
      // When moving a visit, exclude that visit's own ID.
      let duplicateQuery = supabase
        .from('visits')
        .select('id,planned_start')
        .eq('user_id', userId)
        .eq('customer_id', visit.customer_id)
        .eq('status', 'planned')
        .gte('planned_start', `${date}T00:00:00+05:30`)
        .lt('planned_start', `${nextDay(date)}T00:00:00+05:30`)

      if (mode === 'move') {
        duplicateQuery = duplicateQuery.neq('id', moveId)
      }

      const duplicateResult = await duplicateQuery
        .order('planned_start', { ascending: true })
        .limit(1)

      if (duplicateResult.error) {
        setMsg(
          'Could not check your schedule: ' +
          duplicateResult.error.message
        )
        return
      }

      const duplicates = duplicateResult.data ?? []

      if (duplicates.length > 0) {
        const existingTime = duplicates[0].planned_start
          ? ` at ${formatClock(duplicates[0].planned_start)}`
          : ''

        setMsg(
          `${visit.customers?.name ?? 'This customer'} already has a planned visit on ${date}${existingTime}. Choose another date.`
        )
        return
      }

      if (mode === 'move') {
        // Update the existing row. Do not insert a replacement row.
        const result = await supabase
          .from('visits')
          .update({
            planned_start: plannedStart
          })
          .eq('id', moveId)
          .eq('user_id', userId)
          .eq('customer_id', visit.customer_id)
          .eq('status', 'planned')
          .select('id,planned_start')

        if (result.error) {
          setMsg(
            'Could not move the visit: ' +
            result.error.message
          )
          return
        }

        if (!result.data || result.data.length !== 1) {
          setMsg(
            'The visit was not confirmed as updated. It may have changed or may no longer be available. Refresh and check your route before trying again.'
          )
          return
        }

        const updated = result.data[0] as PlannedVisit

        setAlready(current =>
          current
            .map(item =>
              item.id === updated.id ? updated : item
            )
            .sort((a, b) =>
              a.planned_start.localeCompare(b.planned_start)
            )
        )

        setSuccess(
          `Visit moved successfully to ${formatWhen(updated.planned_start)}.`
        )
      } else {
        // Additional visit: create a separate row.
        const result = await supabase
          .from('visits')
          .insert({
            user_id: userId,
            customer_id: visit.customer_id,
            planned_start: plannedStart,
            status: 'planned',
            notes: marker
          })
          .select('id,planned_start')

        if (result.error) {
          setMsg(
            'Could not schedule the additional visit: ' +
            result.error.message
          )
          return
        }

        if (!result.data || result.data.length !== 1) {
          setMsg(
            'The new visit was not confirmed as saved. Refresh and check your route before trying again.'
          )
          return
        }

        const created = result.data[0] as PlannedVisit

        setAlready(current =>
          [...current, created].sort((a, b) =>
            a.planned_start.localeCompare(b.planned_start)
          )
        )

        setSuccess(
          `Additional visit scheduled for ${formatWhen(created.planned_start)}.`
        )
      }
    } catch {
      setMsg(
        'Something went wrong while saving. Refresh and check your route before trying again.'
      )
    } finally {
      setBusy(false)
    }
  }

  if (success) {
    return (
      <div className="tip">
        <b>{success}</b>

        <p className="small">
          The original {label.toLowerCase()} record remains unchanged.
        </p>

        <button
          className="primary"
          onClick={onDone}
        >
          Back to route
        </button>

        <button
          className="link"
          onClick={() => {
            setSuccess('')
            setMsg('')
            setMode(null)
          }}
        >
          Continue planning
        </button>
      </div>
    )
  }

  return (
    <div>
      <h2>Plan another visit</h2>

      <p className="small">
        The original {label.toLowerCase()} record stays unchanged.
        You can move an existing planned visit or schedule an
        additional visit.
      </p>

      {already.length > 0 && (
        <div className="card">
          <b>Existing planned visits from this record</b>

          {already.map(item => (
            <p className="small" key={item.id}>
              {formatWhen(item.planned_start)}
            </p>
          ))}
        </div>
      )}

      {mode === null ? (
        <div className="stack">
          {already.length > 0 && (
            <button
              className="primary"
              onClick={() => startMode('move')}
            >
              Move an existing visit
            </button>
          )}

          <button
            className={already.length > 0 ? 'link' : 'primary'}
            onClick={() => startMode('additional')}
          >
            Schedule an additional visit
          </button>
        </div>
      ) : (
        <>
          <p className="small">
            {mode === 'move'
              ? 'Choose the existing visit to move. Its record will be updated, not duplicated.'
              : 'A new planned visit will be created. Existing visits will remain unchanged.'}
          </p>

          {mode === 'move' && (
            <label>
              Existing visit
              <select
                value={moveId}
                disabled={busy}
                onChange={event => {
                  const selectedId = event.target.value
                  setMoveId(selectedId)

                  const selectedVisit = already.find(
                    item => item.id === selectedId
                  )

                  if (selectedVisit) {
                    setDate(nextDay(today))
                    setTime(suggestTime(selectedVisit.planned_start))
                  }

                  setMsg('')
                }}
              >
                <option value="">Choose a visit…</option>

                {already.map(item => (
                  <option key={item.id} value={item.id}>
                    {formatWhen(item.planned_start)}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label>
            {mode === 'move' ? 'New date' : 'Visit date'}
            <input
              type="date"
              min={today}
              value={date}
              disabled={busy}
              onChange={event => setDate(event.target.value)}
            />
          </label>

          <label>
            {mode === 'move' ? 'New time' : 'Visit time'}
            <input
              type="time"
              value={time}
              disabled={busy}
              onChange={event => setTime(event.target.value)}
            />
          </label>

          {msg && <p className="msg">{msg}</p>}

          <button
            className="primary"
            disabled={busy}
            onClick={() => void saveVisit()}
          >
            {busy
              ? 'Saving…'
              : mode === 'move'
                ? 'Move existing visit'
                : 'Schedule additional visit'}
          </button>

          <button
            className="link"
            disabled={busy}
            onClick={() => {
              setMode(null)
              setMsg('')
            }}
          >
            Back
          </button>
        </>
      )}
    </div>
  )
}
