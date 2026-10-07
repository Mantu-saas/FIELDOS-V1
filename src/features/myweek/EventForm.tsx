import { useState } from 'react'
import type { Profile } from '../../types'
import {
  CATEGORIES,
  PRIORITIES,
  REMINDERS,
  createEvent,
  istStamp
} from '../../lib/personalEvents'

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export default function EventForm({
  profile,
  defaultDate,
  onSaved,
  onCancel
}: {
  profile: Profile
  defaultDate: string
  onSaved: () => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('work')
  const [startDate, setStartDate] = useState(defaultDate)
  const [startTime, setStartTime] = useState('10:00')
  const [allDay, setAllDay] = useState(false)
  const [endDate, setEndDate] = useState('')
  const [endTime, setEndTime] = useState('')
  const [priority, setPriority] = useState('normal')
  const [location, setLocation] = useState('')
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [reminder, setReminder] = useState('30')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  async function save() {
    setMsg('')

    if (!title.trim()) {
      return setMsg('Please enter a title.')
    }

    if (!startDate) {
      return setMsg('Please choose a start date.')
    }

    if (!allDay && !startTime) {
      return setMsg('Please choose a start time.')
    }

    const amt = amount === '' ? null : Number(amount)

    if (
      amt !== null &&
      (!Number.isFinite(amt) || amt < 0)
    ) {
      return setMsg('Amount must be a number (0 or more).')
    }

    const startsAt = istStamp(
      startDate,
      allDay ? '00:00' : startTime
    )

    let endsAt: string | null = null

    if (allDay) {
      if (endDate) {
        if (endDate < startDate) {
          return setMsg(
            'End date cannot be before the start date.'
          )
        }

        endsAt = istStamp(endDate, '23:59')
      }
    } else if (endTime || endDate) {
      if (!endTime) {
        return setMsg(
          'Please enter an end time as well.'
        )
      }

      endsAt = istStamp(
        endDate || startDate,
        endTime
      )

      if (
        new Date(endsAt).getTime() <=
        new Date(startsAt).getTime()
      ) {
        return setMsg(
          'The end must be after the start.'
        )
      }
    }

    setBusy(true)

    const result = await createEvent({
      userId: profile.id,
      title: title.trim(),
      category,
      startsAt,
      endsAt,
      allDay,
      priority,
      location: location.trim() || null,
      amount: amt,
      notes: notes.trim() || null,
      reminderMinutes:
        REMINDERS.find(
          r => r.value === reminder
        )?.minutes ?? null
    })

    setBusy(false)

    if (result.error) {
      return setMsg(
        'Could not save: ' + result.error
      )
    }

    onSaved()
  }

  return (
    <div className="card">
      <h2>Add event</h2>

      <label>
        Title
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
        />
      </label>

      <label>
        Category
        <select
          value={category}
          onChange={e =>
            setCategory(e.target.value)
          }
        >
          {CATEGORIES.map(c => (
            <option key={c} value={c}>
              {cap(c)}
            </option>
          ))}
        </select>
      </label>

      <label>
        Start date
        <input
          type="date"
          value={startDate}
          onChange={e =>
            setStartDate(e.target.value)
          }
        />
      </label>

      <label>
        <input
          type="checkbox"
          style={{
            display: 'inline-block',
            width: 'auto',
            margin: '0 8px 0 0'
          }}
          checked={allDay}
          onChange={e =>
            setAllDay(e.target.checked)
          }
        />
        All day
      </label>

      {!allDay && (
        <label>
          Start time
          <input
            type="time"
            value={startTime}
            onChange={e =>
              setStartTime(e.target.value)
            }
          />
        </label>
      )}

      <label>
        End date (optional)
        <input
          type="date"
          min={startDate}
          value={endDate}
          onChange={e =>
            setEndDate(e.target.value)
          }
        />
      </label>

      {!allDay && (
        <label>
          End time (optional)
          <input
            type="time"
            value={endTime}
            onChange={e =>
              setEndTime(e.target.value)
            }
          />
        </label>
      )}

      <label>
        Priority
        <select
          value={priority}
          onChange={e =>
            setPriority(e.target.value)
          }
        >
          {PRIORITIES.map(p => (
            <option key={p} value={p}>
              {cap(p)}
            </option>
          ))}
        </select>
      </label>

      <label>
        Location (optional)
        <input
          value={location}
          onChange={e =>
            setLocation(e.target.value)
          }
        />
      </label>

      <label>
        Amount in ₹ (optional)
        <input
          inputMode="decimal"
          value={amount}
          onChange={e =>
            setAmount(
              e.target.value.replace(
                /[^0-9.]/g,
                ''
              )
            )
          }
        />
      </label>

      <label>
        Reminder
        <select
          value={reminder}
          onChange={e =>
            setReminder(e.target.value)
          }
        >
          {REMINDERS.map(r => (
            <option
              key={r.value}
              value={r.value}
            >
              {r.label}
            </option>
          ))}
        </select>
      </label>

      <label>
        Notes (optional)
        <textarea
          rows={3}
          value={notes}
          onChange={e =>
            setNotes(e.target.value)
          }
        />
      </label>

      <p className="small">
        Reminders are stored for later. Notifications are not active yet.
      </p>

      {msg && (
        <p className="msg">
          {msg}
        </p>
      )}

      <button
        className="primary"
        disabled={busy}
        onClick={save}
      >
        {busy ? 'Saving…' : 'Save event'}
      </button>

      <button
        className="link"
        onClick={onCancel}
      >
        Cancel
      </button>
    </div>
  )
}