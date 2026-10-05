import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { inr, todayIST } from '../../lib/format'
import type { Profile } from '../../types'

export default function EndOfDay({ profile }: { profile: Profile }) {
  const today = todayIST()
  const [visited, setVisited] = useState(0)
  const [stops, setStops] = useState(0)
  const [salesToday, setSalesToday] = useState(0)
  const [home, setHome] = useState('')
  const [helped, setHelped] = useState('')
  const [planMin, setPlanMin] = useState('')
  const [friction, setFriction] = useState('')
  const [comment, setComment] = useState('')
  const [health, setHealth] = useState<{ energy: number | null; stress: number | null; travel_hours: number | null } | null>(null)
  const [msg, setMsg] = useState('')
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    async function go() {
      const v = await supabase.from('visits').select('status').gte('planned_start', today + 'T00:00:00+05:30').lte('planned_start', today + 'T23:59:59+05:30')
      const rows = (v.data ?? []) as { status: string }[]
      setStops(rows.length); setVisited(rows.filter(r => r.status === 'visited').length)
      const s = await supabase.from('sales').select('amount,status').eq('sale_date', today)
      setSalesToday(((s.data ?? []) as { amount: number; status: string }[]).filter(r => r.status !== 'cancelled').reduce((a, r) => a + Number(r.amount), 0))
      const h = await supabase.from('health_checkins').select('energy,stress,travel_hours').eq('checkin_date', today).maybeSingle()
      if (h.data) setHealth(h.data as typeof health)
      const f = await supabase.from('feedback').select('*').eq('feedback_date', today).maybeSingle()
      if (f.data) {
        setHome(f.data.actual_home_time ? String(f.data.actual_home_time).slice(0, 5) : '')
        setHelped(f.data.helped == null ? '' : f.data.helped ? 'yes' : 'no')
        setPlanMin(f.data.planning_minutes == null ? '' : String(f.data.planning_minutes))
        setFriction(f.data.friction ?? ''); setComment(f.data.comment ?? '')
      }
    }
    go()
  }, [today])

  async function save() {
    setMsg(''); setDone(false)
    const pm = planMin === '' ? null : Number(planMin)
    if (pm !== null && !(Number.isInteger(pm) && pm >= 0)) return setMsg('Planning minutes must be a whole number.')
    setBusy(true)
    const { error } = await supabase.from('feedback').upsert({
      user_id: profile.id, feedback_date: today, helped: helped === '' ? null : helped === 'yes',
      planning_minutes: pm, sales_amount: salesToday, visits_completed: visited,
      travel_hours: health?.travel_hours ?? null, planned_home_time: profile.preferred_home_time,
      actual_home_time: home || null, energy: health?.energy ?? null, stress: health?.stress ?? null,
      friction: friction.trim() || null, comment: comment.trim() || null
    }, { onConflict: 'user_id,feedback_date' })
    setBusy(false)
    if (error) return setMsg('Could not save: ' + error.message)
    setDone(true)
  }

  return (
    <div className="stack">
      <div className="card">
        <h2>Today in numbers</h2>
        <p>Stops on route: <b>{stops}</b> · Visited: <b>{visited}</b></p>
        <p>Sales today: <b>{inr(salesToday)}</b></p>
        <p className="small">Planned home time: {profile.preferred_home_time?.slice(0, 5)}</p>
      </div>
      <div className="card">
        <h2>Close your day</h2>
        <label>When did you actually get home?<input type="time" value={home} onChange={e => setHome(e.target.value)} /></label>
        <label>Did FieldOS help today?
          <select value={helped} onChange={e => setHelped(e.target.value)}><option value="">Choose…</option><option value="yes">Yes</option><option value="no">No</option></select>
        </label>
        <label>Minutes spent planning today<input inputMode="numeric" value={planMin} onChange={e => setPlanMin(e.target.value.replace(/[^0-9]/g, ''))} /></label>
        <label>What was frustrating or slow?<input value={friction} onChange={e => setFriction(e.target.value)} /></label>
        <label>Any other comment<textarea rows={3} value={comment} onChange={e => setComment(e.target.value)} /></label>
        {msg && <p className="msg">{msg}</p>}
        {done && <div className="tip"><b>Day closed.</b> Put the phone down, leave work thoughts for tomorrow, and spend the evening on yourself and your family.</div>}
        <button className="primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save and close the day'}</button>
      </div>
    </div>
  )
}
