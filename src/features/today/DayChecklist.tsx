import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { todayIST } from '../../lib/format'
import { addDaysStr, istStamp } from '../../lib/personalEvents'
import { istClockOf, istDateOf, buildPlannedStart } from '../../lib/visitTime'
import { buildDayList, progress } from '../../lib/dayList'
import type { DayItem, DLEvent, DLFollowUp } from '../../lib/dayList'
import { parseQuickAdd, quickReminder } from '../../lib/quickAdd'
import { clock } from '../../lib/reminderRules'
import TimeSelect from '../../components/TimeSelect'
import ChangeVisitTime from '../visits/ChangeVisitTime'
import type { VisitRow } from '../../types'

// R3: one checklist for the day, from what is already saved (visits, follow-ups, personal
// events) plus Quick add. Every item can be ticked or moved here; nothing is entered twice.
type EventRow = DLEvent & { reminder_minutes: number | null }

const nameOf = (c: unknown): string => ((Array.isArray(c) ? c[0] : c) as { name?: string } | null)?.name || 'Customer'

function nowMinutesIST(): number {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date())
  return Number(p.find(x => x.type === 'hour')?.value) * 60 + Number(p.find(x => x.type === 'minute')?.value)
}

export default function DayChecklist({ userId, onOpenRoute }: { userId: string; onOpenRoute?: () => void }) {
  const today = todayIST()
  const [day, setDay] = useState(today)
  const [visits, setVisits] = useState<VisitRow[]>([])
  const [followUps, setFollowUps] = useState<DLFollowUp[]>([])
  const [events, setEvents] = useState<EventRow[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)   // "kind:id"
  const [quick, setQuick] = useState('')
  const [quickMsg, setQuickMsg] = useState('')
  const [quickBusy, setQuickBusy] = useState(false)

  const load = useCallback(async () => {
    const from = `${day}T00:00:00+05:30`
    const to = `${addDaysStr(day, 1)}T00:00:00+05:30`
    const [v, f, e] = await Promise.all([
      supabase.from('visits').select('*, customers(name,address,phone)').eq('user_id', userId).gte('planned_start', from).lt('planned_start', to),
      supabase.from('follow_ups').select('id,customer_id,due_date,action,expected_value,status,customers(name)').eq('user_id', userId)
        .lte('due_date', day).or(`status.eq.open,and(status.eq.done,due_date.eq.${day})`),
      supabase.from('personal_events').select('id,title,category,starts_at,ends_at,all_day,status,reminder_minutes').eq('user_id', userId).gte('starts_at', from).lt('starts_at', to)
    ])
    if (v.error || f.error || e.error) {
      setError('Could not load your checklist: ' + (v.error?.message ?? f.error?.message ?? e.error?.message))
      setLoaded(true)
      return
    }
    setError('')
    setVisits((v.data ?? []) as unknown as VisitRow[])
    setFollowUps((f.data ?? []).map(r => ({ id: r.id, customer_id: r.customer_id, due_date: r.due_date, action: r.action, expected_value: Number(r.expected_value), status: r.status, name: nameOf(r.customers) })))
    setEvents((e.data ?? []) as EventRow[])
    setLoaded(true)
  }, [day, userId])

  useEffect(() => { void load() }, [load])

  // A "Done" or "+30 min" tapped on a phone reminder changes data: show it straight away
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const onMessage = (m: MessageEvent) => { if ((m.data as { type?: string })?.type?.startsWith('swayam-reminder')) void load() }
    navigator.serviceWorker.addEventListener('message', onMessage)
    const onVisible = () => { if (document.visibilityState === 'visible') void load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      navigator.serviceWorker.removeEventListener('message', onMessage)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])

  const items = buildDayList({
    day, today, nowMinutes: nowMinutesIST(),
    visits: visits.map(v => ({ id: v.id, customer_id: v.customer_id, status: v.status, planned_start: v.planned_start, name: v.customers?.name ?? 'Customer' })),
    followUps, events
  })
  const { done, total } = progress(items)

  async function quickAdd() {
    if (quickBusy) return
    const p = parseQuickAdd(quick)
    if (!p.title) return setQuickMsg('Write what to do, for example "stockist 2pm" or "collect payment City Clinic tomorrow 11am".')
    const date = p.day === 'tomorrow' ? addDaysStr(today, 1) : today
    setQuickBusy(true)
    const { error: err } = await supabase.from('personal_events').insert({
      user_id: userId, title: p.title, category: p.category,
      starts_at: istStamp(date, p.time ?? '00:00'), ends_at: null, all_day: !p.time,
      priority: 'normal', reminder_minutes: quickReminder(p.time), status: 'planned'
    })
    setQuickBusy(false)
    if (err) return setQuickMsg('Could not save: ' + err.message)
    const [h, m] = (p.time ?? '00:00').split(':').map(Number)
    setQuickMsg(`Saved: ${p.title}, ${p.day}${p.time ? ` at ${clock(h * 60 + m)}. Reminder at ${clock(h * 60 + m - 15 < 0 ? 0 : h * 60 + m - 15)}.` : ' (any time, no alarm). Tap Change to add a time.'}`)
    setQuick('')
    if (date !== day) setDay(date)
    else await load()
  }

  async function toggleEvent(it: DayItem) {
    setBusyId(it.id)
    const next = it.done ? 'planned' : 'completed'
    const r = await supabase.from('personal_events').update({ status: next }).eq('id', it.id).eq('user_id', userId).select('id')
    setBusyId(null)
    if (r.error || r.data?.length !== 1) return setError('Not saved. Please try again.')
    await load()
  }

  async function toggleFollowUp(it: DayItem) {
    setBusyId(it.id)
    const next = it.done ? 'open' : 'done'
    const r = await supabase.from('follow_ups').update({ status: next }).eq('id', it.id).eq('user_id', userId).select('id')
    setBusyId(null)
    if (r.error || r.data?.length !== 1) return setError('Not saved. Please try again.')
    await load()
  }

  const timeText = (it: DayItem) => it.minutes === null ? 'Any time' : clock(it.minutes)

  return (
    <div className="card">
      <div className="checklist-head">
        <h2>{day === today ? "Today's checklist" : day === addDaysStr(today, 1) ? "Tomorrow's checklist" : day}</h2>
        {total > 0 && <span className="small"><b>{done}/{total}</b> done</span>}
      </div>
      <div className="seg">
        <button className={day === today ? 'on' : ''} onClick={() => { setDay(today); setEditing(null) }}>Today</button>
        <button className={day === addDaysStr(today, 1) ? 'on' : ''} onClick={() => { setDay(addDaysStr(today, 1)); setEditing(null) }}>Tomorrow</button>
      </div>

      <div className="quick-add">
        <input
          aria-label="Quick add"
          placeholder='Quick add: "stockist 2pm", "book ticket kal"'
          value={quick}
          onChange={e => { setQuick(e.target.value); setQuickMsg('') }}
          onKeyDown={e => { if (e.key === 'Enter') void quickAdd() }}
        />
        <button className="primary" disabled={quickBusy || !quick.trim()} onClick={() => void quickAdd()}>{quickBusy ? '…' : 'Add'}</button>
      </div>
      {quickMsg && <p className="small">{quickMsg}</p>}

      {error && <p className="msg">{error}</p>}
      {!loaded ? <p>Loading…</p> : items.length === 0 ? (
        <p className="small">Nothing for this day yet. Use Quick add above, or plan doctors in ROUTE.</p>
      ) : (
        <ul className="checklist">
          {items.map(it => {
            const key = `${it.kind}:${it.id}`
            const visit = it.kind === 'visit' ? visits.find(v => v.id === it.id) : undefined
            const event = it.kind === 'event' ? events.find(e => e.id === it.id) : undefined
            const fu = it.kind === 'follow_up' ? followUps.find(f => f.id === it.id) : undefined
            return (
              <li key={key} className={it.done ? 'done' : it.late ? 'late' : ''}>
                <div className="check-row">
                  {it.kind === 'visit' ? (
                    <span className="tick" aria-hidden>{it.done ? '✓' : '•'}</span>
                  ) : (
                    <button
                      className="tick"
                      aria-label={it.done ? `Mark ${it.title} not done` : `Mark ${it.title} done`}
                      disabled={busyId === it.id}
                      onClick={() => void (it.kind === 'event' ? toggleEvent(it) : toggleFollowUp(it))}
                    >{it.done ? '✓' : ''}</button>
                  )}
                  <div className="check-text">
                    <span className="small">{timeText(it)}{it.late ? ' · late' : ''}</span>
                    <b>{it.title}</b>
                    <span className="small">{it.detail}</span>
                  </div>
                </div>
                {!it.done && editing !== key && (
                  <div className="check-actions">
                    {it.kind === 'visit' && day <= today && onOpenRoute && <button className="link" onClick={onOpenRoute}>Record in ROUTE</button>}
                    <button className="link" onClick={() => setEditing(key)}>Change</button>
                  </div>
                )}
                {editing === key && visit && (
                  <ChangeVisitTime userId={userId} visit={visit} startOpen onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); void load() }} />
                )}
                {editing === key && event && (
                  <EditEventTime userId={userId} event={event} onDone={() => { setEditing(null); void load() }} />
                )}
                {editing === key && fu && (
                  <EditDueDate userId={userId} item={fu} onDone={() => { setEditing(null); void load() }} />
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// Move a personal event / quick-add task: new date and time (empty time = any time that day)
function EditEventTime({ userId, event, onDone }: { userId: string; event: EventRow; onDone: () => void }) {
  const today = todayIST()
  const [date, setDate] = useState(istDateOf(event.starts_at) ?? today)
  const [time, setTime] = useState(event.all_day ? '' : istClockOf(event.starts_at) ?? '')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function save() {
    if (date < today) return setMsg('The date cannot be in the past.')
    const start = time ? buildPlannedStart(date, time) : istStamp(date, '00:00')
    if (!start) return setMsg('Choose a valid time.')
    const shift = Date.parse(start) - Date.parse(event.starts_at)
    const endsAt = event.ends_at && time && !event.all_day ? new Date(Date.parse(event.ends_at) + shift).toISOString() : null
    setBusy(true)
    const r = await supabase.from('personal_events').update({
      starts_at: start, ends_at: endsAt, all_day: !time,
      // a task that gets a time gets a reminder, unless it already had its own setting
      reminder_minutes: time && event.all_day && event.reminder_minutes === null ? 15 : event.reminder_minutes
    }).eq('id', event.id).eq('user_id', userId).eq('status', 'planned').select('id')
    setBusy(false)
    if (r.error) return setMsg('Could not save: ' + r.error.message)
    if (r.data?.length !== 1) return setMsg('Not saved. It may have changed. Please check.')
    onDone()
  }

  return (
    <div className="check-edit">
      <label>Date<input type="date" min={today} value={date} disabled={busy} onChange={e => setDate(e.target.value)} /></label>
      <TimeSelect label="Time (leave empty for any time)" value={time} disabled={busy} onChange={setTime} />
      {time && <button className="link" onClick={() => setTime('')}>No time (any time that day)</button>}
      {msg && <p className="msg">{msg}</p>}
      <div className="row">
        <button className="primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</button>
        <button className="link" disabled={busy} onClick={onDone}>Cancel</button>
      </div>
    </div>
  )
}

function EditDueDate({ userId, item, onDone }: { userId: string; item: DLFollowUp; onDone: () => void }) {
  const today = todayIST()
  const [date, setDate] = useState(item.due_date < today ? today : item.due_date)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function save() {
    if (date < today) return setMsg('The date cannot be in the past.')
    setBusy(true)
    const r = await supabase.from('follow_ups').update({ due_date: date }).eq('id', item.id).eq('user_id', userId).eq('status', 'open').select('id')
    setBusy(false)
    if (r.error) return setMsg('Could not save: ' + r.error.message)
    if (r.data?.length !== 1) return setMsg('Not saved. It may have changed. Please check.')
    onDone()
  }

  return (
    <div className="check-edit">
      <label>New due date<input type="date" min={today} value={date} disabled={busy} onChange={e => setDate(e.target.value)} /></label>
      {msg && <p className="msg">{msg}</p>}
      <div className="row">
        <button className="primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</button>
        <button className="link" disabled={busy} onClick={onDone}>Cancel</button>
      </div>
    </div>
  )
}
