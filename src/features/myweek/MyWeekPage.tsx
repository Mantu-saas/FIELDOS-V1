import { useCallback, useEffect, useState } from 'react'
import type { Profile } from '../../types'
import {
  DAY_NAMES, istDate, istToday, weekStartMonday, weekDates, formatTimeIST, formatDayShort, inrText,
  loadWeekEvents, type PersonalEvent
} from '../../lib/personalEvents'
import EventForm from './EventForm'

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function timeLabel(e: PersonalEvent): string {
  if (e.all_day) return 'All day'
  const start = formatTimeIST(e.starts_at)
  if (!e.ends_at) return start
  const sameDay = istDate(new Date(e.ends_at)) === istDate(new Date(e.starts_at))
  return sameDay ? `${start} – ${formatTimeIST(e.ends_at)}` : `${start} – ${formatDayShort(istDate(new Date(e.ends_at)))} ${formatTimeIST(e.ends_at)}`
}

export default function MyWeekPage({ profile, onBack }: { profile: Profile; onBack: () => void }) {
  const [events, setEvents] = useState<PersonalEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)
  const today = istToday()
  const monday = weekStartMonday(today)
  const days = weekDates(monday)

  const load = useCallback(async () => {
    const r = await loadWeekEvents(profile.id, monday)
    setError(r.error ? 'Could not load your week: ' + r.error : '')
    setEvents(r.events)
    setLoading(false)
  }, [profile.id, monday])
  useEffect(() => { load() }, [load])

  if (adding) {
    return <EventForm profile={profile} defaultDate={today} onCancel={() => setAdding(false)} onSaved={() => { setAdding(false); setLoading(true); load() }} />
  }

  return (
    <div className="stack">
      <button className="link" style={{ textAlign: 'left' }} onClick={onBack}>← Back to Today</button>
      <div className="card">
        <h2>My Week</h2>
        <p className="small">{formatDayShort(days[0])} – {formatDayShort(days[6])} (India time)</p>
        <button className="primary" onClick={() => setAdding(true)}>+ Add event</button>
      </div>
      {error && <p className="msg">{error}</p>}
      {loading ? <div className="card"><p>Loading…</p></div> : days.map((date, i) => {
        const list = events.filter(e => istDate(new Date(e.starts_at)) === date)
        const isToday = date === today
        return (
          <div key={date} className="card" style={isToday ? { borderLeft: '4px solid #059669' } : undefined}>
            <p><b>{DAY_NAMES[i]}</b> <span className="small">{formatDayShort(date)}{isToday ? ' · Today' : ''}</span></p>
            {list.length === 0 ? <p className="small">No events</p> : list.map(e => (
              <div key={e.id} className="line" style={{ alignItems: 'flex-start' }}>
                <span>
                  <b style={e.status === 'cancelled' ? { textDecoration: 'line-through' } : undefined}>{e.title}</b><br />
                  <span className="small">
                    {cap(e.category)} · {cap(e.priority)} priority · {cap(e.status)}
                    {e.location ? ' · ' + e.location : ''}
                  </span>
                </span>
                <span style={{ textAlign: 'right' }}>
                  <span className="small">{timeLabel(e)}</span>
                  {e.amount !== null && <><br /><b>{inrText(e.amount)}</b></>}
                </span>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
