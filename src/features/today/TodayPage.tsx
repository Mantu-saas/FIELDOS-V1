import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { inr, todayIST, monthStart } from '../../lib/format'
import { computeTarget } from '../../lib/targetMath'
import type { Profile } from '../../types'

export default function TodayPage({ profile }: { profile: Profile }) {
  const [rows, setRows] = useState<{ amount: number; sale_date: string; status: string }[] | null>(null)
  const [error, setError] = useState('')
  const today = todayIST()

  useEffect(() => {
    supabase.from('sales').select('amount,sale_date,status')
      .gte('sale_date', monthStart(today)).lte('sale_date', today)
      .then(({ data, error }) => {
        if (error) setError('Could not load sales: ' + error.message)
        else setRows((data ?? []) as { amount: number; sale_date: string; status: string }[])
      })
  }, [today])

  if (error) return <div className="card"><p className="msg">{error}</p></div>
  if (!rows) return <div className="card"><p>Loading…</p></div>

  const valid = rows.filter(r => r.status !== 'cancelled')
  const salesToday = valid.filter(r => r.sale_date === today).reduce((s, r) => s + Number(r.amount), 0)
  const salesBefore = valid.filter(r => r.sale_date < today).reduce((s, r) => s + Number(r.amount), 0)
  const t = computeTarget({ target: Number(profile.monthly_target), today, salesBeforeToday: salesBefore, salesToday })

  let note = ''
  if (t.remaining === 0) note = 'Monthly target reached.'
  else if (t.elapsedDays === 0) note = 'No completed selling days yet, so there is no average to compare.'
  else if (t.gap > 0) note = `You need about ${inr(t.gap)} more per day than your average so far.`
  else note = 'Your average so far is at or above what the rest of the month needs.'

  return (
    <div className="stack">
      <div className="card">
        <h2>Hello, {profile.full_name}</h2>
        <p className="small">Monthly target {inr(Number(profile.monthly_target))}</p>
        <div className="bar"><div style={{ width: t.percent + '%' }} /></div>
        <p className="big">{inr(t.achieved)}</p>
        <p className="small">achieved ({Math.round(t.percent)}%)</p>
      </div>
      <div className="grid2">
        <div className="card"><p className="small">Remaining</p><p className="num">{inr(t.remaining)}</p></div>
        <div className="card"><p className="small">Selling days left</p><p className="num">{t.remainingDays}</p></div>
        <div className="card"><p className="small">Needed per day</p><p className="num">{inr(t.required)}</p></div>
        <div className="card"><p className="small">Your average per day</p><p className="num">{inr(t.current)}</p></div>
      </div>
      <div className="card">
        <p><b>Today's sales:</b> {inr(salesToday)}</p>
        <p>{note}</p>
        <p className="small">Home by {profile.preferred_home_time?.slice(0, 5)} · Work {profile.work_start_time?.slice(0, 5)}–{profile.work_end_time?.slice(0, 5)}</p>
        <p className="small">Selling days are Monday to Saturday. This is arithmetic on your recorded sales, not a promise of results.</p>
      </div>
    </div>
  )
}
