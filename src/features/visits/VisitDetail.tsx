import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { inr, todayIST } from '../../lib/format'
import type { VisitRow } from '../../types'

type Pre = {
  potential: number; priority: number
  lastSale: { amount: number; sale_date: string } | null
  lastVisit: { status: string; notes: string | null; next_action: string | null } | null
  followUps: { id: string; action: string; due_date: string; expected_value: number }[]
}

const num = (s: string) => s.replace(/[^0-9.]/g, '')

export default function VisitDetail({ userId, visit, onBack, onSaved }: { userId: string; visit: VisitRow; onBack: () => void; onSaved: () => void }) {
  const [pre, setPre] = useState<Pre | null>(null)
  const [status, setStatus] = useState('visited')
  const [sale, setSale] = useState('')
  const [lead, setLead] = useState('')
  const [coll, setColl] = useState('')
  const [notes, setNotes] = useState('')
  const [nextAction, setNextAction] = useState('')
  const [fuDate, setFuDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const today = todayIST()
  const done = visit.status !== 'planned'

  useEffect(() => {
    let off = false
    async function go() {
      const c = await supabase.from('customers').select('potential_amount,priority').eq('id', visit.customer_id).single()
      const s = await supabase.from('sales').select('amount,sale_date').eq('customer_id', visit.customer_id).neq('status', 'cancelled').order('sale_date', { ascending: false }).limit(1)
      const v = await supabase.from('visits').select('status,notes,next_action').eq('customer_id', visit.customer_id).neq('status', 'planned').order('created_at', { ascending: false }).limit(1)
      const f = await supabase.from('follow_ups').select('id,action,due_date,expected_value').eq('customer_id', visit.customer_id).eq('status', 'open').order('due_date')
      if (off) return
      setPre({
        potential: Number(c.data?.potential_amount ?? 0), priority: Number(c.data?.priority ?? 3),
        lastSale: (s.data?.[0] as Pre['lastSale']) ?? null,
        lastVisit: (v.data?.[0] as Pre['lastVisit']) ?? null,
        followUps: (f.data ?? []) as Pre['followUps']
      })
    }
    go()
    return () => { off = true }
  }, [visit.customer_id])

  async function save() {
    setMsg('')
    const saleN = sale === '' ? 0 : Number(sale), leadN = lead === '' ? 0 : Number(lead), collN = coll === '' ? 0 : Number(coll)
    if (![saleN, leadN, collN].every(n => Number.isFinite(n) && n >= 0)) return setMsg('Amounts must be numbers (0 or more).')
    if (status !== 'visited' && (saleN > 0 || collN > 0)) return setMsg('Sale or collection can only be recorded when the status is "Visited".')
    if (fuDate && fuDate < today) return setMsg('Follow-up date cannot be in the past.')
    if (status === 'rescheduled' && !fuDate) return setMsg('Choose the new date in "Follow-up date" for a rescheduled visit.')
    setBusy(true)
    const now = new Date().toISOString()
    const u = await supabase.from('visits').update({
      status, sale_amount: saleN, lead_amount: leadN, collection_amount: collN,
      notes: notes.trim() || null, next_action: nextAction.trim() || null, follow_up_date: fuDate || null,
      actual_start: now, actual_end: now
    }).eq('id', visit.id)
    if (u.error) { setBusy(false); return setMsg('Could not save the visit: ' + u.error.message) }

    const problems: string[] = []
    if (saleN > 0) {
      const r = await supabase.from('sales').insert({ user_id: userId, customer_id: visit.customer_id, sale_date: today, amount: saleN, notes: 'From visit' })
      if (r.error) problems.push('the sale (' + r.error.message + ')')
    }
    if (fuDate) {
      const r = await supabase.from('follow_ups').insert({
        user_id: userId, customer_id: visit.customer_id, due_date: fuDate,
        action: nextAction.trim() || 'Follow up', expected_value: leadN, notes: notes.trim() || null
      })
      if (r.error) problems.push('the follow-up (' + r.error.message + ')')
    }
    setBusy(false)
    if (problems.length) return setMsg('Visit saved, but these did not save: ' + problems.join(' and ') + '. Add them manually in SALES or Follow-ups. Do not save this visit again.')
    onSaved()
  }

  const name = visit.customers?.name ?? 'Customer'
  return (
    <div className="stack">
      <div className="card">
        <button className="link" style={{ textAlign: 'left' }} onClick={onBack}>← Back to route</button>
        <h2>{name}</h2>
        <div className="row">
          {visit.customers?.address && <a className="btn" target="_blank" rel="noopener noreferrer" href={'https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=' + encodeURIComponent(visit.customers.address)}>Navigate</a>}
          {visit.customers?.phone && <a className="btn" href={'tel:' + visit.customers.phone}>Call</a>}
        </div>
      </div>

      <div className="card">
        <h2>Before you go</h2>
        {!pre ? <p>Loading…</p> : <>
          <p><b>Why this customer:</b> priority {pre.priority} (1 = highest), potential {inr(pre.potential)} per month.</p>
          <p><b>Last sale:</b> {pre.lastSale ? `${inr(Number(pre.lastSale.amount))} on ${pre.lastSale.sale_date}` : 'None recorded yet'}</p>
          <p><b>Last visit:</b> {pre.lastVisit ? `${pre.lastVisit.status}${pre.lastVisit.notes ? ' - ' + pre.lastVisit.notes : ''}` : 'No visit recorded yet'}</p>
          {pre.followUps.length > 0
            ? <p><b>Open follow-ups:</b> {pre.followUps.map(f => `${f.action} (due ${f.due_date}${f.expected_value > 0 ? ', ' + inr(Number(f.expected_value)) : ''})`).join('; ')}</p>
            : <p><b>Open follow-ups:</b> none</p>}
          <p><b>Suggested action:</b> {pre.followUps[0] ? pre.followUps[0].action : pre.lastVisit?.next_action ? pre.lastVisit.next_action : 'No earlier next step on record. Decide your objective for this visit.'}</p>
        </>}
      </div>

      {done ? (
        <div className="card">
          <h2>Recorded</h2>
          <p><b>Result:</b> {visit.status}</p>
          {visit.sale_amount > 0 && <p><b>Sale:</b> {inr(Number(visit.sale_amount))}</p>}
          {visit.lead_amount > 0 && <p><b>Opportunity:</b> {inr(Number(visit.lead_amount))}</p>}
          {visit.collection_amount > 0 && <p><b>Collection:</b> {inr(Number(visit.collection_amount))}</p>}
          {visit.notes && <p><b>Note:</b> {visit.notes}</p>}
          {visit.next_action && <p><b>Next action:</b> {visit.next_action}</p>}
          {visit.follow_up_date && <p><b>Follow-up date:</b> {visit.follow_up_date}</p>}
          <p className="small">A recorded visit cannot be edited here. If something is wrong, fix the sale in SALES or the follow-up in Follow-ups.</p>
        </div>
      ) : (
        <div className="card">
          <h2>Record visit</h2>
          <label>Result
            <select value={status} onChange={e => setStatus(e.target.value)}>
              <option value="visited">Visited</option><option value="unavailable">Customer unavailable</option>
              <option value="cancelled">Cancelled</option><option value="rescheduled">Rescheduled</option>
            </select>
          </label>
          {status === 'visited' && <>
            <label>Sale amount (₹)<input inputMode="numeric" value={sale} onChange={e => setSale(num(e.target.value))} /></label>
            <label>Collection amount (₹, optional)<input inputMode="numeric" value={coll} onChange={e => setColl(num(e.target.value))} /></label>
          </>}
          <label>Opportunity / lead amount (₹, optional)<input inputMode="numeric" value={lead} onChange={e => setLead(num(e.target.value))} /></label>
          <label>Note (you can use your keyboard's microphone)<textarea rows={4} value={notes} onChange={e => setNotes(e.target.value)} /></label>
          <label>Next action<input placeholder="e.g. Send quote, call about payment" value={nextAction} onChange={e => setNextAction(e.target.value)} /></label>
          <label>Follow-up date<input type="date" min={today} value={fuDate} onChange={e => setFuDate(e.target.value)} /></label>
          {msg && <p className="msg">{msg}</p>}
          <button className="primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save visit'}</button>
        </div>
      )}
    </div>
  )
}
