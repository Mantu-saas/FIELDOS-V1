export const inr = (n: number) =>
  '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(n))

// Today's date in India as YYYY-MM-DD
export function todayIST(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
}

export const monthStart = (date: string) => date.slice(0, 8) + '01'

// Clock time in India, e.g. "10:30 AM"
export function timeIST(iso: string | null): string {
  if (!iso) return ''
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso))
}
