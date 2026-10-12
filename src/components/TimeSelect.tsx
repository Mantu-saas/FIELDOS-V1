import { useEffect, useState } from 'react'
import { fromClock12, HOUR_OPTIONS_12, MINUTE_OPTIONS, toClock12 } from '../lib/visitTime'

// C19: time picker with 12-hour drop-downs (hour, minutes in 5-minute steps, AM/PM).
// Only allowed times can be picked, so the salesperson never has to correct a time.
// value / onChange use "HH:MM" (24-hour, India time), the same format the screens already save.
// onChange receives '' until hour, minutes and AM/PM are all chosen.
export default function TimeSelect({
  label,
  value,
  onChange,
  disabled = false
}: {
  label: string
  value: string
  onChange: (time: string) => void
  disabled?: boolean
}) {
  const [parts, setParts] = useState(() => partsOf(value))

  // Follow changes made by the screen itself (for example a suggested time or a reset)
  useEffect(() => {
    if (value !== fromClock12(parts.hour, parts.minute, parts.period)) setParts(partsOf(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  function update(change: Partial<typeof parts>) {
    const next = { ...parts, ...change }
    setParts(next)
    onChange(fromClock12(next.hour, next.minute, next.period))
  }

  return (
    <div className="time-select">
      {label}
      <div className="time-select-row">
        <select aria-label={`${label}: hour`} value={parts.hour} disabled={disabled}
          onChange={e => update({ hour: e.target.value })}>
          <option value="">Hour</option>
          {HOUR_OPTIONS_12.map(h => <option key={h} value={h}>{h}</option>)}
        </select>
        <select aria-label={`${label}: minutes`} value={parts.minute} disabled={disabled}
          onChange={e => update({ minute: e.target.value })}>
          <option value="">Min</option>
          {MINUTE_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select aria-label={`${label}: AM or PM`} value={parts.period} disabled={disabled}
          onChange={e => update({ period: e.target.value })}>
          <option value="">AM/PM</option>
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </div>
    </div>
  )
}

// An existing time that is not on a 5-minute step (for example 9:37) keeps its hour and
// AM/PM, but the minutes are left blank so the salesperson chooses an allowed step.
function partsOf(value: string): { hour: string; minute: string; period: string } {
  const c = toClock12(value)
  if (!c) return { hour: '', minute: '', period: '' }
  return { hour: c.hour, minute: MINUTE_OPTIONS.includes(c.minute) ? c.minute : '', period: c.period }
}
