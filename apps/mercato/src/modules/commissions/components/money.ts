/**
 * Integer-paise money + basis-point helpers for the commissions admin UI.
 *
 * Every amount in this module's API responses (`subtotalAmount`,
 * `commissionAmount`) is already an integer number of INR paise — see
 * CONTRACT-HANDOFF.md's "Money helper warning" and this repo's root
 * `CLAUDE.md` money convention. Nothing here runs a `Number * 100`-style
 * floating multiplication on a monetary value.
 *
 * `previewCommissionAmount` deliberately calls the REAL backend formula
 * (`computeCommissionAmount` from `../lib/rateResolver`) rather than
 * re-implementing the arithmetic client-side — that function has no runtime
 * dependency beyond `MAX_RATE_BPS` (its `EntityManager` import is
 * type-only), so importing it into a `'use client'` component carries no
 * server-only code into the browser bundle, and the UI's bps→currency
 * preview can never drift from what the backend will actually compute.
 */
import { computeCommissionAmount } from '../lib/rateResolver'
import { MAX_RATE_BPS, MIN_RATE_BPS } from '../lib/constants'

export { computeCommissionAmount, MAX_RATE_BPS, MIN_RATE_BPS }

/**
 * Format an integer paise amount as an `en-IN` rupee string (e.g.
 * `1234500` -> `"₹12,345.00"`). Uses integer division/modulo only — no
 * `amount / 100` floating display conversion that could drift for large
 * amounts. Mirrors `payouts/components/money.ts`'s `formatPaise` (same
 * convention, kept local per module isolation — no cross-module import).
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

/**
 * Format a basis-point rate as `"<bps> bps (<percent>%)"`, e.g.
 * `250` -> `"250 bps (2.50%)"`. Integer-only: the percent string is derived
 * from the same integer bps value, not a float division that could render
 * `2.4999999999999996%`.
 */
export function formatBps(rateBps: number): string {
  const safeBps = Number.isFinite(rateBps) ? Math.trunc(rateBps) : 0
  const whole = Math.trunc(safeBps / 100)
  const frac = Math.abs(safeBps % 100)
  const percent = `${whole}.${String(frac).padStart(2, '0')}`
  return `${safeBps} bps (${percent}%)`
}

/**
 * A representative subtotal (₹10,000 = 1,000,000 paise) used only to make a
 * bps rate concrete in the UI ("what would this rate actually earn?").
 * Never sent to the server — purely a display aid for the create-rule form.
 */
export const EXAMPLE_SUBTOTAL_PAISE = 1_000_000

/**
 * Preview the commission amount a given rate would produce on the example
 * subtotal, using the real backend formula. Returns `null` for an
 * out-of-range bps value (the form's own validation surfaces that
 * separately) instead of throwing while the admin is still typing.
 */
export function previewCommissionAmount(rateBps: number, subtotalPaise: number = EXAMPLE_SUBTOTAL_PAISE): number | null {
  if (!Number.isInteger(rateBps) || rateBps < 0 || rateBps > MAX_RATE_BPS) return null
  return computeCommissionAmount(subtotalPaise, rateBps)
}
