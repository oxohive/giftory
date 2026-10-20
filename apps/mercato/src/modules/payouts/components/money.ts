/**
 * Integer-paise money helpers for the payouts admin UI.
 *
 * Every amount in this module's API responses (`amount`, `pendingAmount`,
 * `totalEarned`) is already an integer number of INR paise — see
 * `CONTRACT-HANDOFF.md`'s "Money helper warning" and this repo's root
 * `CLAUDE.md` money convention. Nothing here runs a `Number * 100`-style
 * floating multiplication on a monetary value: parsing user input into paise
 * and formatting paise back into a display string are both done with
 * integer/string operations only.
 */

/**
 * Parse a user-typed rupee string (e.g. `"1250.50"`, `"40"`) into an exact
 * integer number of paise, without any floating-point multiplication.
 *
 * Accepts an optional 1-2 digit decimal part. Returns `null` for anything
 * that isn't a plain non-negative decimal (empty string, letters, negative
 * sign, more than 2 decimal digits, scientific notation, etc.) — the caller
 * decides how to surface that as a validation error.
 */
export function parseRupeesToPaise(raw: string): number | null {
  const trimmed = raw.trim()
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null
  const [wholePartRaw, fracPartRaw = ''] = trimmed.split('.')
  const fracPart = fracPartRaw.padEnd(2, '0')
  const wholePart = wholePartRaw.replace(/^0+(?=\d)/, '')
  const paiseStr = `${wholePart}${fracPart}`.replace(/^0+(?=\d)/, '')
  if (!/^\d+$/.test(paiseStr)) return null
  const paise = Number(paiseStr)
  if (!Number.isSafeInteger(paise)) return null
  return paise
}

/**
 * Format an integer paise amount as an `en-IN` rupee string (e.g.
 * `1234500` -> `"₹12,345.00"`). Uses integer division/modulo only — no
 * `amount / 100` floating display conversion that could drift for large
 * amounts.
 */
export function formatPaise(amountPaise: number, currencyCode: string = 'INR'): string {
  const safeAmount = Number.isFinite(amountPaise) ? Math.trunc(amountPaise) : 0
  const sign = safeAmount < 0 ? '-' : ''
  const abs = Math.abs(safeAmount)
  const whole = Math.trunc(abs / 100)
  const frac = abs % 100
  const symbol = currencyCode === 'INR' ? '₹' : `${currencyCode} `
  const wholeFormatted = whole.toLocaleString('en-IN')
  return `${sign}${symbol}${wholeFormatted}.${String(frac).padStart(2, '0')}`
}

export type LedgerBalanceEntryLike = {
  entryType: string
  direction: 'credit' | 'debit' | string
  amount: number
}

export type ComputedLedgerBalance = {
  pendingAmount: number
  totalEarned: number
  totalDebited: number
}

/**
 * Mirrors the exact formula computed server-side in
 * `payouts/api/admin/dealers/[id]/ledger/balance/route.ts` (and the dealer
 * equivalent), so the admin UI's own derived reconciliation check — and this
 * file's unit tests — exercise the same arithmetic the backend ships, not a
 * hand-picked approximation:
 *
 *   total_earned   = SUM(amount) WHERE direction = 'credit' AND entry_type = 'commission_earned'
 *   total_debited  = SUM(amount) WHERE direction = 'debit'
 *   pendingAmount  = total_earned - total_debited
 *
 * Note the deliberate asymmetry (tracked as a backend gap, not something
 * this UI task may silently "fix"): an `adjustment_credit` entry increases
 * `pendingAmount` (it isn't a debit) but does NOT increase `totalEarned`
 * (only `commission_earned` credits do). All amounts are integers; every
 * operation here is integer addition/subtraction.
 */
export function computeLedgerBalanceFromEntries(entries: LedgerBalanceEntryLike[]): ComputedLedgerBalance {
  let totalEarned = 0
  let totalDebited = 0
  for (const entry of entries) {
    const amount = Number.isSafeInteger(entry.amount) ? entry.amount : 0
    if (entry.direction === 'credit' && entry.entryType === 'commission_earned') {
      totalEarned += amount
    }
    if (entry.direction === 'debit') {
      totalDebited += amount
    }
  }
  return { pendingAmount: totalEarned - totalDebited, totalEarned, totalDebited }
}
