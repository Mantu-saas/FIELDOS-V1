import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Profile } from '../../types'

export default function Onboarding({ profile, onDone }: { profile: Profile; onDone: (p: Profile) => void }) {
  const [fullName, setFullName] = useState(profile.full_name ?? '')
  const [role, setRole] = useState(profile.role ?? '')
  const [city, setCity] = useState(profile.city ?? '')
  const [target, setTarget] = useState(profile.monthly_target ? String(profile.monthly_target) : '')
  const [start, setStart] = useState('09:00')
  const [end, setEnd] = useState('18:00')
  const [home, setHome] = useState('19:00')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function save() {
    setMsg('')
    const t = Number(target)
    if (!fullName.trim()) return setMsg('Please enter your name.')
    if (!role.trim()) return setMsg('Please enter your role (for example: Medical Rep).')
    if (!city.trim()) return setMsg('Please enter your city.')
    if (!Number.isFinite(t) || t <= 0) return setMsg('Enter your monthly target as a number above 0.')
    if (end <= start) return setMsg('Work end time must be after work start time.')
    setBusy(true)
    const { data, error } = await supabase.from('profiles').update({
      full_name: fullName.trim(), role: role.trim(), city: city.trim(), monthly_target: t,
      work_start_time: start, work_end_time: end, preferred_home_time: home, onboarding_complete: true
    }).eq('id', profile.id).select().single()
    setBusy(false)
    if (error) {
      const missing = error.code === 'PGRST204' || error.message.includes('schema cache')
      return setMsg(
        'Could not save: ' + error.message +
        (missing ? ' (A database column is missing. Send this exact message to your builder.)' : '')
      )
    }
    onDone(data as Profile)
  }

  return (
    <div className="auth">
      <div className="brand"><h1>swayam</h1><p>Let's set up your day. Takes one minute.</p></div>
      <div className="card">
        <label>Your name<input value={fullName} onChange={e => setFullName(e.target.value)} /></label>
        <label>Your role<input placeholder="e.g. Medical Rep, FMCG Sales" value={role} onChange={e => setRole(e.target.value)} /></label>
        <label>City<input value={city} onChange={e => setCity(e.target.value)} /></label>
        <label>Monthly target (₹)<input inputMode="numeric" value={target} onChange={e => setTarget(e.target.value.replace(/[^0-9.]/g, ''))} /></label>
        <label>Work starts<input type="time" value={start} onChange={e => setStart(e.target.value)} /></label>
        <label>Work ends<input type="time" value={end} onChange={e => setEnd(e.target.value)} /></label>
        <label>I want to be home by<input type="time" value={home} onChange={e => setHome(e.target.value)} /></label>
        {msg && <p className="msg">{msg}</p>}
        <button className="primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save and continue'}</button>
      </div>
    </div>
  )
}
