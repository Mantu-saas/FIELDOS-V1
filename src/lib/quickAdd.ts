// R3: Quick add. One line typed (or spoken with the keyboard microphone) becomes a task with a
// reminder, e.g. "stockist 2pm", "collect payment City Clinic tomorrow 11:30", "book ticket kal".
// It is saved at once; the checklist then shows what was understood, with Change next to it.
// Pure functions, no imports. Tests: tests/unit/quickAdd.test.ts

export type QuickParsed = { title: string; day: 'today' | 'tomorrow'; time: string | null; category: 'work' | 'travel' }

const TRAVEL = /\b(travel|journey|trip|train|flight|bus|ticket|station|airport|tour|out ?station)\b/i

const DAY_WORDS: [RegExp, 'today' | 'tomorrow'][] = [
  [/\b(tomorrow|tmrw|tmr|kal)\b/i, 'tomorrow'],
  [/\b(today|aaj)\b/i, 'today']
]

const pad = (n: number) => String(n).padStart(2, '0')

// Minutes rounded to the nearest 5-minute step, like every other time in Swayam
function toClock(h: number, m: number): string | null {
  const total = Math.round((h * 60 + m) / 5) * 5
  if (h > 23 || m > 59 || total >= 24 * 60) return null
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`
}

export function parseQuickAdd(text: string): QuickParsed {
  let rest = ` ${text} `
  let day: 'today' | 'tomorrow' = 'today'
  let time: string | null = null

  for (const [re, d] of DAY_WORDS) {
    if (re.test(rest)) {
      day = d
      rest = rest.replace(re, ' ')
      break
    }
  }

  // "2pm", "2 pm", "2:30pm", "2.30 PM", "at 11am"
  const ampm = /\b(?:at\s+)?(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)\b/i.exec(rest)
  if (ampm) {
    let h = Number(ampm[1])
    const m = ampm[2] ? Number(ampm[2]) : 0
    if (h >= 1 && h <= 12) {
      if (ampm[3].toLowerCase() === 'pm' && h !== 12) h += 12
      if (ampm[3].toLowerCase() === 'am' && h === 12) h = 0
      time = toClock(h, m)
      if (time) rest = rest.replace(ampm[0], ' ')
    }
  } else {
    // "14:30" or "at 9:15" (24-hour clock with minutes)
    const hm = /\b(?:at\s+)?([01]?\d|2[0-3])[:.]([0-5]\d)\b/.exec(rest)
    if (hm) {
      time = toClock(Number(hm[1]), Number(hm[2]))
      if (time) rest = rest.replace(hm[0], ' ')
    }
  }

  let title = rest.replace(/\s+/g, ' ').trim().replace(/^(at|on|by)\s+|\s+(at|on|by)$/gi, '').trim()
  if (title) title = title.charAt(0).toUpperCase() + title.slice(1)
  return { title, day, time, category: TRAVEL.test(title) ? 'travel' : 'work' }
}

// Reminder minutes for a quick-add task: 15 minutes before; "No reminder" when there is no time
export function quickReminder(time: string | null): number | null {
  return time ? 15 : null
}
