import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { todayIST } from '../../lib/format'
import type { Profile } from '../../types'
import EndOfDay from './EndOfDay'

// Short, general suggestion from simple rules. Not medical advice.
export function suggestion(energy: number, stress: number, sleep: number | null): string {
  if (sleep !== null && sleep < 6 && energy <= 5) return 'Short sleep and low energy: keep today to your top 2 visits, group them close together, and call the rest.'
  if (energy <= 4) return 'Low energy: do your highest-value visits first, take a proper break after lunch, and call instead of travelling where you can.'
  if (stress >= 8) return 'High stress: pick one next action and finish it. Take 5 minutes away from your phone and drink some water before the next visit.'
  if (sleep !== null && sleep < 6) return 'You slept little: avoid extra evening work today and protect your home time.'
  if (energy >= 7 && stress <= 4) return 'You are in good shape today. A good day to chase your biggest opportunity first.'
  return 'Steady day. Keep a 10-minute break between visits and head home on time.'
}

export default function HealthPage({ profile }: { profile: Profile }) {
  const [sub, setSub] = useState<'checkin' | 'eod'>('checkin')
  const [energy, setEnergy] = useState(5)
  const [stress, setStress] = useState(5)
  const [sleep, setSleep] = useState('')
  const [steps, setSteps] = useState('')
  const [travel, setTravel] = useState('')
  const [notes, setNotes] = useState('')
  const [msg, setMsg] = useState('')
  const [ok, setOk] = useState(false)
  const [busy, setBusy] = useState(false)
  const today = todayIST()

  useEffect(() => {
    supabase.from('health_checkins').select('*').eq('checkin_date', today).maybeSingle().then(({ data }) => {
      if (!data) return
      setEnergy(data.energy ?? 5); setStress(data.stress ?? 5)
      setSleep(data.sleep_hours == null ? '' : String(data.sleep_hours))
      setSteps(data.steps == null ? '' : String(data.steps))
      setTravel(data.travel_hours == null ? '' : String(data.travel_hours))
      setNotes(data.notes ?? '')
    })
  }, [today])

  async function save() {
    setMsg(''); setOk(false)
    const sl = sleep === '' ? null : Number(sleep), st = steps === '' ? null : Number(steps), tr = travel === '' ? null : Number(travel)
    if (sl !== null && !(sl >= 0 && sl <= 24)) return setMsg('Sleep hours must be between 0 and 24.')
    if (tr !== null && !(tr >= 0 && tr <= 24)) return setMsg('Travel hours must be between 0 and 24.')
    if (st !== null && !(Number.isInteger(st) && st >= 0)) return setMsg('Steps must be a whole number.')
    setBusy(true)
    const { error } = await supabase.from('health_checkins').upsert({
      user_id: profile.id, checkin_date: today, energy, stress, sleep_hours: sl, steps: st, travel_hours: tr,
      home_time: profile.preferred_home_time, notes: notes.trim() || null
    }, { onConflict: 'user_id,checkin_date' })
    setBusy(false)
    if (error) return setMsg('Could not save: ' + error.message)
    setOk(true)
  }

  return (
    <div className="stack">
      <div className="seg">
        <button className={sub === 'checkin' ? 'on' : ''} onClick={() => setSub('checkin')}>Check-in</button>
        <button className={sub === 'eod' ? 'on' : ''} onClick={() => setSub('eod')}>End of day</button>
      </div>
      {sub === 'eod' ? <EndOfDay profile={profile} /> : (
        <div className="card">
          <h2>Today's check-in</h2>
          <label>Energy: {energy} / 10<input className="range" type="range" min={1} max={10} value={energy} onChange={e => setEnergy(Number(e.target.value))} /></label>
          <label>Stress: {stress} / 10<input className="range" type="range" min={1} max={10} value={stress} onChange={e => setStress(Number(e.target.value))} /></label>
          <label>Hours slept last night<input inputMode="decimal" value={sleep} onChange={e => setSleep(e.target.value.replace(/[^0-9.]/g, ''))} /></label>
          <label>Steps today (optional, from your phone)<input inputMode="numeric" value={steps} onChange={e => setSteps(e.target.value.replace(/[^0-9]/g, ''))} /></label>
          <label>Travel hours today (optional)<input inputMode="decimal" value={travel} onChange={e => setTravel(e.target.value.replace(/[^0-9.]/g, ''))} /></label>
          <label>Note (optional)<textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} /></label>
          <div className="tip"><b>Suggestion:</b> {suggestion(energy, stress, sleep === '' ? null : Number(sleep))}</div>
          <p className="small">General wellbeing tips only, not medical advice.</p>
          {msg && <p className="msg">{msg}</p>}
          {ok && <p style={{ color: '#059669', fontWeight: 700 }}>Saved.</p>}
          <button className="primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save check-in'}</button>
        </div>
      )}
    </div>
  )
}
