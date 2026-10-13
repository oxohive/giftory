/**
 * Money helpers for the mobile app.
 *
 * Wire format (every backend endpoint): decimal major-unit INR, e.g. `499.00`.
 * Internal app state: integer minor units (paise), e.g. `49900`.
 *
 * Convert at the boundary and never do raw float arithmetic on money anywhere
 * downstream — every domain function in TASK-04 should call `toMinorUnits()`
 * on amounts coming in from the API and `toMajorUnits()` right before an
 * amount goes back out in a request body/query, then do all arithmetic in
 * between on integer minor units. This mirrors the convention in
 * apps/storefront/src/lib/money.ts and apps/mercato's `pricing.ts`, though the
 * exact function signatures here are major-unit-in/major-unit-out per this
 * task's contract (see spec/mobile/tasks/TASK-03-api-client-core.md) rather
 * than the storefront's minor-unit-in `formatMoney`.
 */

const formatters = new Map<string, Intl.NumberFormat>()

function formatterFor(currencyCode: string): Intl.NumberFormat {
  const key = currencyCode.toUpperCase()
  let formatter = formatters.get(key)
  if (!formatter) {
    formatter = new Intl.NumberFormat('en-IN', { style: 'currency', currency: key })
    formatters.set(key, formatter)
  }
  return formatter
}

/** Decimal major-unit amount (e.g. `499.00`) -> integer minor units (paise). Rounds. */
export function toMinorUnits(majorDecimal: number): number {
  return Math.round(majorDecimal * 100)
}

/** Integer minor units (paise) -> decimal major-unit amount, for outgoing requests. */
export function toMajorUnits(minor: number): number {
  return Math.round(minor) / 100
}

/** Format a decimal major-unit amount as a localized currency string, e.g. `"₹499.00"`. */
export function formatMoney(majorDecimal: number, currencyCode?: string): string {
  return formatterFor(currencyCode ?? 'INR').format(majorDecimal)
}
