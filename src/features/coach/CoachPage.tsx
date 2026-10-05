import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { todayIST, monthStart } from '../../lib/format'
import { addDays } from '../../lib/scoring'
import type { Customer, Profile, VisitRow } from '../../types'
import { answer, QUESTIONS, type Answer, type Ctx, type QId } from './coachEngine'

type Hist = { id: string; question: string; answer: string | null; created_at: string }
const nowMinIST = () => {
  const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()).split(':').map(Number)
  return h * 60 + m
}

export default function CoachPage({ profile }: { profile: Profile }) {
  const [busy, setBusy] = useState(false)
  const [asked, setAsked] = useState('')
  const [res, setRes] = useState<Answer | null>(null)
  const [msg, setMsg] = useState('')
  const [hist, setHist] = useState<Hist[]>([])

  const loadHist = useCallback(async () => {
    const h = await supabase.from('coach_events').select('id,question,answer,created_at').order('created_at', { ascending: false }).limit(5)
    if (!h.error) setHist((h.data ?? []) as Hist[])
  }, [])
  useEffect(() => { loadHist() }, [loadHist])

  async function ask(id: QId, label: string) {
    setMsg(''); setBusy(true); setAsked(label); setRes(null)
    const today = todayIST()
    const since = addDays(today, -90)
    const [c, s, v, f, tv, hl] = await Promise.all([
      supabase.from('customers').select('*').eq('active', true),
      supabase.from('sales').select('customer_id,amount,sale_date,status').gte('sale_date', since < monthStart(today) ? since : monthStart(today)),
      supabase.from('visits').select('customer_id,planned_start,status').neq('status', 'planned'),
      supabase.from('follow_ups').select('customer_id,due_date,action,expected_value,customers(name)').eq('status', 'open'),
      supabase.from('visits').select('id,customer_id,planned_start,status,sale_amount,lead_amount,collection_amount,notes,next_action,follow_up_date,customers(name,address,phone)')
        .gte('planned_start', today + 'T00:00:00+05:30').lte('planned_start', today + 'T23:59:59+05:30').order('planned_start'),
      supabase.from('health_checkins').select('energy,stress').order('checkin_date', { ascending: false }).limit(1)
    ])
    const failed = [c, s, v, f, tv].find(x => x.error)
    if (failed?.error) { setBusy(false); return setMsg('Could not read your data: ' + failed.error.message) }
    const lastVisit: Record<string, string> = {}
    for (const x of (v.data ?? []) as { customer_id: string; planned_start: string | null }[]) {
      const d = x.planned_start ? x.planned_start.slice(0, 10) : null
      if (d && (!lastVisit[x.customer_id] || d > lastVisit[x.customer_id])) lastVisit[x.customer_id] = d
    }
    const ctx: Ctx = {
      profile, today, nowMin: nowMinIST(),
      customers: (c.data ?? []) as Customer[],
      sales: (s.data ?? []) as Ctx['sales'],
      lastVisit,
      followUps: ((f.data ?? []) as unknown as { customer_id: string; due_date: string; action: string; expected_value: number; customers: { name: string } | null }[])
        .map(x => ({ customer_id: x.customer_id, due_date: x.due_date, action: x.action, expected_value: Number(x.expected_value), name: x.customers?.name ?? 'Customer' })),
      todayVisits: (tv.data ?? []) as unknown as VisitRow[],
      health: (hl.data?.[0] as Ctx['health']) ?? null
    }
    const a = answer(id, ctx)
    setRes(a); setBusy(false)
    const text = [...a.lines, 'Why: ' + a.why, 'Next: ' + a.next].join('\n')
    await supabase.from('coach_events').insert({
      user_id: profile.id, question: label, answer: text,
      context_json: { customers: ctx.customers.length, openFollowUps: ctx.followUps.length, stopsToday: ctx.todayVisits.length }
    })
    loadHist()
  }

  return (
    <div className="stack">
      <div className="card">
        <h2>Coach</h2>
        <p className="small">Tap a question. Answers use only your own recorded customers, sales, visits and follow-ups. No guesses, no promises.</p>
        <div className="stack">
          {QUESTIONS.map(q => { const label = q.label(profile); return (
            <button key={q.id} className="item" disabled={busy} onClick={() => ask(q.id, label)}>{label}</button>
          ) })}
        </div>
      </div>
      {busy && <div className="card"><p>Thinking…</p></div>}
      {msg && <p className="msg">{msg}</p>}
      {res && (
        <div className="card coach">
          <p className="small">{asked}</p>
          {res.lines.map((l, i) => <p key={i}>{l}</p>)}
          <p><b>Why:</b> {res.why}</p>
          <p><b>Next action:</b> {res.next}</p>
          {res.assumption && <p className="small">Assumption: {res.assumption}</p>}
        </div>
      )}
      {hist.length > 0 && (
        <div className="card">
          <h2>Recent questions</h2>
          {hist.map(h => (
            <details key={h.id}><summary>{h.question}</summary><p className="small" style={{ whiteSpace: 'pre-line' }}>{h.answer}</p></details>
          ))}
        </div>
      )}
    </div>
  )
}
