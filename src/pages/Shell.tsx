import { useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types'
import TodayPage from '../features/today/TodayPage'
import CustomersView from '../features/customers/CustomersView'
import SalesView from '../features/sales/SalesView'
import RoutePage from '../features/route/RoutePage'
import HealthPage from '../features/health/HealthPage'

const TABS = ['TODAY', 'SALES', 'ROUTE', 'HEALTH', 'COACH'] as const

export default function Shell({ profile }: { profile: Profile }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>('TODAY')
  const [sub, setSub] = useState<'customers' | 'sales'>('customers')

  return (
    <div className="shell">
      <header>
        <span className="logo">swayam</span>
        <button
          className="link light"
          onClick={() => supabase.auth.signOut()}
        >
          Sign out
        </button>
      </header>

      <main>
        <div className="content">

          {tab === 'TODAY' && (
            <TodayPage key={tab} profile={profile} />
          )}

          {tab === 'SALES' && (
            <div className="stack">
              <div className="seg">
                <button
                  className={sub === 'customers' ? 'on' : ''}
                  onClick={() => setSub('customers')}
                >
                  Customers
                </button>

                <button
                  className={sub === 'sales' ? 'on' : ''}
                  onClick={() => setSub('sales')}
                >
                  Sales
                </button>
              </div>

              {sub === 'customers'
                ? <CustomersView userId={profile.id} />
                : <SalesView userId={profile.id} />}
            </div>
          )}

          {tab === 'ROUTE' && (
            <RoutePage userId={profile.id} />
          )}

          {tab === 'HEALTH' && (
            <HealthPage userId={profile.id} />
          )}

          {tab === 'COACH' && (
            <div className="card">
              <h2>COACH</h2>
              <p>Coming in a later milestone.</p>
            </div>
          )}

        </div>
      </main>

      <nav>
        {TABS.map(t => (
          <button
            key={t}
            className={t === tab ? 'on' : ''}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </nav>
    </div>
  )
}
