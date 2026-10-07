/**
 * Money helpers. The storefront works in integer minor units (paise for INR).
 * Open Mercato returns prices as decimal major units (numbers or numeric strings),
 * so everything coming from the backend goes through `toMinorUnits` first.
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
