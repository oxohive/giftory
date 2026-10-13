/**
 * Money and rate helpers.
 *
 * Two different money conventions meet in this monorepo:
 * - Phase 1 / storefront values arrive from Open Mercato core as decimal major units
 *   (numbers or numeric strings) and must go through `toMinorUnits` before formatting.
 * - Phase 2 dealer-marketplace modules (dealer_onboarding, dealer_org_rbac, dealer_orders,
 *   commissions, payouts) already return integer paise. Call `formatMoney` directly on
 *   those values — running them through `toMinorUnits` first double-converts (treats paise
 *   as rupees) and renders amounts 100x too large. See tasks/phase-2-ui/API-CONTRACTS.md.
 */
const formatters = new Map<string, Intl.NumberFormat>()

function formatterFor(currency: string): Intl.NumberFormat {
  const key = currency.toUpperCase()
  let formatter = formatters.get(key)
  if (!formatter) {
    formatter = new Intl.NumberFormat('en-IN', { style: 'currency', currency: key })
    formatters.set(key, formatter)
  }
  return formatter
}

/** Format integer minor units, e.g. formatMoney(149900) -> "₹1,499.00". */
export function formatMoney(minorUnits: number, currency = 'INR'): string {
  return formatterFor(currency).format(minorUnits / 100)
}

/** Convert a backend decimal amount (major units) to integer minor units. */
export function toMinorUnits(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return null
  return Math.round(numeric * 100)
}

/** Convert integer minor units to a major-unit decimal (what Open Mercato APIs expect). */
export function toMajorUnits(minorUnits: number): number {
  return Math.round(minorUnits) / 100
}

/** Format basis points as a percentage, e.g. formatBps(500) -> "5%". 100 bps = 1%, max 10000. */
export function formatBps(rateBps: number): string {
  return `${(rateBps / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}%`
}
