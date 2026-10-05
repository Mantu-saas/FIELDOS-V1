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
  const [booting, setBooting] = useState(true)        // checking if someone is signed in
  const [loadingProfile, setLoadingProfile] = useState(false)
  const [error, setError] = useState('')

  // The signed-in person's id. It only changes on real sign-in / sign-out,
  // NOT when the login quietly refreshes in the background.
  const userId = session?.user?.id ?? null

  useEffect(() => {
    if (!isConfigured) { setBooting(false); return }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setBooting(false) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s) })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!userId) { setProfile(null); setError(''); return }
    let cancelled = false
    setLoadingProfile(true)
    setError('')
    supabase.from('profiles').select('*').eq('id', userId).single()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) setError('Could not load your profile: ' + error.message)
        else setProfile(data as Profile)
        setLoadingProfile(false)
      })
    return () => { cancelled = true }
  }, [userId])

  if (!isConfigured) {
    return <div className="center card"><h2>Setup needed</h2><p>{configProblem}</p></div>
  }
  if (booting) return <div className="center"><p>Loading…</p></div>
  if (!userId) return <AuthPage />
  if (error) return <div className="center card"><p>{error}</p></div>
  if (loadingProfile || !profile) return <div className="center"><p>Loading…</p></div>
  if (!profile.onboarding_complete) return <Onboarding profile={profile} onDone={setProfile} />
  return <Shell profile={profile} />
}
