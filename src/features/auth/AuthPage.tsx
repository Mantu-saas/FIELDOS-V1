import { useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function AuthPage() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function submit() {
    setMsg('')
    if (!email.includes('@')) return setMsg('Enter a valid email.')
    if (password.length < 8) return setMsg('Password must be at least 8 characters.')
    setBusy(true)
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) setMsg(error.message)
        else if (!data.session) setMsg('Account created. Check your email to confirm, then sign in.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) setMsg(error.message)
      }
    } catch {
      setMsg('Network problem. Please try again.')
    }
    setBusy(false)
  }

  return (
    <div className="auth">
      <div className="brand"><h1>swayam</h1><p>Plan the day. Hit the target. Get home on time.</p></div>
      <div className="card">
        <h2>{mode === 'signin' ? 'Sign in' : 'Create your account'}</h2>
        <label>Email<input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
        <label>Password<input type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={e => setPassword(e.target.value)} /></label>
        {msg && <p className="msg">{msg}</p>}
        <button className="primary" disabled={busy} onClick={submit}>{busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}</button>
        <button className="link" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setMsg('') }}>
          {mode === 'signin' ? 'New here? Create an account' : 'Already have an account? Sign in'}
        </button>
        <p className="small">Your data is private to you. Not shared with your employer.</p>
      </div>
    </div>
  )
}
