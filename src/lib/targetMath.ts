// Deterministic target math (Build Pack section 9). No AI. Selling days = Monday to Saturday.
export type TargetStats = {
  achieved: number
  remaining: number
  remainingDays: number   // selling days left this month, counting today
  elapsedDays: number     // completed selling days before today
  required: number        // required average per selling day
  current: number         // average per completed selling day so far
  gap: number             // required minus current
  percent: number
}

export function computeTarget(a: { target: number; today: string; salesBeforeToday: number; salesToday: number }): TargetStats {
  const [y, m, day] = a.today.split('-').map(Number)
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate()
  let elapsedDays = 0
  let remainingDays = 0
  for (let d = 1; d <= daysInMonth; d++) {
    if (new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 0) continue // Sunday off
    if (d < day) elapsedDays++
    else remainingDays++
  }
  const achieved = a.salesBeforeToday + a.salesToday
  const remaining = Math.max(a.target - achieved, 0)
  const required = remaining / Math.max(remainingDays, 1)
  const current = a.salesBeforeToday / Math.max(elapsedDays, 1)
  const percent = a.target > 0 ? Math.min((achieved / a.target) * 100, 100) : 0
  return { achieved, remaining, remainingDays, elapsedDays, required, current, gap: required - current, percent }
}
