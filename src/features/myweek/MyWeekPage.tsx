import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Profile } from '../../types'
import {
  addDaysStr,
  istDate,
  istToday,
  formatTimeIST,
  formatDayShort,
  inrText,
  loadWeekEvents,
  type PersonalEvent
} from '../../lib/personalEvents'
import EventForm from './EventForm'

const cap = (s: string) =>
  s.charAt(0).toUpperCase() + s.slice(1)

const isCompleted = (status: string) =>
  ['completed', 'complete', 'done'].includes(status.toLowerCase())

type FollowUpRow = {
  id: string
  customer_id: string | null
  due_date: string
  action: string
  expected_value: number | null
  status: string
  customers?: { name: string } | { name: string }[] | null
}

function followUpCustomerName(item: FollowUpRow): string {
  const related = item.customers
  if (Array.isArray(related)) return related[0]?.name || 'Customer'
  return related?.name || 'Customer'
}

function timeLabel(e: PersonalEvent): string {
  if (e.all_day) return 'All day'

  const start = formatTimeIST(e.starts_at)

  if (!e.ends_at) return start

  const sameDay =
    istDate(new Date(e.ends_at)) ===
    istDate(new Date(e.starts_at))

  return sameDay
    ? `${start} – ${formatTimeIST(e.ends_at)}`
    : `${start} – ${formatDayShort(
        istDate(new Date(e.ends_at))
      )} ${formatTimeIST(e.ends_at)}`
}

// A customer visit shown in the planner (read-only here; visits are managed in ROUTE)
type WeekVisit = {
  id: string
  customer_id: string
  status: string
  planned_start: string
  notes: string | null
  customers?: { name: string } | { name: string }[] | null
}

function visitCustomerName(item: WeekVisit): string {
  const related = item.customers
  if (Array.isArray(related)) return related[0]?.name || 'Customer'
  return related?.name || 'Customer'
}

type WeeklySummary = {
  salesAmount: number
  salesCount: number
  visitsCompleted: number
  followUpsCompleted: number
}

const EMPTY_SUMMARY: WeeklySummary = {
  salesAmount: 0,
  salesCount: 0,
  visitsCompleted: 0,
  followUpsCompleted: 0
}

export default function MyWeekPage({
  profile,
  onBack
}: {
  profile: Profile
  onBack: () => void
}) {
  const [events, setEvents] = useState<PersonalEvent[]>([])
  const [followUps, setFollowUps] = useState<FollowUpRow[]>([])
  const [plannedVisits, setPlannedVisits] = useState<WeekVisit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [summaryErrors, setSummaryErrors] = useState<string[]>([])
  const [summary, setSummary] =
    useState<WeeklySummary>(EMPTY_SUMMARY)
  const [adding, setAdding] = useState(false)
  const [editingEvent, setEditingEvent] =
    useState<PersonalEvent | null>(null)
  const [savingEventId, setSavingEventId] = useState<string | null>(null)
  const [savingFollowUpId, setSavingFollowUpId] = useState<string | null>(null)

  // Rolling 7-day window: today plus the next six days.
  const today = istToday()
  const weekEnd = addDaysStr(today, 7)
  const days = Array.from(
    { length: 7 },
    (_, index) => addDaysStr(today, index)
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    setSummaryErrors([])

    const startStamp = `${today}T00:00:00+05:30`
    const endStamp = `${weekEnd}T00:00:00+05:30`

    const [eventResult, salesResult, visitsResult, followUpsResult] =
      await Promise.all([
        loadWeekEvents(profile.id, today),

        supabase
          .from('sales')
          .select('id,amount')
          .eq('user_id', profile.id)
          .gte('sale_date', today)
          .lt('sale_date', weekEnd),

        supabase
          .from('visits')
          .select('id,customer_id,status,planned_start,notes,customers(name)')
          .eq('user_id', profile.id)
          .gte('planned_start', startStamp)
          .lt('planned_start', endStamp),

        supabase
          .from('follow_ups')
          .select('id,customer_id,due_date,action,expected_value,status,customers(name)')
          .eq('user_id', profile.id)
          .gte('due_date', today)
          .lt('due_date', weekEnd)
          .order('due_date', { ascending: true })
      ])

    setEvents(eventResult.events)

    const errors: string[] = []

    if (eventResult.error) {
      errors.push('Personal events: ' + eventResult.error)
    }
    if (salesResult.error) {
      errors.push('Sales summary: ' + salesResult.error.message)
    }
    if (visitsResult.error) {
      errors.push('Visits summary: ' + visitsResult.error.message)
    }
    if (followUpsResult.error) {
      errors.push('Follow-ups summary: ' + followUpsResult.error.message)
    }

    const sales = (salesResult.data ?? []) as {
      id: string
      amount: number | null
    }[]

    const visits = (visitsResult.data ?? []) as unknown as WeekVisit[]
    setPlannedVisits(visits.filter(visit => visit.status === 'planned'))

    const loadedFollowUps = (followUpsResult.data ?? []) as FollowUpRow[]
    setFollowUps(loadedFollowUps)

    setSummary({
      salesAmount: sales.reduce(
        (total, sale) => total + Number(sale.amount ?? 0),
        0
      ),
      salesCount: sales.length,
      visitsCompleted: visits.filter(
        visit => visit.status === 'visited'
      ).length,
      followUpsCompleted: loadedFollowUps.filter(
        item => isCompleted(item.status)
      ).length
    })

    setSummaryErrors(errors)
    setLoading(false)
  }, [profile.id, today, weekEnd])

  useEffect(() => {
    load()
  }, [load])

  async function changeEventStatus(
    event: PersonalEvent,
    nextStatus: 'planned' | 'completed'
  ) {
    setError('')
    setSavingEventId(event.id)

    const { error: updateError } = await supabase
      .from('personal_events')
      .update({ status: nextStatus })
      .eq('id', event.id)
      .eq('user_id', profile.id)

    if (updateError) {
      setError(
        'Could not update this event: ' + updateError.message
      )
      setSavingEventId(null)
      return
    }

    await load()
    setSavingEventId(null)
  }

  async function changeFollowUpStatus(item: FollowUpRow) {
    setError('')
    setSavingFollowUpId(item.id)

    const nextStatus = isCompleted(item.status) ? 'open' : 'done'
    const { error: updateError } = await supabase
      .from('follow_ups')
      .update({ status: nextStatus })
      .eq('id', item.id)
      .eq('user_id', profile.id)

    if (updateError) {
      setError('Could not update this follow-up: ' + updateError.message)
      setSavingFollowUpId(null)
      return
    }

    await load()
    setSavingFollowUpId(null)
  }

  if (adding || editingEvent) {
    return (
      <EventForm
        profile={profile}
        defaultDate={
          editingEvent
            ? istDate(new Date(editingEvent.starts_at))
            : today
        }
        event={editingEvent}
        onCancel={() => {
          setAdding(false)
          setEditingEvent(null)
        }}
        onSaved={() => {
          setAdding(false)
          setEditingEvent(null)
          load()
        }}
      />
    )
  }

  return (
    <div className="stack">
      <button
        className="link"
        style={{ textAlign: 'left' }}
        onClick={onBack}
      >
        ← Back to Today
      </button>

      <div className="card">
        <h2>My Week</h2>
        <p className="small">
          Today + the next 6 days · India time
        </p>
        <p className="small">
          Your planner moves forward automatically each day. Follow-ups appear
          on their due date below your personal events.
        </p>
        <button
          className="primary"
          onClick={() => setAdding(true)}
        >
          + Add event
        </button>
      </div>

      <div className="card">
        <h3>Progress highlights</h3>
        <p className="small">
          {formatDayShort(today)} – {formatDayShort(days[6])}
        </p>

        {loading ? (
          <p className="small">Calculating from saved records…</p>
        ) : (
          <>
            <div className="line">
              <span>Sales recorded</span>
              <b>{inrText(summary.salesAmount)}</b>
            </div>
            <div className="line">
              <span>Sales records</span>
              <b>{summary.salesCount}</b>
            </div>
            <div className="line">
              <span>Visits completed</span>
              <b>{summary.visitsCompleted}</b>
            </div>
            <div className="line">
              <span>Follow-ups completed</span>
              <b>{summary.followUpsCompleted}</b>
            </div>
            <p className="small">
              Sales use sale date; visits use planned visit date;
              follow-ups use due date. Counts cover this rolling
              seven-day period.
            </p>
          </>
        )}
      </div>

      {error && <p className="msg">{error}</p>}

      {summaryErrors.map((message, index) => (
        <p className="msg" key={`${index}-${message}`}>
          {message}
        </p>
      ))}

      {loading ? (
        <div className="card">
          <p>Loading your events and progress…</p>
        </div>
      ) : (
        days.map(date => {
          const list = events.filter(
            event =>
              istDate(new Date(event.starts_at)) === date
          )

          // Follow-ups are displayed from follow_ups directly; no duplicate
          // personal_events rows are created. Dropped follow-ups stay hidden.
          const dayFollowUps = followUps.filter(
            item =>
              item.due_date === date &&
              !['dropped', 'cancelled'].includes(item.status.toLowerCase())
          )

          // Planned customer visits for this day (including rescheduled ones), by time
          const dayVisits = plannedVisits
            .filter(visit => istDate(new Date(visit.planned_start)) === date)
            .sort((a, b) => new Date(a.planned_start).getTime() - new Date(b.planned_start).getTime())

          const completedCount =
            list.filter(event => isCompleted(event.status)).length +
            dayFollowUps.filter(item => isCompleted(item.status)).length
          const totalCount = list.length + dayFollowUps.length + dayVisits.length
          const plannedCount = totalCount - completedCount

          const isToday = date === today

          return (
            <div
              key={date}
              className="card"
              style={
                isToday
                  ? { borderLeft: '4px solid #059669' }
                  : undefined
              }
            >
              <p>
                <b>{formatDayShort(date)}</b>{' '}
                <span className="small">
                  {isToday ? '· Today' : ''}
                </span>
              </p>

              <p className="small">
                {totalCount === 0
                  ? 'No events, visits or follow-ups planned'
                  : `${completedCount} completed · ${plannedCount} remaining`}
              </p>

              {totalCount > 0 && (
                <div
                  style={{
                    height: '6px',
                    background: '#e5e7eb',
                    borderRadius: '999px',
                    overflow: 'hidden',
                    marginBottom: '12px'
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${completedCount / totalCount * 100}%`,
                      background: '#059669',
                      borderRadius: '999px'
                    }}
                  />
                </div>
              )}

              {list.map(event => {
                const completed = isCompleted(event.status)
                const cancelled = event.status === 'cancelled'

                return (
                  <div
                    key={event.id}
                    className="line"
                    style={{
                      alignItems: 'flex-start',
                      gap: '12px'
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <b
                        style={
                          completed || cancelled
                            ? { textDecoration: 'line-through' }
                            : undefined
                        }
                      >
                        {event.title}
                      </b>

                      <br />

                      <span className="small">
                        {cap(event.category)} ·{' '}
                        {cap(event.priority)} priority ·{' '}
                        {cap(event.status)}
                        {event.location ? ' · ' + event.location : ''}
                      </span>

                      {event.amount !== null && (
                        <>
                          <br />
                          <b>{inrText(event.amount)}</b>
                        </>
                      )}

                      <br />

                      {!cancelled && (
                        <button
                          className="link"
                          disabled={savingEventId === event.id}
                          onClick={() =>
                            changeEventStatus(
                              event,
                              completed ? 'planned' : 'completed'
                            )
                          }
                        >
                          {savingEventId === event.id
                            ? 'Saving…'
                            : completed
                              ? 'Mark as planned'
                              : '✓ Mark completed'}
                        </button>
                      )}
                    </span>

                    <span
                      style={{
                        textAlign: 'right',
                        flexShrink: 0
                      }}
                    >
                      <span className="small">
                        {timeLabel(event)}
                      </span>
                      <br />
                      <button
                        className="link"
                        onClick={() => setEditingEvent(event)}
                      >
                        Edit
                      </button>
                    </span>
                  </div>
                )
              })}

              {dayVisits.map(visit => (
                <div
                  key={`visit-${visit.id}`}
                  className="line"
                  style={{
                    alignItems: 'flex-start',
                    gap: '12px',
                    borderTop: '1px solid #e5e7eb',
                    paddingTop: '10px',
                    marginTop: '10px'
                  }}
                >
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b>Visit: {visitCustomerName(visit)}</b>
                    <br />
                    <span className="small">Customer visit · To visit</span>
                    {visit.notes && (
                      <>
                        <br />
                        <span className="small">{visit.notes}</span>
                      </>
                    )}
                  </span>
                  <span style={{ textAlign: 'right', flexShrink: 0 }}>
                    <span className="small">{formatTimeIST(visit.planned_start)}</span>
                  </span>
                </div>
              ))}

              {dayFollowUps.map(item => {
                const completed = isCompleted(item.status)
                const customerName = followUpCustomerName(item)

                return (
                  <div
                    key={`follow-up-${item.id}`}
                    className="line"
                    style={{
                      alignItems: 'flex-start',
                      gap: '12px',
                      borderTop: '1px solid #e5e7eb',
                      paddingTop: '10px',
                      marginTop: '10px'
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <b style={completed ? { textDecoration: 'line-through' } : undefined}>
                        Follow-up: {customerName}
                      </b>
                      <br />
                      <span className="small">Customer follow-up · {cap(item.status)}</span>
                      <br />
                      <span>{item.action}</span>
                      {item.expected_value !== null && Number(item.expected_value) > 0 && (
                        <>
                          <br />
                          <b>{inrText(Number(item.expected_value))}</b>
                        </>
                      )}
                      <br />
                      <button
                        className="link"
                        disabled={savingFollowUpId === item.id}
                        onClick={() => changeFollowUpStatus(item)}
                      >
                        {savingFollowUpId === item.id
                          ? 'Saving…'
                          : completed
                            ? 'Mark as open'
                            : '✓ Mark follow-up completed'}
                      </button>
                    </span>
                    <span style={{ textAlign: 'right', flexShrink: 0 }}>
                      <span className="small">Due date</span>
                    </span>
                  </div>
                )
              })}
            </div>
          )
        })
      )}
    </div>
  )
}
