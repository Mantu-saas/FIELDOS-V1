import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { inr, todayIST } from '../../lib/format'
import type { Customer, FollowUpRow } from '../../types'

export default function FollowUpsView({ userId }: { userId: string }) {
  const [rows, setRows] = useState<FollowUpRow[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [custId, setCustId] = useState('')
  const [due, setDue] = useState(todayIST())
  const [action, setAction] = useState('')
  const [value, setValue] = useState('')
  const [msg, setMsg] = useState('')
  const today = todayIST()

  const load = useCallback(async () => {
    const r = await supabase.from('follow_ups').select('id,customer_id,due_date,action,expected_value,status,customers(name)').eq('status', 'open').order('due_date')
    if (r.error) setMsg('Could not load follow-ups: ' + r.error.message)
    else setRows((r.data ?? []) as unknown as FollowUpRow[])
    const c = await supabase.from('customers').select('*').eq('active', true).order('name')
    if (!c.error) setCustomers((c.data ?? []) as Customer[])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  async function setStatus(id: string, status: 'done' | 'dropped') {
    const { error } = await supabase.from('follow_ups').update({ status }).eq('id', id)
    if (error) return setMsg('Could not update: ' + error.message)
    load()
  }

  async function add() {
    setMsg('')
    if (!custId) return setMsg('Choose a customer.')
    if (!action.trim()) return setMsg('Write what needs to be done.')
    const v = value === '' ? 0 : Number(value)
    if (!Number.isFinite(v) || v < 0) return setMsg('Expected value must be a number.')
    const { error } = await supabase.from('follow_ups').insert({ user_id: userId, customer_id: custId, due_date: due, action: action.trim(), expected_value: v })
    if (error) return setMsg('Could not save: ' + error.message)
    setCustId(''); setAction(''); setValue(''); setAdding(false); load()
  }

  const overdue = rows.filter(r => r.due_date < today).length
  return (
    <div className="stack">
      {adding ? (
        <div className="card">
          <h2>Add follow-up</h2>
          <label>Customer
            <select value={custId} onChange={e => setCustId(e.target.value)}>
              <option value="">Choose…</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label>What to do<input value={action} onChange={e => setAction(e.target.value)} /></label>
          <label>Due date<input type="date" value={due} onChange={e => setDue(e.target.value)} /></label>
          <label>Expected value (₹, optional)<input inputMode="numeric" value={value} onChange={e => setValue(e.target.value.replace(/[^0-9.]/g, ''))} /></label>
          {msg && <p className="msg">{msg}</p>}
          <button className="primary" onClick={add}>Save follow-up</button>
          <button className="link" onClick={() => { setAdding(false); setMsg('') }}>Cancel</button>
        </div>
      ) : <button className="primary" onClick={() => { setAdding(true); setMsg('') }}>+ Add follow-up</button>}
      {!adding && msg && <p className="msg">{msg}</p>}
      {!adding && overdue > 0 && <p className="msg">{overdue} overdue</p>}
      {loading ? <div className="card"><p>Loading…</p></div> :
        rows.length === 0 ? <div className="card"><p>No open follow-ups.</p></div> :
        rows.map(r => (
          <div key={r.id} className="card">
            <p><b>{r.customers?.name ?? 'Customer'}</b></p>
            <p>{r.action}</p>
            <p className={r.due_date < today ? 'msg' : 'small'}>Due {r.due_date}{r.due_date < today ? ' (overdue)' : r.due_date === today ? ' (today)' : ''}{r.expected_value > 0 ? ' · ' + inr(Number(r.expected_value)) : ''}</p>
            <div className="row">
              <button className="primary" onClick={() => setStatus(r.id, 'done')}>Done</button>
              <button className="link" onClick={() => setStatus(r.id, 'dropped')}>Drop</button>
            </div>
          </div>
        ))}
    </div>
  )
}
