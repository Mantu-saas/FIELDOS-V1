import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { inr, todayIST, timeIST } from '../../lib/format'
import {
  istDate,
  loadWeekEvents,
  weekStartMonday
} from '../../lib/personalEvents'
import type { PersonalEvent } from '../../lib/personalEvents'
import type { Customer, VisitRow } from '../../types'
import VisitDetail from '../visits/VisitDetail'
import FollowUpsView from './FollowUpsView'

const DEFAULT_VISIT_MINUTES = 15
const EVENT_BUFFER_MINUTES = 60

const SELECT =
  'id,customer_id,planned_start,status,sale_amount,lead_amount,collection_amount,notes,next_action,follow_up_date,customers(name,address,phone,priority)'

const LABEL: Record<string, string> = {
  planned: 'To visit',
  visited: 'Visited',
  unavailable: 'Unavailable',
  cancelled: 'Cancelled',
  rescheduled: 'Rescheduled'
}

type RouteVisit = VisitRow & {
  customers:
    | {
        name: string
        address: string | null
        phone: string | null
        priority?: number | null
      }
    | null
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`

  const hours = Math.floor(minutes / 60)
  const remaining = minutes % 60

  return remaining === 0
    ? `${hours} hr`
    : `${hours} hr ${remaining} min`
}

function formatEventTime(value: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(new Date(value))
}

function getWarnings(
  visit: RouteVisit,
  events: PersonalEvent[]
): string[] {
  if (!visit.planned_start || visit.status !== 'planned') return []

  const start = new Date(visit.planned_start).getTime()
  if (!Number.isFinite(start)) return []

  const end = start + DEFAULT_VISIT_MINUTES * 60_000
  const warnings: string[] = []

  for (const event of events) {
    if (event.status === 'cancelled') continue

    if (event.all_day) {
      warnings.push(
        `All-day personal event today: ${event.title}. Check your plan before confirming this visit.`
      )
      continue
    }

    const eventStart = new Date(event.starts_at).getTime()
    if (!Number.isFinite(eventStart)) continue

    const eventEnd = event.ends_at
      ? new Date(event.ends_at).getTime()
      : eventStart

    if (!Number.isFinite(eventEnd)) continue

    if (end > eventStart && start < eventEnd) {
      warnings.push(
        `Possible schedule conflict with "${event.title}" at ${formatEventTime(event.starts_at)}.`
      )
      continue
    }

    const minutesBeforeEvent = (eventStart - end) / 60_000

    if (
      eventStart >= end &&
      minutesBeforeEvent <= EVENT_BUFFER_MINUTES
    ) {
      warnings.push(
        `"${event.title}" starts at ${formatEventTime(event.starts_at)}. Allow time for travel and preparation.`
      )
    }
  }

  return [...new Set(warnings)]
}

export default function RoutePage({ userId }: { userId: string }) {
  const [sub, setSub] = useState<'route' | 'followups'>('route')
  const [visits, setVisits] = useState<RouteVisit[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [events, setEvents] = useState<PersonalEvent[]>([])
  const [eventsError, setEventsError] = useState('')
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [custId, setCustId] = useState('')
  const [time, setTime] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [msg, setMsg] = useState('')

  const today = todayIST()

  const load = useCallback(async () => {
    setLoading(true)
    setMsg('')
    setEventsError('')

    const [v, c, personal] = await Promise.all([
      supabase
        .from('visits')
        .select(SELECT)
        .eq('user_id', userId)
        .gte('planned_start', `${today}T00:00:00+05:30`)
        .lte('planned_start', `${today}T23:59:59+05:30`)
        .order('planned_start', { ascending: true }),

      supabase
        .from('customers')
        .select('*')
        .eq('active', true)
        .order('name'),

      loadWeekEvents(userId, weekStartMonday(today))
    ])

    if (v.error) {
      setMsg("Could not load today's route: " + v.error.message)
    } else {
      setVisits((v.data ?? []) as unknown as RouteVisit[])
    }

    if (c.error) {
      setMsg(previous =>
        previous || 'Could not load customers: ' + c.error.message
      )
    } else {
      setCustomers((c.data ?? []) as Customer[])
    }

    if (personal.error) {
      setEvents([])
      setEventsError(
        'Personal events could not be checked. Please check MY WEEK before relying on this schedule.'
      )
    } else {
      setEvents(
        personal.events.filter(
          event =>
            istDate(new Date(event.starts_at)) === today &&
            event.status !== 'cancelled'
        )
      )
    }

    setLoading(false)
  }, [today, userId])

  useEffect(() => {
    void load()
  }, [load])

  async function addStop() {
    setMsg('')

    if (!custId) {
      setMsg('Choose a customer.')
      return
    }

    if (
      visits.some(
        visit =>
          visit.customer_id === custId &&
          visit.status === 'planned'
      )
    ) {
      setMsg("This customer is already on today's route.")
      return
    }

    const plannedStart = time
      ? `${today}T${time}:00+05:30`
      : new Date().toISOString()

    const { error } = await supabase.from('visits').insert({
      user_id: userId,
      customer_id: custId,
      planned_start: plannedStart,
      status: 'planned'
    })

    if (error) {
      setMsg('Could not add stop: ' + error.message)
      return
    }

    setCustId('')
    setTime('')
    setAdding(false)
    await load()
  }

  async function removeStop(id: string) {
    if (!window.confirm("Remove this stop from today's route?")) return

    const { error } = await supabase
      .from('visits')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)

    if (error) {
      setMsg('Could not remove: ' + error.message)
      return
    }

    await load()
  }

  const selectedVisit = visits.find(visit => visit.id === selected)

  if (selectedVisit) {
    return (
      <VisitDetail
        userId={userId}
        visit={selectedVisit}
        onBack={() => setSelected(null)}
        onSaved={() => {
          setSelected(null)
          void load()
        }}
      />
    )
  }

  const pending = visits
    .filter(
      visit =>
        visit.status === 'planned' &&
        visit.customers?.address
    )
    .slice(0, 9)

  const routeUrl =
    pending.length === 0
      ? ''
      : 'https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=' +
        encodeURIComponent(
          pending[pending.length - 1].customers!.address!
        ) +
        (pending.length > 1
          ? '&waypoints=' +
            encodeURIComponent(
              pending
                .slice(0, -1)
                .map(visit => visit.customers!.address!)
                .join('|')
            )
          : '')

  function getGap(index: number): string | null {
    const current = visits[index]

    if (
      !current ||
      current.status !== 'planned' ||
      !current.planned_start
    ) {
      return null
    }

    const currentStart = new Date(current.planned_start).getTime()
    if (!Number.isFinite(currentStart)) return null

    const next = visits
      .slice(index + 1)
      .find(
        visit =>
          visit.status === 'planned' &&
          visit.planned_start &&
          Number.isFinite(new Date(visit.planned_start).getTime())
      )

    if (!next?.planned_start) return null

    const nextStart = new Date(next.planned_start).getTime()
    const expectedEnd =
      currentStart + DEFAULT_VISIT_MINUTES * 60_000

    const gap = Math.round((nextStart - expectedEnd) / 60_000)

    if (gap < 0) {
      return `Schedule overlap: the next appointment starts ${formatMinutes(Math.abs(gap))} before this expected visit ends.`
    }

    return `${formatMinutes(gap)} until the next appointment. Travel time is unknown.`
  }

  return (
    <div className="stack">
      <div className="seg">
        <button
          className={sub === 'route' ? 'on' : ''}
          onClick={() => setSub('route')}
        >
          Today's route
        </button>
        <button
          className={sub === 'followups' ? 'on' : ''}
          onClick={() => setSub('followups')}
        >
          Follow-ups
        </button>
      </div>

      {sub === 'followups' ? (
        <FollowUpsView userId={userId} />
      ) : (
        <>
          <div className="card">
            <h2>Visit planning</h2>
            <p className="small">
              Expected visit duration: {DEFAULT_VISIT_MINUTES} minutes.
              This is a planning default, not a measured duration.
            </p>
            <p className="small">
              Time gaps do not include estimated travel time. Saved
              addresses are shown as entered; they are not verified
              distances.
            </p>
          </div>

          {eventsError && (
            <div className="card">
              <p className="msg">{eventsError}</p>
            </div>
          )}

          {adding ? (
            <div className="card">
              <h2>Add a stop</h2>

              <label>
                Customer
                <select
                  value={custId}
                  onChange={event => setCustId(event.target.value)}
                >
                  <option value="">Choose…</option>
                  {customers.map(customer => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Planned time (optional)
                <input
                  type="time"
                  value={time}
                  onChange={event => setTime(event.target.value)}
                />
              </label>

              {customers.length === 0 && (
                <p className="small">
                  Add customers first in SALES → Customers.
                </p>
              )}

              {msg && <p className="msg">{msg}</p>}

              <button className="primary" onClick={addStop}>
                Add to today
              </button>
              <button
                className="link"
                onClick={() => {
                  setAdding(false)
                  setMsg('')
                }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              className="primary"
              onClick={() => {
                setAdding(true)
                setMsg('')
              }}
            >
              + Add stop
            </button>
          )}

          {!adding && msg && <p className="msg">{msg}</p>}

          {routeUrl && !adding && (
            <a
              className="btn"
              style={{ flex: 'none' }}
              target="_blank"
              rel="noopener noreferrer"
              href={routeUrl}
            >
              Navigate remaining stops in Google Maps
            </a>
          )}

          {loading ? (
            <div className="card">
              <p>Loading…</p>
            </div>
          ) : visits.length === 0 ? (
            <div className="card">
              <p>No stops for today yet. Tap "Add stop".</p>
              <p className="small">
                Stops are ordered by planned time. Automatic route
                ordering is not enabled.
              </p>
            </div>
          ) : (
            visits.map((visit, index) => {
              const warnings = getWarnings(visit, events)
              const gap = getGap(index)
              const address = visit.customers?.address?.trim()

              return (
                <div
                  key={visit.id}
                  className="item"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setSelected(visit.id)}
                >
                  <span style={{ minWidth: 0 }}>
                    <b>
                      {index + 1}. {visit.customers?.name ?? 'Customer'}
                    </b>
                    <br />

                    <span className="small">
                      {timeIST(visit.planned_start)} ·{' '}
                      {LABEL[visit.status] ?? visit.status}
                      {visit.sale_amount > 0
                        ? ' · Sale ' + inr(Number(visit.sale_amount))
                        : ''}
                    </span>

                    {visit.status === 'planned' && (
                      <>
                        <br />
                        <span className="small">
                          Priority:{' '}
                          {visit.customers?.priority ?? 'Not available'}
                        </span>
                        <br />
                        <span className="small">
                          Expected visit: {DEFAULT_VISIT_MINUTES} minutes
                        </span>
                        <br />
                        <span className="small">
                          Saved area/address: {address || 'Not provided'}
                        </span>

                        {gap && (
                          <>
                            <br />
                            <span className="small">{gap}</span>
                          </>
                        )}

                        {warnings.map((warning, warningIndex) => (
                          <div
                            key={`${visit.id}-warning-${warningIndex}`}
                            className="msg"
                            style={{ marginTop: 6 }}
                          >
                            ⚠ {warning}
                          </div>
                        ))}
                      </>
                    )}
                  </span>

                  {visit.status === 'planned' && (
                    <button
                      className="link small-btn"
                      onClick={event => {
                        event.stopPropagation()
                        void removeStop(visit.id)
                      }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              )
            })
          )}
        </>
      )}
    </div>
  )
}
