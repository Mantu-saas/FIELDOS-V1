import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

type CoachPageProps = {
  userId: string
}

type HealthCheck = {
  energy: number | null
  stress: number | null
  sleep_hours: number | null
  pressure_tags: string[] | null
  day_weight: string | null
  home_time_status: string | null
  notes: string | null
}

type Visit = {
  id: string
  customer_id: string
  planned_start: string | null
  status: string
  sale_amount: number
  next_action: string | null
}

type FollowUp = {
  id: string
  customer_id: string
  due_date: string
  action: string
  expected_value: number
  status: string
}

type Sale = {
  id: string
  customer_id: string | null
  sale_date: string
  amount: number
  status: string
}

type Customer = {
  id: string
  name: string
  priority: number
  potential_amount: number
}

export default function CoachPage({ userId }: CoachPageProps) {
  const [loading, setLoading] = useState(true)
  const [asking, setAsking] = useState(false)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [error, setError] = useState('')

  const [health, setHealth] = useState<HealthCheck | null>(null)
  const [visits, setVisits] = useState<Visit[]>([])
  const [followUps, setFollowUps] = useState<FollowUp[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])

  function todayString() {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  function tomorrowString() {
    const now = new Date()
    now.setDate(now.getDate() + 1)
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  async function loadCoachData() {
    setLoading(true)
    setError('')

    const today = todayString()
    const tomorrow = tomorrowString()

    const [
      healthResult,
      visitsResult,
      followUpsResult,
      salesResult,
      customersResult,
    ] = await Promise.all([
      supabase
        .from('health_checkins')
        .select(
          'energy, stress, sleep_hours, pressure_tags, day_weight, home_time_status, notes'
        )
        .eq('user_id', userId)
        .eq('checkin_date', today)
        .maybeSingle(),

      supabase
        .from('visits')
        .select(
          'id, customer_id, planned_start, status, sale_amount, next_action'
        )
        .eq('user_id', userId)
        .gte('planned_start', `${today}T00:00:00`)
        .lt('planned_start', `${tomorrow}T00:00:00`)
        .order('planned_start', { ascending: true }),

      supabase
        .from('follow_ups')
        .select(
          'id, customer_id, due_date, action, expected_value, status'
        )
        .eq('user_id', userId)
        .neq('status', 'done')
        .neq('status', 'dropped')
        .lte('due_date', today)
        .order('due_date', { ascending: true }),

      supabase
        .from('sales')
        .select('id, customer_id, sale_date, amount, status')
        .eq('user_id', userId)
        .eq('sale_date', today)
        .order('created_at', { ascending: false }),

      supabase
        .from('customers')
        .select('id, name, priority, potential_amount')
        .eq('user_id', userId)
        .eq('active', true)
        .order('priority', { ascending: true })
        .limit(10),
    ])

    if (healthResult.error) {
      setError(healthResult.error.message)
      setLoading(false)
      return
    }

    if (visitsResult.error) {
      setError(visitsResult.error.message)
      setLoading(false)
      return
    }

    if (followUpsResult.error) {
      setError(followUpsResult.error.message)
      setLoading(false)
      return
    }

    if (salesResult.error) {
      setError(salesResult.error.message)
      setLoading(false)
      return
    }

    if (customersResult.error) {
      setError(customersResult.error.message)
      setLoading(false)
      return
    }

    setHealth(healthResult.data)
    setVisits((visitsResult.data || []) as Visit[])
    setFollowUps((followUpsResult.data || []) as FollowUp[])
    setSales((salesResult.data || []) as Sale[])
    setCustomers((customersResult.data || []) as Customer[])

    setLoading(false)
  }

  useEffect(() => {
    loadCoachData()
  }, [userId])

  function buildCoachAnswer(userQuestion?: string) {
    const energy = health?.energy ?? null
    const stress = health?.stress ?? null
    const dayWeight = health?.day_weight
    const homeTime = health?.home_time_status

    const visited = visits.filter(v => v.status === 'visited').length
    const planned = visits.filter(
      v => v.status === 'planned' || v.status === 'rescheduled'
    ).length

    const todaySales = sales
      .filter(s => s.status !== 'cancelled')
      .reduce((sum, sale) => sum + Number(sale.amount || 0), 0)

    const urgentFollowUps = followUps.length

    let response = ''

    if (userQuestion) {
      response = `Based on your FieldOS data today: ${userQuestion.trim()}\n\n`
    }

    if (dayWeight === 'heavy' || homeTime === 'late') {
      response +=
        'Your day looks overloaded. Protect your evening first. Keep the highest-value customer conversations and avoid adding unnecessary visits.\n\n'
    } else if (energy !== null && energy <= 3) {
      response +=
        'Your energy is low today. Focus on the few actions most likely to create revenue or protect an important relationship.\n\n'
    } else if (stress !== null && stress >= 8) {
      response +=
        'Your stress level is high. Reduce unnecessary work and concentrate on the most important customer actions.\n\n'
    } else {
      response +=
        'Your health check-in does not show a major warning. Use the available time to focus on your highest-value work.\n\n'
    }

    response += `Today you have ${planned} planned/rescheduled visits and ${visited} completed visits.\n`

    if (urgentFollowUps > 0) {
      response += `You also have ${urgentFollowUps} open follow-up${urgentFollowUps === 1 ? '' : 's'} due today or overdue.\n`
    } else {
      response += 'You have no open follow-ups currently due today or overdue.\n'
    }

    if (todaySales > 0) {
      response += `Sales recorded today: ₹${todaySales.toLocaleString('en-IN')}.\n`
    } else {
      response += 'No confirmed sales are recorded for today yet.\n'
    }

    const priorityCustomer = customers.find(c => c.priority <= 2)

    if (priorityCustomer) {
      response += `\nPriority suggestion: give ${priorityCustomer.name} attention before lower-priority customers.`
    }

    if (urgentFollowUps > 0) {
      const firstFollowUp = followUps[0]
      response += `\n\nNext practical action: ${firstFollowUp.action}.`
    } else if (visits.length > 0) {
      const nextVisit = visits.find(
        v => v.status === 'planned' || v.status === 'rescheduled'
      )

      if (nextVisit) {
        response += '\n\nNext practical action: prepare for your next planned customer visit.'
      }
    } else {
      response +=
        '\n\nNext practical action: choose one high-priority customer and make the next revenue-focused move.'
    }

    return response
  }

  async function askCoach() {
    const trimmed = question.trim()

    if (!trimmed) {
      setAnswer(buildCoachAnswer())
      return
    }

    setAsking(true)
    setError('')

    const coachAnswer = buildCoachAnswer(trimmed)
    setAnswer(coachAnswer)

    const context = {
      health,
      visits_count: visits.length,
      follow_ups_count: followUps.length,
      sales_count: sales.length,
      customers_count: customers.length,
      today: todayString(),
    }

    const { error: insertError } = await supabase
      .from('coach_events')
      .insert({
        user_id: userId,
        question: trimmed,
        answer: coachAnswer,
        context_json: context,
      })

    if (insertError) {
      setError(insertError.message)
    }

    setAsking(false)
  }

  if (loading) {
    return (
      <div className="card">
        <h2>COACH</h2>
        <p>Preparing your day...</p>
      </div>
    )
  }

  return (
    <div className="stack">
      <div className="card">
        <h2>COACH</h2>
        <p className="muted">
          Your personal FieldOS decision support for today.
        </p>
      </div>

      {error && (
        <div className="card">
          <p className="muted">
            Something needs attention: {error}
          </p>
        </div>
      )}

      <div className="card">
        <h3>YOUR DAY</h3>

        {health ? (
          <>
            <p>
              Energy: <strong>{health.energy ?? '—'}/10</strong>
            </p>

            <p>
              Stress: <strong>{health.stress ?? '—'}/10</strong>
            </p>

            <p>
              Sleep: <strong>{health.sleep_hours ?? '—'} hours</strong>
            </p>

            <p>
              Day weight: <strong>{health.day_weight ?? '—'}</strong>
            </p>

            <p>
              Home time: <strong>{health.home_time_status ?? '—'}</strong>
            </p>

            {health.pressure_tags &&
              health.pressure_tags.length > 0 && (
                <p>
                  Pressure:{' '}
                  <strong>{health.pressure_tags.join(', ')}</strong>
                </p>
              )}
          </>
        ) : (
          <p className="muted">
            Complete your HEALTH check-in first so Coach can understand your
            day.
          </p>
        )}
      </div>

      <div className="card">
        <h3>REVENUE & WORK</h3>

        <p>
          Planned visits: <strong>{visits.length}</strong>
        </p>

        <p>
          Completed visits:{' '}
          <strong>
            {visits.filter(v => v.status === 'visited').length}
          </strong>
        </p>

        <p>
          Due/overdue follow-ups: <strong>{followUps.length}</strong>
        </p>

        <p>
          Sales today:{' '}
          <strong>
            ₹
            {sales
              .reduce((sum, sale) => sum + Number(sale.amount || 0), 0)
              .toLocaleString('en-IN')}
          </strong>
        </p>
      </div>

      <div className="card">
        <h3>COACH'S RECOMMENDATION</h3>

        <p>
          {answer ||
            buildCoachAnswer(
              health
                ? 'What should I focus on today?'
                : 'What should I do next?'
            )}
        </p>
      </div>

      <div className="card">
        <h3>ASK COACH</h3>

        <textarea
          value={question}
          onChange={e => setQuestion(e.target.value)}
          placeholder="Example: What should I focus on first today?"
          rows={4}
        />

        <button
          className="primary"
          onClick={askCoach}
          disabled={asking}
        >
          {asking ? 'THINKING…' : 'ASK COACH'}
        </button>
      </div>
    </div>
  )
}
