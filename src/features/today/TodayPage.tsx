import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { inr, todayIST, monthStart } from '../../lib/format'
import { computeTarget } from '../../lib/targetMath'
import { isToday, loadWeekEvents, weekStartMonday } from '../../lib/personalEvents'
import type { PersonalEvent } from '../../lib/personalEvents'
import type { Profile } from '../../types'

export default function TodayPage({ profile }: { profile: Profile }) {
  const [rows, setRows] = useState<
    { amount: number; sale_date: string; status: string }[] | null
  >(null)

  const [error, setError] = useState('')
  const [todayEvents, setTodayEvents] = useState<PersonalEvent[]>([])

  const today = todayIST()

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
        result.events.filter((event) =>
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

  const valid = rows.filter((r) => r.status !== 'cancelled')

  const salesToday = valid
    .filter((r) => r.sale_date === today)
    .reduce((s, r) => s + Number(r.amount), 0)

  const salesBefore = valid
    .filter((r) => r.sale_date < today)
    .reduce((s, r) => s + Number(r.amount), 0)

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

  const isDatingDay =
    eventText.includes('dating') ||
    eventText.includes('date')

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

  return (
    <div className="stack">
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