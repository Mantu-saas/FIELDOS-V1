// Public pre-launch survey at /survey. No login. Saves one row to survey_responses
// (insert only; visitors can never read answers back).
import { useState } from 'react'
import { supabase, isConfigured } from '../../lib/supabase'
import {
  ROLES, CHALLENGES, METHODS, WOULD_TRY, TEXT_MAX, buildSurveyRow, type SurveyForm,
} from '../../lib/survey'

const EMPTY: SurveyForm = {
  role: '', challenges: [], planning_method: '', hardest_part: '', one_fix: '',
  would_try: '', opinion: '', name: '', whatsapp: '', city: '',
}

function Choice({ options, value, onPick }: {
  options: readonly { v: string; label: string }[]; value: string; onPick: (v: string) => void
}) {
  return (
    <div className="chips">
      {options.map(o => (
        <button key={o.v} type="button" className={value === o.v ? 'chip on' : 'chip'}
          aria-pressed={value === o.v} onClick={() => onPick(o.v)}>{o.label}</button>
      ))}
    </div>
  )
}

export default function SurveyPage() {
  const [f, setF] = useState<SurveyForm>(EMPTY)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [done, setDone] = useState(false)
  const set = (patch: Partial<SurveyForm>) => setF(prev => ({ ...prev, ...patch }))
  const toggle = (v: string) => set({
    challenges: f.challenges.includes(v) ? f.challenges.filter(c => c !== v) : [...f.challenges, v],
  })

  async function submit() {
    setMsg('')
    const built = buildSurveyRow(f, new URLSearchParams(window.location.search).get('from'))
    if (!built.ok) { setMsg(built.error); return }
    if (!isConfigured) { setMsg('The survey is not set up yet. Please try again later.'); return }
    setBusy(true)
    try {
      // No .select(): visitors are not allowed to read the saved row back.
      const { error } = await supabase.from('survey_responses').insert(built.row)
      if (error) setMsg('Could not save your answers. Please try again.')
      else { setDone(true); window.scrollTo(0, 0) }
    } catch {
      setMsg('Network problem. Please check your internet and try again.')
    }
    setBusy(false)
  }

  if (done) {
    return (
      <div className="auth">
        <div className="brand"><h1>swayam</h1></div>
        <div className="card">
          <h2>Thank you! 🙏</h2>
          <p>Your answers are saved. They will directly shape what Swayam becomes.</p>
          {(f.would_try === 'yes' || f.would_try === 'maybe') && f.whatsapp.trim()
            ? <p>We will message you on WhatsApp when your free access is ready.</p>
            : <p>You can close this page now.</p>}
        </div>
      </div>
    )
  }

  return (
    <div className="auth">
      <div className="brand">
        <h1>swayam</h1>
        <p>Plan the day. Hit the target. Get home on time.</p>
      </div>

      <div className="card">
        <h2>What is Swayam?</h2>
        <p>A free phone app made for medical reps, built by a medical rep. It helps you:</p>
        <ul className="survey-list">
          <li>plan which doctors to visit each day, with Google Maps</li>
          <li>remember every follow-up</li>
          <li>see your monthly target and what is left</li>
          <li>protect your home time and keep stress in check</li>
        </ul>
        <p className="small">It is <b>yours</b>. Your company and your manager cannot see it.</p>
        <p className="small">Before launch, I want to hear your real problems. 2 minutes. No login.</p>
      </div>

      <div className="card">
        <label>1. Your role</label>
        <Choice options={ROLES} value={f.role} onPick={v => set({ role: v })} />

        <label>2. Your biggest daily challenges <span className="small">(tick any)</span></label>
        <div className="chips">
          {CHALLENGES.map(o => {
            const on = f.challenges.includes(o.v)
            return <button key={o.v} type="button" className={on ? 'chip on' : 'chip'}
              aria-pressed={on} onClick={() => toggle(o.v)}>{on ? '✓ ' : ''}{o.label}</button>
          })}
        </div>

        <label>3. How do you plan your day now?</label>
        <Choice options={METHODS} value={f.planning_method} onPick={v => set({ planning_method: v })} />

        <label>4. In your own words: what is the hardest part of your job?
          <textarea rows={3} maxLength={TEXT_MAX} value={f.hardest_part}
            onChange={e => set({ hardest_part: e.target.value })} placeholder="Any language is fine" />
        </label>

        <label>5. If one app could fix ONE thing for you, what should it be?
          <textarea rows={3} maxLength={TEXT_MAX} value={f.one_fix}
            onChange={e => set({ one_fix: e.target.value })} />
        </label>

        <label>6. Would you try Swayam free for 2 weeks?</label>
        <Choice options={WOULD_TRY} value={f.would_try} onPick={v => set({ would_try: v })} />

        <label>7. Honest opinion: would you use an app like this? Why or why not?
          <textarea rows={3} maxLength={TEXT_MAX} value={f.opinion}
            onChange={e => set({ opinion: e.target.value })} placeholder={'Even "I don\'t need it" helps'} />
        </label>
      </div>

      <div className="card">
        <h2>Want free early access?</h2>
        <p className="small">Optional. Used only to contact you about Swayam. Never shared.</p>
        <label>Your name<input value={f.name} maxLength={80} onChange={e => set({ name: e.target.value })} /></label>
        <label>WhatsApp number<input type="tel" inputMode="numeric" autoComplete="tel" value={f.whatsapp}
          onChange={e => set({ whatsapp: e.target.value })} placeholder="10-digit mobile" /></label>
        <label>City / HQ<input value={f.city} maxLength={80} onChange={e => set({ city: e.target.value })} /></label>

        {msg && <p className="msg" role="alert">{msg}</p>}
        <button className="primary" disabled={busy} onClick={submit}>{busy ? 'Saving…' : 'Submit'}</button>
      </div>
    </div>
  )
}
