import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, isConfigured, configProblem } from './lib/supabase'
import type { Profile } from './types'
import AuthPage from './features/auth/AuthPage'
import Onboarding from './features/onboarding/Onboarding'
import Shell from './pages/Shell'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isConfigured) { setLoading(false); return }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); if (!data.session) setLoading(false) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); if (!s) { setProfile(null); setLoading(false) } })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    setLoading(true)
    supabase.from('profiles').select('*').eq('id', session.user.id).single()
      .then(({ data, error }) => {
        if (error) setError('Could not load your profile: ' + error.message)
        else setProfile(data as Profile)
        setLoading(false)
      })
  }, [session])

  if (!isConfigured) {
    return <div className="center card"><h2>Setup needed</h2><p>{configProblem}</p></div>
  }
  if (loading) return <div className="center"><p>Loading…</p></div>
  if (!session) return <AuthPage />
  if (error) return <div className="center card"><p>{error}</p></div>
  if (!profile) return <div className="center"><p>Loading…</p></div>
  if (!profile.onboarding_complete) return <Onboarding profile={profile} onDone={setProfile} />
  return <Shell profile={profile} />
}
