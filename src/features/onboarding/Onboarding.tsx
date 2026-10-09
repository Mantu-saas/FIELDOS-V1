import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Profile } from '../../types'

const LIFE_OPTIONS = [
  'Family time',
  'Cricket & sports',
  'Fitness',
  'Rest & better sleep',
  'Partner & relationships',
  'Travel',
  'Learning',
  'Music & hobbies',
  'Peace of mind',
  'Financial freedom',
]

export default function Onboarding({
  profile,
  onDone,
}: {
  profile: Profile
  onDone: (p: Profile) => void
}) {
  const [fullName, setFullName] = useState(profile.full_name ?? '')
  const [role, setRole] = useState(profile.role ?? '')
  const [city, setCity] = useState(profile.city ?? '')
  const [target, setTarget] = useState(
    profile.monthly_target ? String(profile.monthly_target) : '',
  )
  const [start, setStart] = useState(profile.work_start_time?.slice(0, 5) ?? '09:00')
  const [end, setEnd] = useState(profile.work_end_time?.slice(0, 5) ?? '18:00')
  const [home, setHome] = useState(profile.preferred_home_time?.slice(0, 5) ?? '19:00')

  const [lifePriorities, setLifePriorities] = useState<string[]>(
    profile.life_priorities ?? [],
  )
  const [lifeChallenge, setLifeChallenge] = useState(profile.life_challenge ?? '')
  const [proudIn90Days, setProudIn90Days] = useState(profile.proud_in_90_days ?? '')
  const [personalWhy, setPersonalWhy] = useState(profile.personal_why ?? '')

  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  function togglePriority(option: string) {
    setLifePriorities(current =>
      current.includes(option)
        ? current.filter(item => item !== option)
        : [...current, option],
    )
  }

  async function save() {
    setMsg('')
    const t = Number(target)

    if (!fullName.trim()) return setMsg('Please enter your name.')
    if (!role.trim()) return setMsg('Please enter your role (for example: Medical Rep).')
    if (!city.trim()) return setMsg('Please enter your city.')
    if (!Number.isFinite(t) || t <= 0) return setMsg('Enter your monthly target as a number above 0.')
    if (end <= start) return setMsg('Work end time must be after work start time.')

    setBusy(true)
    const { data, error } = await supabase
      .from('profiles')
      .update({
        full_name: fullName.trim(),
        role: role.trim(),
        city: city.trim(),
        monthly_target: t,
        work_start_time: start,
        work_end_time: end,
        preferred_home_time: home,
        onboarding_complete: true,
        life_priorities: lifePriorities,
        life_challenge: lifeChallenge.trim() || null,
        proud_in_90_days: proudIn90Days.trim() || null,
        personal_why: personalWhy.trim() || null,
      })
      .eq('id', profile.id)
      .select()
      .single()

    setBusy(false)

    if (error) {
      const missing = error.code === 'PGRST204' || error.message.includes('schema cache')
      return setMsg(
        'Could not save: ' + error.message +
        (missing ? ' (A database column may be missing or the schema cache may need refreshing.)' : ''),
      )
    }

    onDone(data as Profile)
  }

  return (
    <div className="auth">
      <div className="brand">
        <h1>swayam</h1>
        <p>Plan your work. Make room for life.</p>
      </div>

      <div className="card">
        <h2>Set up your workday</h2>
        <label>
          Your name
          <input value={fullName} onChange={e => setFullName(e.target.value)} />
        </label>
        <label>
          Your role
          <input
            placeholder="e.g. Medical Rep, FMCG Sales"
            value={role}
            onChange={e => setRole(e.target.value)}
          />
        </label>
        <label>
          City
          <input value={city} onChange={e => setCity(e.target.value)} />
        </label>
        <label>
          Monthly target (₹)
          <input
            inputMode="numeric"
            value={target}
            onChange={e => setTarget(e.target.value.replace(/[^0-9.]/g, ''))}
          />
        </label>
        <label>
          Work starts
          <input type="time" value={start} onChange={e => setStart(e.target.value)} />
        </label>
        <label>
          Work ends
          <input type="time" value={end} onChange={e => setEnd(e.target.value)} />
        </label>
        <label>
          I want to be home by
          <input type="time" value={home} onChange={e => setHome(e.target.value)} />
        </label>

        <div className="section">
          <h2>My Life, My Why</h2>
          <p>Work matters. So does the life you're working for. Share only what you're comfortable sharing.</p>

          <p><strong>What would you like more time for?</strong></p>
          <div className="life-options">
            {LIFE_OPTIONS.map(option => (
              <label key={option}>
                <input
                  type="checkbox"
                  checked={lifePriorities.includes(option)}
                  onChange={() => togglePriority(option)}
                />
                {option}
              </label>
            ))}
          </div>

          <label>
            What's getting in the way right now? (optional)
            <textarea
              rows={3}
              value={lifeChallenge}
              onChange={e => setLifeChallenge(e.target.value)}
              placeholder="e.g. Long workdays leave little time for family or cricket."
            />
          </label>

          <label>
            What would make you proud 90 days from now? (optional)
            <textarea
              rows={3}
              value={proudIn90Days}
              onChange={e => setProudIn90Days(e.target.value)}
              placeholder="e.g. Finish work on time more often and play cricket every week."
            />
          </label>

          <label>
            Why does this matter to you? (optional)
            <textarea
              rows={3}
              value={personalWhy}
              onChange={e => setPersonalWhy(e.target.value)}
              placeholder="e.g. I want to be present for my family and feel healthier."
            />
          </label>
        </div>

        {msg && <p className="msg">{msg}</p>}

        <button className="primary" disabled={busy} onClick={save}>
          {busy ? 'Saving…' : 'Save and continue'}
        </button>
      </div>
    </div>
  )
}