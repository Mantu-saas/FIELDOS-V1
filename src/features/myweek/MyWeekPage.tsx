import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Profile, VisitRow } from '../../types'
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
import { activeSales, activeSalesTotal } from '../../lib/rules'
import { dayClashes, dayTimeline, isPlannerVisit } from '../../lib/weekPlan'
import EventForm from './EventForm'
import { visitNoteLines } from '../../lib/visitHistory'
import ChangeVisitTime from '../visits/ChangeVisitTime'

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
  name: string
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
  const [weekVisits, setWeekVisits] = useState<WeekVisit[]>([])
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
          .select('id,amount,status')
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
      status: string | null
    }[]

    const visits = ((visitsResult.data ?? []) as unknown as WeekVisit[])
      .map(visit => ({ ...visit, name: visitCustomerName(visit) }))
    // Planned visits and visits already done (shown as completed); cancelled,
    // unavailable and rescheduled visits are not part of the plan for that day
    setWeekVisits(visits.filter(isPlannerVisit))

    const loadedFollowUps = (followUpsResult.data ?? []) as FollowUpRow[]
    setFollowUps(loadedFollowUps)

    setSummary({
      // Cancelled sales stay in history but never count (shared rule in lib/rules.ts)
      salesAmount: activeSalesTotal(sales),
      salesCount: activeSales(sales).length,
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
    nextStatus: 'planned' | 'completed' | 'cancelled'
  ) {
    if (
      nextStatus === 'cancelled' &&
      !window.confirm(`Cancel "${event.title}"? It stays in your week, crossed out.`)
    ) {
      return
    }

    setError('')
    setSavingEventId(event.id)

    // Ask for the changed row back, so a change is only accepted when it is confirmed
    const { data, error: updateError } = await supabase
      .from('personal_events')
      .update({ status: nextStatus })
      .eq('id', event.id)
      .eq('user_id', profile.id)
      .select('id,status')

    if (updateError) {
      setError(
        'Could not update this event: ' + updateError.message
      )
      setSavingEventId(null)
      return
    }

    if (!data || data.length !== 1 || data[0].status !== nextStatus) {
      setError('The change to this event was not confirmed. Nothing was changed. Please try again.')
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
          Your planner moves forward automatically each day. Each day lists
          events and visits in time order; follow-ups due that day come last.
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
          const dayEvents = events.filter(
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

          const dayVisits = weekVisits.filter(
            visit => istDate(new Date(visit.planned_start)) === date
          )

          // One list in time order (lib/weekPlan.ts) and any clashes between open items
          const timeline = dayTimeline<PersonalEvent, WeekVisit, FollowUpRow>(dayEvents, dayVisits, dayFollowUps)
          const clashes = dayClashes(dayEvents, dayVisits, formatTimeIST)

          // Cancelled events are shown crossed out but are not counted as work
          const countedEvents = dayEvents.filter(event => event.status !== 'cancelled')
          const completedCount =
            countedEvents.filter(event => isCompleted(event.status)).length +
            dayFollowUps.filter(item => isCompleted(item.status)).length +
            dayVisits.filter(visit => visit.status === 'visited').length
          const totalCount = countedEvents.length + dayFollowUps.length + dayVisits.length
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

              {clashes.map(warning => (
                <p className="msg" key={warning}>⚠ {warning}</p>
              ))}

              {timeline.map((entry, index) => {
                const rowStyle = {
                  alignItems: 'flex-start',
                  gap: '12px',
                  ...(index > 0
                    ? { borderTop: '1px solid #e5e7eb', paddingTop: '10px', marginTop: '10px' }
                    : {})
                }

                if (entry.kind === 'event') {
                  const event = entry.item
                  const completed = isCompleted(event.status)
                  const cancelled = event.status === 'cancelled'

                  return (
                    <div key={entry.key} className="line" style={rowStyle}>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <b
                          className={cancelled ? 'cancelled-text' : undefined}
                          style={
                            completed
                              ? { textDecoration: 'line-through' }
                              : undefined
                          }
                        >
                          {event.title}
                        </b>
                        {cancelled && (
                          <>
                            {' '}
                            <span className="cancelled-label">CANCELLED</span>
                          </>
                        )}

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

                        {cancelled ? (
                          <button
                            className="link"
                            disabled={savingEventId === event.id}
                            onClick={() => changeEventStatus(event, 'planned')}
                          >
                            {savingEventId === event.id ? 'Saving…' : 'Restore event'}
                          </button>
                        ) : (
                          <>
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
                            {!completed && (
                              <button
                                className="link"
                                disabled={savingEventId === event.id}
                                onClick={() => changeEventStatus(event, 'cancelled')}
                              >
                                Cancel event
                              </button>
                            )}
                          </>
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
                        {!cancelled && (
                          <button
                            className="link"
                            onClick={() => setEditingEvent(event)}
                          >
                            Edit
                          </button>
                        )}
                      </span>
                    </div>
                  )
                }

                if (entry.kind === 'visit') {
                  const visit = entry.item
                  const done = visit.status === 'visited'

                  // R2: a planned doctor visit can be moved to another day or time right here,
                  // with the same "Change time or date" used in ROUTE (moves the same visit, never copies it)
                  const asVisitRow: VisitRow = {
                    id: visit.id,
                    customer_id: visit.customer_id,
                    planned_start: visit.planned_start,
                    status: visit.status,
                    sale_amount: 0,
                    lead_amount: 0,
                    collection_amount: 0,
                    notes: visit.notes,
                    next_action: null,
                    follow_up_date: null,
                    customers: { name: visit.name, address: null, phone: null }
                  }

                  return (
                    <div key={entry.key}>
                    <div className="line" style={rowStyle}>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <b style={done ? { textDecoration: 'line-through' } : undefined}>
                          Visit: {visit.name}
                        </b>
                        <br />
                        <span className="small">
                          Customer visit · {done ? 'Visited' : 'To visit'}
                        </span>
                        {/* C21: rescheduling history in plain words, then the salesperson's note */}
                        {visitNoteLines(visit.notes).map((line, i) => (
                          <span key={i}>
                            <br />
                            <span className="small">{line}</span>
                          </span>
                        ))}
                      </span>
                      <span style={{ textAlign: 'right', flexShrink: 0 }}>
                        <span className="small">{formatTimeIST(visit.planned_start)}</span>
                      </span>
                    </div>
                    {visit.status === 'planned' && (
                      <ChangeVisitTime userId={profile.id} visit={asVisitRow} onSaved={() => { void load() }} />
                    )}
                    </div>
                  )
                }

                const item = entry.item
                const completed = isCompleted(item.status)
                const customerName = followUpCustomerName(item)

                return (
                  <div key={entry.key} className="line" style={rowStyle}>
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
                      <span className="small">Due this day</span>
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
