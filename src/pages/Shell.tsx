import { useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types'

const TABS = ['TODAY', 'SALES', 'ROUTE', 'HEALTH', 'COACH'] as const

const inr = (n: number) => '₹' + new Intl.NumberFormat('en-IN').format(n)

export default function Shell({ profile }: { profile: Profile }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>('TODAY')
  return (
    <div className="shell">
      <header><span className="logo">swayam</span><button className="link light" onClick={() => supabase.auth.signOut()}>Sign out</button></header>
      <main>
        {tab === 'TODAY' ? (
          <div className="card">
            <h2>Hello, {profile.full_name}</h2>
            <p>Monthly target</p>
            <p className="big">{inr(profile.monthly_target)}</p>
            <p className="small">Home by {profile.preferred_home_time?.slice(0, 5)} · Work {profile.work_start_time?.slice(0, 5)}–{profile.work_end_time?.slice(0, 5)}</p>
          </div>
        ) : (
          <div className="card"><h2>{tab}</h2><p>Coming in a later milestone.</p></div>
        )}
      </main>
      <nav>{TABS.map(t => <button key={t} className={t === tab ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}</nav>
    </div>
  )
}
