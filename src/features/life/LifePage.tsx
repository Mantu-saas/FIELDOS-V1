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

export default function LifePage({
  profile,
}: {
  profile: Profile
}) {
  const [priorities, setPriorities] = useState<string[]>(
    profile.life_priorities ?? [],
  )
  const [challenge, setChallenge] = useState(
    profile.life_challenge ?? '',
  )
  const [proud, setProud] = useState(
    profile.proud_in_90_days ?? '',
  )
  const [why, setWhy] = useState(profile.personal_why ?? '')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  function togglePriority(option: string) {
    setPriorities(current =>
      current.includes(option)
        ? current.filter(item => item !== option)
        : [...current, option],
    )
  }

  async function save() {
    setBusy(true)
    setMessage('')

    const { error } = await supabase
      .from('profiles')
      .update({
        life_priorities: priorities,
        life_challenge: challenge.trim() || null,
        proud_in_90_days: proud.trim() || null,
        personal_why: why.trim() || null,
      })
      .eq('id', profile.id)

    setBusy(false)

    if (error) {
      setMessage(`Could not save: ${error.message}`)
      return
    }

    setMessage('Your My Life, My Why details are saved.')
  }

  return (
    <div className="stack">
      <div className="card">
        <h2>My Life, My Why</h2>
        <p>
          Your success should make room for the life you want,
          not take it away.
        </p>

        <h3>What do you want more time for?</h3>
        <p className="small">Choose all that matter to you.</p>

        <div className="stack">
          {LIFE_OPTIONS.map(option => (
            <label key={option}>
              <input
                type="checkbox"
                checked={priorities.includes(option)}
                onChange={() => togglePriority(option)}
              />
              {' '}{option}
            </label>
          ))}
        </div>

        <label>
          What's getting in the way right now?
          <textarea
            value={challenge}
            onChange={event => setChallenge(event.target.value)}
            placeholder="For example, long travel days or missing family time"
            rows={3}
          />
        </label>

        <label>
          What would make you proud 90 days from now?
          <textarea
            value={proud}
            onChange={event => setProud(event.target.value)}
            placeholder="Describe the progress that would matter to you"
            rows={3}
          />
        </label>

        <label>
          Why does this matter to you?
          <textarea
            value={why}
            onChange={event => setWhy(event.target.value)}
            placeholder="Your personal reason"
            rows={3}
          />
        </label>


                {message && (
          <p style={{ color: message.startsWith('Could not save:') ? '#b91c1c' : '#059669', fontWeight: 500 }}>
            {message}
          </p>
        )}

        <button
          className="primary"
          disabled={busy}
          onClick={save}
        >
          {busy ? 'Saving…' : 'Save my life priorities'}
        </button>
      </div>

      {/* R1: plain privacy note for pilot users */}
      <div className="card">
        <h2>Your data</h2>
        <p className="small">
          Swayam keeps the customers, visits, sales, follow-ups, events and check-ins you enter, so it can plan your day.
        </p>
        <p className="small">
          Your account can see only your own records. Swayam does not track your location and does not report to your
          company or manager.
        </p>
        <p className="small">
          The Swayam team can open the database only to fix problems. To delete your account and all your data, ask the
          person who set up your account.
        </p>
      </div>
    </div>
  )
}