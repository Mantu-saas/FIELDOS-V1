// TODAY's "mood" card (R1 fix). Pure function, no imports, so Node's test runner can load it.
// Before: any event title containing the letters "date" ("Update stock list", "Due date")
// showed "You planned a date today". Now only clear romantic-date wording counts.
// Tests: tests/unit/todayMood.test.ts

const ROMANTIC_DATE = /\b(dating|date night|dinner date|lunch date|movie date|coffee date|on a date|date with)\b/i

export function isRomanticDate(text: string | null | undefined): boolean {
  return ROMANTIC_DATE.test(text ?? '')
}
