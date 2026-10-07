/**
 * Money conversion at the Razorpay boundary.
 *
 * The payment_gateways contract passes amounts as decimal major units (e.g. 499.5 INR),
 * while Razorpay only accepts integer minor units (paise). Every amount crossing the
 * boundary goes through these helpers so we never send floats to the provider.
 */

/** Currencies this gateway accepts today. Razorpay supports more, but the launch market is India. */
export const RAZORPAY_SUPPORTED_CURRENCIES = ['INR'] as const
export type RazorpaySupportedCurrency = (typeof RAZORPAY_SUPPORTED_CURRENCIES)[number]

/** Razorpay rejects orders below 100 paise (INR 1.00). */
export const RAZORPAY_MIN_AMOUNT_MINOR = 100

const MINOR_UNIT_EXPONENT: Record<RazorpaySupportedCurrency, number> = {
  INR: 2,
}

export class RazorpayAmountError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RazorpayAmountError'
  }
}

export function normalizeCurrencyCode(currencyCode: string): string {
  return String(currencyCode ?? '').trim().toUpperCase()
}

export function isSupportedRazorpayCurrency(currencyCode: string): currencyCode is RazorpaySupportedCurrency {
  return (RAZORPAY_SUPPORTED_CURRENCIES as readonly string[]).includes(normalizeCurrencyCode(currencyCode))
}

export function assertSupportedRazorpayCurrency(currencyCode: string): RazorpaySupportedCurrency {
  const normalized = normalizeCurrencyCode(currencyCode)
  if (!isSupportedRazorpayCurrency(normalized)) {
    throw new RazorpayAmountError(
      `Razorpay gateway does not support currency "${normalized || '(empty)'}". Supported: ${RAZORPAY_SUPPORTED_CURRENCIES.join(', ')}.`,
    )
  }
  return normalized
}

/**
 * Convert a decimal major-unit amount (number or numeric string) into integer minor units.
 * Uses decimal string arithmetic instead of `amount * 100` so values like 19.99 never
 * round through binary floating point. More precision than the currency allows is rejected.
 */
export function toMinorUnits(amount: number | string, currencyCode: string): number {
  const currency = assertSupportedRazorpayCurrency(currencyCode)
  const exponent = MINOR_UNIT_EXPONENT[currency]

  let text: string
  if (typeof amount === 'number') {
    if (!Number.isFinite(amount)) throw new RazorpayAmountError('Amount must be a finite number')
    // toFixed(exponent + 6) exposes binary noise (19.99 -> "19.990000000000"), then we trim it.
    text = amount.toFixed(exponent + 6)
  } else {
    text = String(amount).trim()
  }

  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text)
  if (!match) throw new RazorpayAmountError(`Amount "${text}" is not a valid decimal number`)
  const [, sign, wholePart, rawFraction = ''] = match
  if (sign === '-') throw new RazorpayAmountError('Amount must not be negative')

  // Drop trailing zeros produced by toFixed, then require at most `exponent` fraction digits.
  const fraction = rawFraction.replace(/0+$/, '')
  if (fraction.length > exponent) {
    throw new RazorpayAmountError(`Amount "${text}" has more than ${exponent} decimal places`)
  }

  const minorText = `${wholePart}${fraction.padEnd(exponent, '0')}`
  const minor = Number.parseInt(minorText, 10)
  return assertSafeMinor(minor)
}

function assertSafeMinor(minor: number): number {
  if (!Number.isSafeInteger(minor) || minor < 0) {
    throw new RazorpayAmountError('Amount is outside the supported integer range')
  }
  return minor
}

/** Convert integer minor units from Razorpay back to decimal major units for the host contract. */
export function fromMinorUnits(minor: number, currencyCode: string): number {
  const currency = assertSupportedRazorpayCurrency(currencyCode)
  if (!Number.isSafeInteger(minor)) {
    throw new RazorpayAmountError('Razorpay returned a non-integer amount')
  }
  const exponent = MINOR_UNIT_EXPONENT[currency]
  // Division by a power of ten of a safe integer with <= 2 decimals is exact enough for display,
  // and Number(x.toFixed()) strips binary noise.
  return Number((minor / 10 ** exponent).toFixed(exponent))
}

/** Validates an amount destined for `POST /orders`. */
export function toOrderAmountMinor(amount: number | string, currencyCode: string): number {
  const minor = toMinorUnits(amount, currencyCode)
  if (minor < RAZORPAY_MIN_AMOUNT_MINOR) {
    throw new RazorpayAmountError(
      `Razorpay requires an order amount of at least ${RAZORPAY_MIN_AMOUNT_MINOR} minor units (INR 1.00)`,
    )
  }
  return minor
}
