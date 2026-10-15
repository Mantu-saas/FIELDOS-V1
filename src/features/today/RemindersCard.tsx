import { useEffect, useState } from 'react'
import { disablePush, enablePush, pushState, sendTestPush } from '../../lib/pushReminders'
import type { PushState } from '../../lib/pushReminders'

// R3: turn phone reminders on for this phone. Shown big until they are on, then as one small line.
export default function RemindersCard() {
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => { void pushState().then(setState) }, [])

  async function turnOn() {
    setBusy(true)
    setMsg('')
    const problem = await enablePush()
    const s = await pushState()
    setState(s)
    if (problem) setMsg(problem)
    else setMsg(await sendTestPush())
    setBusy(false)
  }

  async function test() {
    setBusy(true)
    setMsg(await sendTestPush())
    setBusy(false)
  }

  async function turnOff() {
    setBusy(true)
    await disablePush().catch(() => undefined)
    setState(await pushState())
    setMsg('Reminders are off on this phone.')
    setBusy(false)
  }

  if (state === null) return null

  if (state === 'on') {
    return (
      <div className="card">
        <p className="small">
          🔔 Phone reminders are on: 8:30 AM plan, 15 min before each visit or task, 8 PM check.
        </p>
        <div className="row">
          <button className="link" disabled={busy} onClick={() => void test()}>Send a test</button>
          <button className="link" disabled={busy} onClick={() => void turnOff()}>Turn off</button>
        </div>
        {msg && <p className="small">{msg}</p>}
      </div>
    )
  }

  return (
    <div className="card">
      <h2>🔔 Never forget a visit or payment</h2>
      {state === 'off' && (
        <>
          <p>Swayam reminds you on your phone: your plan in the morning, 15 minutes before each visit or task (with the payment to collect), and a check at 8 PM. Tap <b>Done</b> or <b>+30 min</b> right on the reminder.</p>
          <button className="primary" disabled={busy} onClick={() => void turnOn()}>{busy ? 'Turning on…' : 'Turn on reminders'}</button>
        </>
      )}
      {state === 'denied' && (
        <p>Notifications are blocked for Swayam. In Chrome tap <b>⋮ → Settings → Site settings → Notifications</b>, allow Swayam, then come back here.</p>
      )}
      {state === 'needs-install' && (
        <p>On iPhone, reminders work only after adding Swayam to the home screen: tap <b>Share → Add to Home Screen</b>, open Swayam from that icon, then turn reminders on.</p>
      )}
      {state === 'unsupported' && (
        <p>This browser cannot show reminders. On Android, open Swayam in <b>Chrome</b>, tap <b>⋮ → Install app</b>, and open it from the home-screen icon.</p>
      )}
      {msg && <p className="msg">{msg}</p>}
    </div>
  )
}
