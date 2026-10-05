import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'

type HealthPageProps = { userId: string }

const todayISO = () => {
  const d = new Date()
  const offset = d.getTimezoneOffset()
  return new Date(d.getTime() - offset * 60000).toISOString().slice(0, 10)
}

const PRESSURES = [
  ['target', '🎯 Target pressure'],
  ['office', '📞 Boss / office'],
  ['rejection', '😤 Customer rejection'],
  ['reports', '📋 Reports / office work'],
  ['travel', '🚗 Travel / waiting'],
  ['home', '🏠 Home / family'],
  ['nothing', '😌 Nothing'],
] as const

const energyOptions = [
  [3, '💪 Fresh'],
  [2, '🙂 Normal'],
  [1, '😩 Tired'],
  [0, '🪫 Drained'],
] as const

const stressOptions = [
  [0, 'Low'],
  [1, 'Medium'],
  [2, 'High'],
] as const

export default function HealthPage({ userId }: HealthPageProps) {
  const [energy, setEnergy] = useState<number | null>(null)
  const [stress, setStress] = useState<number | null>(null)
  const [sleep, setSleep] = useState<'good' | 'okay' | 'poor' | ''>('')
  const [pressures, setPressures] = useState<string[]>([])
  const [dayWeight, setDayWeight] = useState<'light' | 'normal' | 'heavy' | ''>('')
  const [homeTime, setHomeTime] = useState<'on_time' | 'probably_late' | 'late' | ''>('')
  const [notes, setNotes] = useState('')
  const [rowId, setRowId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const date = useMemo(() => todayISO(), [])

  useEffect(() => {
    let active = true

    const load = async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('health_checkins')
        .select('id,energy,stress,sleep_hours,pressure_tags,day_weight,home_time_status,notes')
        .eq('user_id', userId)
        .eq('checkin_date', date)
        .maybeSingle()

      if (!active) return

      if (error) {
        setMessage(error.message)
        setLoading(false)
        return
      }

      if (data) {
        setRowId(data.id)
        setEnergy(data.energy ?? null)
        setStress(data.stress ?? null)
        setPressures(data.pressure_tags ?? [])
        setDayWeight(data.day_weight ?? '')
        setHomeTime(data.home_time_status ?? '')
        setNotes(data.notes ?? '')
        const hours = data.sleep_hours
        setSleep(hours == null ? '' : hours >= 7 ? 'good' : hours >= 5 ? 'okay' : 'poor')
      }

      setLoading(false)
    }

    load()
    return () => {
      active = false
    }
  }, [userId, date])

  const togglePressure = (value: string) => {
    setPressures(current => {
      if (value === 'nothing') return current.includes('nothing') ? [] : ['nothing']
      return current.filter(x => x !== 'nothing').includes(value)
        ? current.filter(x => x !== value)
        : [...current.filter(x => x !== 'nothing'), value]
    })
  }

  const result = useMemo(() => {
    if (dayWeight === 'heavy' || homeTime === 'late' || energy === 0) {
      return {
        tone: '🔴',
        title: 'OVERLOADED DAY',
        text: 'Protect your energy and home time. Keep only the visits that matter most.',
      }
    }
    if (dayWeight === 'normal' || homeTime === 'probably_late' || energy === 1 || stress === 2) {
      return {
        tone: '🟡',
        title: 'PROTECT YOUR EVENING',
        text: 'Your day is manageable, but watch travel and workload. Focus on your best opportunities first.',
      }
    }
    return {
      tone: '🟢',
      title: 'HEALTHY REVENUE DAY',
      text: 'You look ready for the day. Focus on your highest-priority customers and protect your home-time target.',
    }
  }, [dayWeight, homeTime, energy, stress])

  const save = async () => {
    setSaving(true)
    setMessage('')

    const sleepHours = sleep === 'good' ? 7 : sleep === 'okay' ? 6 : sleep === 'poor' ? 4 : null

    const payload = {
      user_id: userId,
      checkin_date: date,
      energy,
      stress,
      sleep_hours: sleepHours,
      pressure_tags: pressures,
      day_weight: dayWeight || null,
      home_time_status: homeTime || null,
      notes: notes.trim() || null,
    }

    const resultQuery = rowId
      ? await supabase.from('health_checkins').update(payload).eq('id', rowId).eq('user_id', userId)
      : await supabase.from('health_checkins').insert(payload).select('id').single()

    if (resultQuery.error) {
      setMessage(resultQuery.error.message)
    } else {
      if (!rowId && resultQuery.data) setRowId(resultQuery.data.id)
      setMessage('Saved for today.')
    }

    setSaving(false)
  }

  if (loading) return <div className="card"><p>Loading today's check-in…</p></div>

  return (
    <div className="stack">
      <div className="card">
        <h2>HEALTH</h2>
        <p className="muted">A quick check-in to protect your energy, sales day and home time.</p>

        <h3>1. How did you sleep?</h3>
        <div className="seg">
          {(['good', 'okay', 'poor'] as const).map(value => (
            <button key={value} className={sleep === value ? 'on' : ''} onClick={() => setSleep(value)}>
              {value === 'good' ? '😴 Good' : value === 'okay' ? '😐 Okay' : '🥱 Poor'}
            </button>
          ))}
        </div>

        <h3>2. How is your energy?</h3>
        <div className="seg">
          {energyOptions.map(([value, label]) => (
            <button key={value} className={energy === value ? 'on' : ''} onClick={() => setEnergy(value)}>
              {label}
            </button>
          ))}
        </div>

        <h3>3. What's pressing you today?</h3>
        <div className="choices">
          {PRESSURES.map(([value, label]) => (
            <button key={value} className={pressures.includes(value) ? 'on' : ''} onClick={() => togglePressure(value)}>
              {label}
            </button>
          ))}
        </div>

        <h3>4. How heavy does today feel?</h3>
        <div className="seg">
          <button className={dayWeight === 'light' ? 'on' : ''} onClick={() => setDayWeight('light')}>🟢 Light</button>
          <button className={dayWeight === 'normal' ? 'on' : ''} onClick={() => setDayWeight('normal')}>🟡 Normal</button>
          <button className={dayWeight === 'heavy' ? 'on' : ''} onClick={() => setDayWeight('heavy')}>🔴 Heavy</button>
        </div>

        <h3>5. Will you reach home on time?</h3>
        <div className="seg">
          <button className={homeTime === 'on_time' ? 'on' : ''} onClick={() => setHomeTime('on_time')}>🟢 Yes</button>
          <button className={homeTime === 'probably_late' ? 'on' : ''} onClick={() => setHomeTime('probably_late')}>🟡 Probably late</button>
          <button className={homeTime === 'late' ? 'on' : ''} onClick={() => setHomeTime('late')}>🔴 Late</button>
        </div>

        <h3>Optional note</h3>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Anything you want FieldOS to remember for you?" rows={3} />

        <button className="primary" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'CHECK MY DAY'}
        </button>

        {message && <p className="muted">{message}</p>}
      </div>

      <div className="card">
        <h2>{result.tone} {result.title}</h2>
        <p>{result.text}</p>
        <p className="muted">This result is based on your check-in. Later, Coach will combine it with your route, customers, sales and follow-ups.</p>
      </div>
    </div>
  )
}
