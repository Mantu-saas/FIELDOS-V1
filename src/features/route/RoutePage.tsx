import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { inr, todayIST, timeIST } from '../../lib/format'
import type { Customer, VisitRow } from '../../types'
import VisitDetail from '../visits/VisitDetail'
import FollowUpsView from './FollowUpsView'

const SELECT = 'id,customer_id,planned_start,status,sale_amount,lead_amount,collection_amount,notes,next_action,follow_up_date,customers(name,address,phone)'
const LABEL: Record<string, string> = { planned: 'To visit', visited: 'Visited', unavailable: 'Unavailable', cancelled: 'Cancelled', rescheduled: 'Rescheduled' }

export default function RoutePage({ userId }: { userId: string }) {
  const [sub, setSub] = useState<'route' | 'followups'>('route')
  const [visits, setVisits] = useState<VisitRow[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [custId, setCustId] = useState('')
  const [time, setTime] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const today = todayIST()

  const load = useCallback(async () => {
    const v = await supabase.from('visits').select(SELECT)
      .gte('planned_start', today + 'T00:00:00+05:30').lte('planned_start', today + 'T23:59:59+05:30')
      .order('planned_start', { ascending: true })
    if (v.error) setMsg('Could not load today\'s route: ' + v.error.message)
    else setVisits((v.data ?? []) as unknown as VisitRow[])
    const c = await supabase.from('customers').select('*').eq('active', true).order('name')
    if (!c.error) setCustomers((c.data ?? []) as Customer[])
    setLoading(false)
  }, [today])
  useEffect(() => { load() }, [load])

  async function addStop() {
    setMsg('')
    if (!custId) return setMsg('Choose a customer.')
    if (visits.some(v => v.customer_id === custId && v.status === 'planned')) return setMsg('This customer is already on today\'s route.')
    const start = time ? `${today}T${time}:00+05:30` : new Date().toISOString()
    const { error } = await supabase.from('visits').insert({ user_id: userId, customer_id: custId, planned_start: start, status: 'planned' })
    if (error) return setMsg('Could not add stop: ' + error.message)
    setCustId(''); setTime(''); setAdding(false); load()
  }

  async function removeStop(id: string) {
    if (!window.confirm('Remove this stop from today\'s route?')) return
    const { error } = await supabase.from('visits').delete().eq('id', id)
    if (error) return setMsg('Could not remove: ' + error.message)
    load()
  }

  const sel = visits.find(v => v.id === selected)
  if (sel) return <VisitDetail userId={userId} visit={sel} onBack={() => setSelected(null)} onSaved={() => { setSelected(null); load() }} />

  // One Google Maps link for the remaining stops (Maps allows about 9 stops per link)
  const pending = visits.filter(v => v.status === 'planned' && v.customers?.address).slice(0, 9)
  const routeUrl = pending.length === 0 ? '' :
    'https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=' +
    encodeURIComponent(pending[pending.length - 1].customers!.address!) +
    (pending.length > 1 ? '&waypoints=' + encodeURIComponent(pending.slice(0, -1).map(p => p.customers!.address!).join('|')) : '')

  return (
    <div className="stack">
      <div className="seg">
        <button className={sub === 'route' ? 'on' : ''} onClick={() => setSub('route')}>Today's route</button>
        <button className={sub === 'followups' ? 'on' : ''} onClick={() => setSub('followups')}>Follow-ups</button>
      </div>
      {sub === 'followups' ? <FollowUpsView userId={userId} /> : (
        <>
          {adding ? (
            <div className="card">
              <h2>Add a stop</h2>
              <label>Customer
                <select value={custId} onChange={e => setCustId(e.target.value)}>
                  <option value="">Choose…</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label>Planned time (optional)<input type="time" value={time} onChange={e => setTime(e.target.value)} /></label>
              {customers.length === 0 && <p className="small">Add customers first in SALES → Customers.</p>}
              {msg && <p className="msg">{msg}</p>}
              <button className="primary" onClick={addStop}>Add to today</button>
              <button className="link" onClick={() => { setAdding(false); setMsg('') }}>Cancel</button>
            </div>
          ) : (
            <button className="primary" onClick={() => { setAdding(true); setMsg('') }}>+ Add stop</button>
          )}
          {!adding && msg && <p className="msg">{msg}</p>}
          {routeUrl && !adding && <a className="btn" style={{ flex: 'none' }} target="_blank" rel="noopener noreferrer" href={routeUrl}>Navigate remaining stops in Google Maps</a>}
          {loading ? <div className="card"><p>Loading…</p></div> :
            visits.length === 0 ? <div className="card"><p>No stops for today yet. Tap "Add stop".</p><p className="small">Stops are ordered by planned time. Automatic route ordering comes with the planner in a later milestone.</p></div> :
            visits.map((v, i) => (
              <div key={v.id} className="item" style={{ cursor: 'pointer' }} onClick={() => setSelected(v.id)}>
                <span><b>{i + 1}. {v.customers?.name ?? 'Customer'}</b><br />
                  <span className="small">{timeIST(v.planned_start)} · {LABEL[v.status] ?? v.status}{v.sale_amount > 0 ? ' · Sale ' + inr(Number(v.sale_amount)) : ''}</span></span>
                {v.status === 'planned' && <button className="link small-btn" onClick={e => { e.stopPropagation(); removeStop(v.id) }}>Remove</button>}
              </div>
            ))}
        </>
      )}
    </div>
  )
}
