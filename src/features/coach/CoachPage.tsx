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

type CoachIntent =
  | 'today'
  | 'tomorrow'
  | 'followups'
  | 'customers'
  | 'workload'
  | 'performance'

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

  function dateString(date: Date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')

    return `${year}-${month}-${day}`
  }

  function todayString() {
    return dateString(new Date())
  }

  function tomorrowString() {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)

    return dateString(tomorrow)
  }

  function dayAfterTomorrowString() {
    const date = new Date()
    date.setDate(date.getDate() + 2)

    return dateString(date)
  }

  function customerName(customerId: string | null) {
    if (!customerId) return 'Unknown customer'

    const customer = customers.find(c => c.id === customerId)

    return customer?.name || 'Customer'
  }

  function customerPriority(customerId: string) {
    const customer = customers.find(c => c.id === customerId)

    return customer?.priority ?? 999
  }

  function formatVisitTime(plannedStart: string | null) {
    if (!plannedStart) return 'Time not set'

    const date = new Date(plannedStart)

    if (Number.isNaN(date.getTime())) {
      return 'Time not set'
    }

    return date.toLocaleTimeString('en-IN', {
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  async function loadCoachData() {
    setLoading(true)
    setError('')

    const today = todayString()
    const tomorrow = tomorrowString()
    const dayAfterTomorrow = dayAfterTomorrowString()

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
        .lt('planned_start', `${dayAfterTomorrow}T00:00:00`)
        .order('planned_start', { ascending: true }),

      supabase
        .from('follow_ups')
        .select(
          'id, customer_id, due_date, action, expected_value, status'
        )
        .eq('user_id', userId)
        .neq('status', 'done')
        .neq('status', 'dropped')
        .lte('due_date', tomorrow)
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
        .limit(50),
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

  function getIntent(userQuestion: string): CoachIntent {
    const q = userQuestion.toLowerCase().trim()

    if (
      q.includes('tomorrow') ||
      q.includes('next day') ||
      q.includes('next-day')
    ) {
      return 'tomorrow'
    }

    if (
      q.includes('follow up') ||
      q.includes('follow-up') ||
      q.includes('followup') ||
      q.includes('pending follow')
    ) {
      return 'followups'
    }

    if (
      q.includes('customer') ||
      q.includes('client') ||
      q.includes('who should')
    ) {
      return 'customers'
    }

    if (
      q.includes('too much work') ||
      q.includes('overloaded') ||
      q.includes('workload') ||
      q.includes('load') ||
      q.includes('how many visits')
    ) {
      return 'workload'
    }

    if (
      q.includes('performance') ||
      q.includes('performed') ||
      q.includes('result') ||
      q.includes('sales today') ||
      q.includes('how did i')
    ) {
      return 'performance'
    }

    return 'today'
  }

  function isPlannedVisit(visit: Visit) {
    return (
      visit.status === 'planned' ||
      visit.status === 'rescheduled'
    )
  }

  function buildTodayAnswer() {
    const energy = health?.energy ?? null
    const stress = health?.stress ?? null
    const dayWeight = health?.day_weight
    const homeTime = health?.home_time_status

    const today = todayString()

    const todayVisits = visits.filter(v => {
      if (!v.planned_start) return false

      return v.planned_start >= `${today}T00:00:00` &&
        v.planned_start < `${tomorrowString()}T00:00:00`
    })

    const visited = todayVisits.filter(
      v => v.status === 'visited'
    ).length

    const planned = todayVisits.filter(
      v => isPlannedVisit(v)
    )

    const todayFollowUps = followUps.filter(
      f => f.due_date <= today
    )

    const todaySales = sales
      .filter(s => s.status !== 'cancelled')
      .reduce(
        (sum, sale) => sum + Number(sale.amount || 0),
        0
      )

    let response =
      'TODAY\\n\\n'

    if (
      dayWeight === 'heavy' ||
      homeTime === 'late'
    ) {
      response +=
        'Your day looks overloaded. Protect your evening first. Keep the highest-value customer conversations and avoid adding unnecessary visits.\\n\\n'
    } else if (
      energy !== null &&
      energy <= 3
    ) {
      response +=
        'Your energy is low today. Focus on the few actions most likely to create revenue or protect an important relationship.\\n\\n'
    } else if (
      stress !== null &&
      stress >= 8
    ) {
      response +=
        'Your stress level is high. Reduce unnecessary work and concentrate on the most important customer actions.\\n\\n'
    } else {
      response +=
        'Your current health check-in does not show a major warning. Use your available time for the highest-value work.\\n\\n'
    }

    response +=
      `Planned/rescheduled visits: ${planned.length}\\n`

    response +=
      `Completed visits: ${visited}\\n`

    response +=
      `Follow-ups due today or overdue: ${todayFollowUps.length}\\n`

    response +=
      `Sales recorded today: ₹${todaySales.toLocaleString('en-IN')}\\n`

    if (todayFollowUps.length > 0) {
      const first = todayFollowUps[0]

      response +=
        `\\nFirst follow-up to protect: ${customerName(first.customer_id)} — ${first.action}.`
    } else if (planned.length > 0) {
      const first = planned[0]

      response +=
        `\\nNext practical action: prepare for ${customerName(first.customer_id)} at ${formatVisitTime(first.planned_start)}.`
    } else {
      const priorityCustomer = customers
        .slice()
        .sort((a, b) => a.priority - b.priority)[0]

      if (priorityCustomer) {
        response +=
          `\\nNext practical action: contact ${priorityCustomer.name}, your highest-priority active customer.`
      } else {
        response +=
          '\\nNext practical action: choose one high-value customer and make one revenue-focused move.'
      }
    }

    return response
  }

  function buildTomorrowAnswer() {
    const tomorrow = tomorrowString()
    const dayAfterTomorrow = dayAfterTomorrowString()

    const tomorrowVisits = visits
      .filter(v => {
        if (!v.planned_start) return false

        return (
          v.planned_start >= `${tomorrow}T00:00:00` &&
          v.planned_start < `${dayAfterTomorrow}T00:00:00`
        )
      })
      .filter(v => isPlannedVisit(v))
      .sort((a, b) => {
        return (
          customerPriority(a.customer_id) -
          customerPriority(b.customer_id)
        )
      })

    const tomorrowFollowUps = followUps.filter(
      f => f.due_date === tomorrow
    )

    let response =
      `TOMORROW — ${tomorrow}\\n\\n`

    if (tomorrowVisits.length === 0) {
      response +=
        'I do not currently see any planned or rescheduled visits for tomorrow in FieldOS.\\n\\n'
    } else {
      response +=
        `You currently have ${tomorrowVisits.length} planned/rescheduled visit${tomorrowVisits.length === 1 ? '' : 's'} tomorrow.\\n\\n`

      tomorrowVisits.slice(0, 8).forEach((visit, index) => {
        response +=
          `${index + 1}. ${customerName(visit.customer_id)} — ${formatVisitTime(visit.planned_start)}`

        const customer = customers.find(
          c => c.id === visit.customer_id
        )

        if (customer) {
          response +=
            ` — priority ${customer.priority}`
        }

        response += '\\n'
      })
    }

    if (tomorrowFollowUps.length > 0) {
      response +=
        `\\nTomorrow also has ${tomorrowFollowUps.length} follow-up${tomorrowFollowUps.length === 1 ? '' : 's'} due:\\n`

      tomorrowFollowUps
        .slice(0, 5)
        .forEach((followUp, index) => {
          response +=
            `${index + 1}. ${customerName(followUp.customer_id)} — ${followUp.action}`

          if (followUp.expected_value > 0) {
            response +=
              ` — expected ₹${Number(
                followUp.expected_value
              ).toLocaleString('en-IN')}`
          }

          response += '\\n'
        })
    } else {
      response +=
        '\\nThere are no follow-ups currently due tomorrow.'
    }

    const energy = health?.energy ?? null
    const dayWeight = health?.day_weight
    const homeTime = health?.home_time_status

    response += '\\n\\nCOACH PRIORITY\\n'

    if (
      tomorrowVisits.length >= 5 ||
      dayWeight === 'heavy' ||
      homeTime === 'late'
    ) {
      response +=
        'Tomorrow looks busy. Do not automatically add more visits. Protect your home-time target and keep the highest-value customer work first.'
    } else if (
      energy !== null &&
      energy <= 3
    ) {
      response +=
        'Your energy is currently low. Keep tomorrow focused on the most valuable visits and avoid unnecessary travel or low-value work.'
    } else {
      response +=
        'Tomorrow currently looks manageable. Start with the highest-priority customer and complete time-sensitive follow-ups before lower-value work.'
    }

    if (tomorrowVisits.length > 0) {
      const firstVisit = tomorrowVisits[0]

      response +=
        `\\n\\nFirst priority: ${customerName(firstVisit.customer_id)} at ${formatVisitTime(firstVisit.planned_start)}.`

      if (firstVisit.next_action) {
        response +=
          ` Next action: ${firstVisit.next_action}.`
      }
    }

    response +=
      '\\n\\nBefore ending today: review tomorrow’s first visit, prepare the required information, and confirm any important follow-up.'

    return response
  }

  function buildFollowUpAnswer() {
    const today = todayString()
    const tomorrow = tomorrowString()

    const relevantFollowUps = followUps
      .filter(
        f =>
          f.due_date <= tomorrow &&
          f.status !== 'done' &&
          f.status !== 'dropped'
      )
      .sort((a, b) => a.due_date.localeCompare(b.due_date))

    let response =
      'FOLLOW-UPS\\n\\n'

    if (relevantFollowUps.length === 0) {
      return (
        response +
        'You currently have no open follow-ups due today, overdue, or due tomorrow.'
      )
    }

    const overdue = relevantFollowUps.filter(
      f => f.due_date < today
    )

    const todayItems = relevantFollowUps.filter(
      f => f.due_date === today
    )

    const tomorrowItems = relevantFollowUps.filter(
      f => f.due_date === tomorrow
    )

    if (overdue.length > 0) {
      response +=
        `Overdue: ${overdue.length}\\n`
    }

    if (todayItems.length > 0) {
      response +=
        `Due today: ${todayItems.length}\\n`
    }

    if (tomorrowItems.length > 0) {
      response +=
        `Due tomorrow: ${tomorrowItems.length}\\n`
    }

    response += '\\nPriority follow-ups:\\n'

    relevantFollowUps
      .slice(0, 8)
      .forEach((followUp, index) => {
        response +=
          `${index + 1}. ${customerName(followUp.customer_id)} — ${followUp.action} — due ${followUp.due_date}`

        if (followUp.expected_value > 0) {
          response +=
            ` — expected ₹${Number(
              followUp.expected_value
            ).toLocaleString('en-IN')}`
        }

        response += '\\n'
      })

    response +=
      '\\nCoach recommendation: clear overdue and today’s follow-ups before spending time on lower-priority work.'

    return response
  }

  function buildCustomerAnswer() {
    const rankedCustomers = customers
      .slice()
      .sort((a, b) => {
        if (a.priority !== b.priority) {
          return a.priority - b.priority
        }

        return (
          Number(b.potential_amount || 0) -
          Number(a.potential_amount || 0)
        )
      })

    let response =
      'CUSTOMER PRIORITY\\n\\n'

    if (rankedCustomers.length === 0) {
      return (
        response +
        'No active customers are currently available for prioritisation.'
      )
    }

    response +=
      'Based on your current active customer data:\\n\\n'

    rankedCustomers
      .slice(0, 8)
      .forEach((customer, index) => {
        response +=
          `${index + 1}. ${customer.name} — priority ${customer.priority}`

        if (customer.potential_amount > 0) {
          response +=
            ` — potential ₹${Number(
              customer.potential_amount
            ).toLocaleString('en-IN')}`
        }

        response += '\\n'
      })

    response +=
      '\\nCoach recommendation: start with the highest-priority customer where there is a clear revenue or relationship action.'

    return response
  }

  function buildWorkloadAnswer() {
    const today = todayString()
    const tomorrow = tomorrowString()
    const dayAfterTomorrow = dayAfterTomorrowString()

    const tomorrowVisits = visits.filter(v => {
      if (!v.planned_start) return false

      return (
        v.planned_start >= `${tomorrow}T00:00:00` &&
        v.planned_start < `${dayAfterTomorrow}T00:00:00` &&
        isPlannedVisit(v)
      )
    })

    const tomorrowFollowUps = followUps.filter(
      f => f.due_date === tomorrow
    )

    const totalWorkItems =
      tomorrowVisits.length +
      tomorrowFollowUps.length

    let response =
      'TOMORROW WORKLOAD\\n\\n'

    response +=
      `Planned/rescheduled visits: ${tomorrowVisits.length}\\n`

    response +=
      `Follow-ups due tomorrow: ${tomorrowFollowUps.length}\\n`

    response +=
      `Total visible priority work items: ${totalWorkItems}\\n`

    if (
      tomorrowVisits.length >= 6 ||
      totalWorkItems >= 8
    ) {
      response +=
        '\\nCoach assessment: Tomorrow looks heavily loaded. Avoid adding low-value visits. Protect your highest-value customer work and home-time target.'
    } else if (
      tomorrowVisits.length >= 4 ||
      totalWorkItems >= 6
    ) {
      response +=
        '\\nCoach assessment: Tomorrow has a moderate workload. Keep the schedule disciplined and avoid unnecessary travel.'
    } else {
      response +=
        '\\nCoach assessment: Tomorrow currently looks manageable based on the FieldOS records available.'
    }

    return response
  }

  function buildPerformanceAnswer() {
    const completedVisits = visits.filter(
      v => v.status === 'visited'
    ).length

    const todaySales = sales
      .filter(s => s.status !== 'cancelled')
      .reduce(
        (sum, sale) => sum + Number(sale.amount || 0),
        0
      )

    const today = todayString()

    const todayFollowUps = followUps.filter(
      f => f.due_date <= today
    ).length

    let response =
      'TODAY PERFORMANCE\\n\\n'

    response +=
      `Completed visits: ${completedVisits}\\n`

    response +=
      `Sales recorded: ₹${todaySales.toLocaleString('en-IN')}\\n`

    response +=
      `Due/overdue follow-ups: ${todayFollowUps}\\n`

    if (todaySales > 0 && completedVisits > 0) {
      response +=
        '\\nCoach assessment: You have created measurable activity and revenue today. Protect the follow-up work so today’s activity turns into repeatable results.'
    } else if (completedVisits > 0) {
      response +=
        '\\nCoach assessment: You completed customer activity today. Your next priority is converting the strongest opportunities into follow-ups or sales.'
    } else if (todaySales > 0) {
      response +=
        '\\nCoach assessment: You recorded sales today. Make sure the related customer actions and follow-ups are captured in FieldOS.'
    } else {
      response +=
        '\\nCoach assessment: No completed visits or confirmed sales are currently visible for today. Focus on the highest-value customer action rather than increasing activity for its own sake.'
    }

    return response
  }

  function buildCoachAnswer(userQuestion?: string) {
    if (!userQuestion) {
      return buildTodayAnswer()
    }

    const intent = getIntent(userQuestion)

    switch (intent) {
      case 'tomorrow':
        return buildTomorrowAnswer()

      case 'followups':
        return buildFollowUpAnswer()

      case 'customers':
        return buildCustomerAnswer()

      case 'workload':
        return buildWorkloadAnswer()

      case 'performance':
        return buildPerformanceAnswer()

      case 'today':
      default:
        return buildTodayAnswer()
    }
  }

  async function askCoach() {
    const trimmed = question.trim()

    if (!trimmed) {
      setAnswer(buildTodayAnswer())
      return
    }

    setAsking(true)
    setError('')

    const coachAnswer = buildCoachAnswer(trimmed)

    setAnswer(coachAnswer)

    const context = {
      question_intent: getIntent(trimmed),
      health,
      today: todayString(),
      tomorrow: tomorrowString(),
      today_visits: visits.filter(v => {
        if (!v.planned_start) return false

        return (
          v.planned_start >= `${todayString()}T00:00:00` &&
          v.planned_start < `${tomorrowString()}T00:00:00`
        )
      }).length,
      tomorrow_visits: visits.filter(v => {
        if (!v.planned_start) return false

        return (
          v.planned_start >= `${tomorrowString()}T00:00:00` &&
          v.planned_start < `${dayAfterTomorrowString()}T00:00:00` &&
          isPlannedVisit(v)
        )
      }).length,
      today_follow_ups: followUps.filter(
        f => f.due_date <= todayString()
      ).length,
      tomorrow_follow_ups: followUps.filter(
        f => f.due_date === tomorrowString()
      ).length,
      sales_count: sales.length,
      customers_count: customers.length,
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
        <p>Preparing your FieldOS data...</p>
      </div>
    )
  }

  return (
    <div className="stack">
      <div className="card">
        <h2>COACH</h2>
        <p className="muted">
          Your personal FieldOS decision support for today,
          tomorrow and your highest-priority work.
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
              Home time:{' '}
              <strong>{health.home_time_status ?? '—'}</strong>
            </p>

            {health.pressure_tags &&
              health.pressure_tags.length > 0 && (
                <p>
                  Pressure:{' '}
                  <strong>
                    {health.pressure_tags.join(', ')}
                  </strong>
                </p>
              )}
          </>
        ) : (
          <p className="muted">
            Complete your HEALTH check-in first so Coach
            can understand your day.
          </p>
        )}
      </div>

      <div className="card">
        <h3>REVENUE & WORK</h3>

        <p>
          Today's visits:{' '}
          <strong>
            {
              visits.filter(v => {
                if (!v.planned_start) return false

                return (
                  v.planned_start >= `${todayString()}T00:00:00` &&
                  v.planned_start < `${tomorrowString()}T00:00:00`
                )
              }).length
            }
          </strong>
        </p>

        <p>
          Tomorrow's planned visits:{' '}
          <strong>
            {
              visits.filter(v => {
                if (!v.planned_start) return false

                return (
                  v.planned_start >= `${tomorrowString()}T00:00:00` &&
                  v.planned_start < `${dayAfterTomorrowString()}T00:00:00` &&
                  isPlannedVisit(v)
                )
              }).length
            }
          </strong>
        </p>

        <p>
          Completed visits today:{' '}
          <strong>
            {
              visits.filter(v => {
                if (!v.planned_start) return false

                return (
                  v.planned_start >= `${todayString()}T00:00:00` &&
                  v.planned_start < `${tomorrowString()}T00:00:00` &&
                  v.status === 'visited'
                )
              }).length
            }
          </strong>
        </p>

        <p>
          Follow-ups due/overdue:{' '}
          <strong>
            {
              followUps.filter(
                f => f.due_date <= todayString()
              ).length
            }
          </strong>
        </p>

        <p>
          Follow-ups due tomorrow:{' '}
          <strong>
            {
              followUps.filter(
                f => f.due_date === tomorrowString()
              ).length
            }
          </strong>
        </p>

        <p>
          Sales today:{' '}
          <strong>
            ₹
            {sales
              .reduce(
                (sum, sale) =>
                  sum + Number(sale.amount || 0),
                0
              )
              .toLocaleString('en-IN')}
          </strong>
        </p>
      </div>

      <div className="card">
        <h3>COACH'S RECOMMENDATION</h3>

        <p style={{ whiteSpace: 'pre-line' }}>
          {answer || buildTodayAnswer()}
        </p>
      </div>

      <div className="card">
        <h3>ASK COACH</h3>

        <textarea
          value={question}
          onChange={e => setQuestion(e.target.value)}
          placeholder="Example: What will my tomorrow work?"
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
