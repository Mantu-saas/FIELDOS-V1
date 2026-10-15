import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { inr, todayIST, monthStart } from '../../lib/format'
import { computeTarget } from '../../lib/targetMath'
import { activeSalesTotal } from '../../lib/rules'
import { isToday, loadWeekEvents, weekStartMonday } from '../../lib/personalEvents'
import type { PersonalEvent } from '../../lib/personalEvents'
import type { Profile } from '../../types'
import { isRomanticDate } from '../../lib/todayMood'
import { nextAction } from '../../lib/nextAction'
import type { NextActionFollowUp, NextActionVisit } from '../../lib/nextAction'
import { addDaysStr as addDays } from '../../lib/personalEvents'
import DayChecklist from './DayChecklist'
import RemindersCard from './RemindersCard'

export default function TodayPage({ profile, onOpenRoute }: { profile: Profile; onOpenRoute?: () => void }) {
  const [rows, setRows] = useState<
    { amount: number; sale_date: string; status: string }[] | null
  >(null)

  const [error, setError] = useState('')
  const [todayEvents, setTodayEvents] = useState<PersonalEvent[]>([])

  const today = todayIST()

  // R1: data for the "Next action" card (today's and tomorrow's visits, follow-ups due)
  const [plan, setPlan] = useState<{ visits: NextActionVisit[]; followUps: NextActionFollowUp[] } | null>(null)
  const [planError, setPlanError] = useState('')

  useEffect(() => {
    let ignore = false
    const nameOf = (c: unknown): string => {
      const one = Array.isArray(c) ? c[0] : c
      return (one as { name?: string } | null)?.name || 'Customer'
    }
    async function loadPlan() {
      const [v, f] = await Promise.all([
        supabase
          .from('visits')
          .select('status,planned_start,customers(name)')
          .eq('user_id', profile.id)
          .gte('planned_start', `${today}T00:00:00+05:30`)
          .lt('planned_start', `${addDays(today, 2)}T00:00:00+05:30`),
        supabase
          .from('follow_ups')
          .select('due_date,action,customers(name)')
          .eq('user_id', profile.id)
          .eq('status', 'open')
          .lte('due_date', today)
      ])
      if (ignore) return
      if (v.error || f.error) {
        setPlanError('Could not load your plan: ' + (v.error?.message ?? f.error?.message))
        return
      }
      setPlan({
        visits: (v.data ?? []).map(r => ({ status: r.status as string, planned_start: r.planned_start as string | null, name: nameOf(r.customers) })),
        followUps: (f.data ?? []).map(r => ({ due_date: r.due_date as string, action: r.action as string, name: nameOf(r.customers) }))
      })
    }
    loadPlan()
    return () => {
      ignore = true
    }
  }, [profile.id, today])

  useEffect(() => {
    supabase
      .from('sales')
      .select('amount,sale_date,status')
      .gte('sale_date', monthStart(today))
      .lte('sale_date', today)
      .then(({ data, error }) => {
        if (error) {
          setError('Could not load sales: ' + error.message)
        } else {
          setRows(
            (data ?? []) as {
              amount: number
              sale_date: string
              status: string
            }[]
          )
        }
      })
  }, [today])

  useEffect(() => {
    let ignore = false

    async function loadTodayEvents() {
      const result = await loadWeekEvents(
        profile.id,
        weekStartMonday(today)
      )

      if (ignore) return

      if (result.error) {
        setTodayEvents([])
        return
      }

      setTodayEvents(
        // R1: cancelled events no longer shape the day's message
        result.events.filter((event) =>
          event.status !== 'cancelled' &&
          isToday(new Date(event.starts_at))
        )
      )
    }

    loadTodayEvents()

    return () => {
      ignore = true
    }
  }, [profile.id, today])

  if (error) {
    return (
      <div className="card">
        <p className="msg">{error}</p>
      </div>
    )
  }

  if (!rows) {
    return (
      <div className="card">
        <p>Loading...</p>
      </div>
    )
  }

  // Shared rule (lib/rules.ts): cancelled sales never count
  const salesToday = activeSalesTotal(rows.filter((r) => r.sale_date === today))
  const salesBefore = activeSalesTotal(rows.filter((r) => r.sale_date < today))

  const t = computeTarget({
    target: Number(profile.monthly_target),
    today,
    salesBeforeToday: salesBefore,
    salesToday
  })

  const sortedTodayEvents = [...todayEvents].sort((a, b) => {
    if (a.all_day !== b.all_day) {
      return a.all_day ? -1 : 1
    }

    return a.priority === 'high'
      ? -1
      : b.priority === 'high'
        ? 1
        : 0
  })

  const primaryEvent = sortedTodayEvents[0]

  const eventText = primaryEvent
    ? `${primaryEvent.title} ${primaryEvent.category}`.toLowerCase()
    : ''

  // R1: only real dates ("date night", "dinner date"…), not "Update" or "Due date"
  const isDatingDay = isRomanticDate(eventText)

  const isFamilyDay =
    primaryEvent?.category === 'family' ||
    eventText.includes('family')

  const isHealthDay =
    primaryEvent?.category === 'health' ||
    eventText.includes('health')

  const isTravelDay =
    primaryEvent?.category === 'travel' ||
    eventText.includes('travel')

  const isWorkingDay =
    primaryEvent?.category === 'work' ||
    eventText.includes('working')

  let dayHeadline = ''
  let dayMessage = ''
  let dayPunchline = ''
  let dayIcon = ''

  if (isDatingDay) {
    dayIcon = '❤️'
    dayHeadline = 'Today is your day.'
    dayMessage =
      "You planned a date today, so don't let your sales target take over."
    dayPunchline = "Revenue can wait. Moments can't."
  } else if (isFamilyDay) {
    dayIcon = '🏠'
    dayHeadline = 'Family time today.'
    dayMessage =
      'Work can wait. Be present with the people who matter.'
    dayPunchline = 'Success is also having time to live.'
  } else if (isHealthDay) {
    dayIcon = '🌿'
    dayHeadline = 'Take care of yourself today.'
    dayMessage =
      'Your health is part of your performance. Give yourself permission to slow down.'
    dayPunchline =
      'Protect the person behind the performance.'
  } else if (isTravelDay) {
    dayIcon = '✈️'
    dayHeadline = 'Travel day.'
    dayMessage = 'Keep work light and enjoy the journey.'
    dayPunchline =
      'Work is part of life. It is not all of life.'
  } else if (primaryEvent?.category === 'personal') {
    dayIcon = '🧘'
    dayHeadline = 'Today belongs to you.'
    dayMessage =
      'Do not turn every free hour into a work hour.'
    dayPunchline =
      'Rest is part of the journey too.'
  } else if (isWorkingDay) {
    dayIcon = '💼'
    dayHeadline = 'Today is a working day.'
    dayMessage =
      'Focus on the customers and work that matter most today. Keep your planned home time protected.'
    dayPunchline =
      'A productive day should still leave room for life.'
  }

  let note = ''

  if (t.remaining === 0) {
    note = 'Monthly target reached.'
  } else if (t.elapsedDays === 0) {
    note =
      'No completed selling days yet, so there is no average to compare.'
  } else if (t.gap > 0) {
    note = `You need about ${inr(t.gap)} more per day than your average so far.`
  } else {
    note =
      'Your average so far is at or above what the rest of the month needs.'
  }

  // R1: one next action, with its reason, from the user's own saved data
  const next = plan ? nextAction({ now: new Date(), visits: plan.visits, followUps: plan.followUps, homeTime: profile.preferred_home_time }) : null

  return (
    <div className="stack">
      <div className="card">
        <p className="small">Next action</p>
        {planError ? (
          <p className="msg">{planError}</p>
        ) : !next ? (
          <p>Loading your plan...</p>
        ) : (
          <>
            <h2>{next.title}</h2>
            <p>{next.reason}</p>
            <p className="small">
              Visits left today: {next.visitsLeft} · Follow-ups due: {next.followUpsDue}
            </p>
          </>
        )}
      </div>

      {/* R3: one checklist for the day + phone reminders */}
      <RemindersCard />
      <DayChecklist userId={profile.id} onOpenRoute={onOpenRoute} />

      {primaryEvent && dayHeadline && (
        <div className="card">
          <p className="small">Swayam • Today's mood</p>

          <h2>
            {dayIcon} {dayHeadline}
          </h2>

          <p>{dayMessage}</p>

          <p className="small">
            <b>{dayPunchline}</b>
          </p>

          <p className="small">
            Planned: {primaryEvent.title}
            {primaryEvent.all_day ? ' • All day' : ''}
          </p>
        </div>
      )}

      <div className="card">
        <h2>Hello, {profile.full_name}</h2>

        <p className="small">
          Monthly target {inr(Number(profile.monthly_target))}
        </p>

        <div className="bar">
          <div
            style={{
              width: t.percent + '%'
            }}
          />
        </div>

        <p className="big">{inr(t.achieved)}</p>

        <p className="small">
          achieved ({Math.round(t.percent)}%)
        </p>
      </div>

      <div className="grid2">
        <div className="card">
          <p className="small">Remaining</p>
          <p className="num">{inr(t.remaining)}</p>
        </div>

        <div className="card">
          <p className="small">Selling days left</p>
          <p className="num">{t.remainingDays}</p>
        </div>

        <div className="card">
          <p className="small">Needed per day</p>
          <p className="num">{inr(t.required)}</p>
        </div>

        <div className="card">
          <p className="small">Your average per day</p>
          <p className="num">{inr(t.current)}</p>
        </div>
      </div>

      <div className="card">
        <p>
          <b>Today's sales:</b> {inr(salesToday)}
        </p>

        <p>{note}</p>

        <p className="small">
          Home by {profile.preferred_home_time?.slice(0, 5)} · Work{' '}
          {profile.work_start_time?.slice(0, 5)}-
          {profile.work_end_time?.slice(0, 5)}
        </p>

        <p className="small">
          Selling days are Monday to Saturday. This is arithmetic on
          your recorded sales, not a promise of results.
        </p>
      </div>
    </div>
  )
}