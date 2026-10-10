import { useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types'
import TodayPage from '../features/today/TodayPage'
import MyWeekPage from '../features/myweek/MyWeekPage'
import CustomersView from '../features/customers/CustomersView'
import SalesView from '../features/sales/SalesView'
import RoutePage from '../features/route/RoutePage'
import HealthPage from '../features/health/HealthPage'
import CoachPage from '../features/coach/CoachPage'
import LifePage from '../features/life/LifePage'

const TABS = ['TODAY', 'SALES', 'ROUTE', 'HEALTH', 'COACH', 'LIFE'] as const
type Tab = (typeof TABS)[number]

export default function Shell({ profile }: { profile: Profile }) {
  const [tab, setTab] = useState<Tab>('TODAY')
  const [sub, setSub] = useState<'customers' | 'sales'>('customers')
  const [view, setView] = useState<'today' | 'week'>('today')

  // Tapping any tab (including TODAY) always starts from the normal screen of that tab
  function openTab(t: Tab) {
    setTab(t)
    setView('today')
  }

  return (
    <div className="shell">
      <header>
        <span className="logo">swayam</span>
        <button className="link light" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </header>
      <main>
        <div className="content">
          {tab === 'TODAY' && view === 'week' && (
            <MyWeekPage profile={profile} onBack={() => setView('today')} />
          )}
          {tab === 'TODAY' && view === 'today' && (
            <div className="stack">
              <button className="item" onClick={() => setView('week')}>
                <span><b>My Week</b><br /><span className="small">Work, family and personal time in one view</span></span>
                <span>→</span>
              </button>
              <TodayPage key={tab} profile={profile} />
            </div>
          )}
          {tab === 'SALES' && (
            <div className="stack">
              <div className="seg">
                <button className={sub === 'customers' ? 'on' : ''} onClick={() => setSub('customers')}>Customers</button>
                <button className={sub === 'sales' ? 'on' : ''} onClick={() => setSub('sales')}>Sales</button>
              </div>
              {sub === 'customers' ? <CustomersView userId={profile.id} /> : <SalesView userId={profile.id} />}
            </div>
          )}
          {tab === 'ROUTE' && <RoutePage userId={profile.id} />}
          {tab === 'HEALTH' && <HealthPage userId={profile.id} />}
          {tab === 'COACH' && <CoachPage userId={profile.id} />}
          {tab === 'LIFE' && <LifePage profile={profile} />}
        </div>
      </main>
      <nav>
        {TABS.map(t => (
          <button key={t} className={t === tab ? 'on' : ''} onClick={() => openTab(t)}>{t}</button>
        ))}
      </nav>
    </div>
  )
}
