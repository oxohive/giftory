import { describe, expect, it } from '@jest/globals'
import {
  assertSupportedRazorpayCurrency,
  fromMinorUnits,
  RazorpayAmountError,
  toMinorUnits,
  toOrderAmountMinor,
} from '../lib/money'

describe('gateway_razorpay amount conversion', () => {
  it('converts decimal rupees to integer paise without float drift', () => {
    expect(toMinorUnits(499, 'INR')).toBe(49900)
    expect(toMinorUnits(19.99, 'INR')).toBe(1999)
    expect(toMinorUnits(0.29, 'INR')).toBe(29)
    expect(toMinorUnits(1.005 + 0.005, 'INR')).toBe(101)
    expect(toMinorUnits(0.1 + 0.2, 'INR')).toBe(30)
    expect(toMinorUnits(1234567.8, 'INR')).toBe(123456780)
  })

  it('accepts numeric strings (as stored by the host ledger)', () => {
    expect(toMinorUnits('499.50', 'INR')).toBe(49950)
    expect(toMinorUnits('10', 'INR')).toBe(1000)
    expect(toMinorUnits('0.05', 'INR')).toBe(5)
  })

  it('normalizes the currency code', () => {
    expect(toMinorUnits(1, ' inr ')).toBe(100)
  })

  it('rejects sub-paise precision, negatives, and non-numbers', () => {
    expect(() => toMinorUnits(19.999, 'INR')).toThrow(RazorpayAmountError)
    expect(() => toMinorUnits('1.234', 'INR')).toThrow(RazorpayAmountError)
    expect(() => toMinorUnits(-1, 'INR')).toThrow(RazorpayAmountError)
    expect(() => toMinorUnits(Number.NaN, 'INR')).toThrow(RazorpayAmountError)
    expect(() => toMinorUnits(Number.POSITIVE_INFINITY, 'INR')).toThrow(RazorpayAmountError)
    expect(() => toMinorUnits('abc', 'INR')).toThrow(RazorpayAmountError)
    expect(() => toMinorUnits('1e3', 'INR')).toThrow(RazorpayAmountError)
  })

  it('rejects unsupported currencies', () => {
    expect(() => toMinorUnits(10, 'USD')).toThrow(/does not support currency "USD"/)
    expect(() => assertSupportedRazorpayCurrency('')).toThrow(RazorpayAmountError)
    expect(assertSupportedRazorpayCurrency('inr')).toBe('INR')
  })

  it('converts paise back to rupees', () => {
    expect(fromMinorUnits(49900, 'INR')).toBe(499)
    expect(fromMinorUnits(1999, 'INR')).toBe(19.99)
    expect(fromMinorUnits(5, 'INR')).toBe(0.05)
    expect(fromMinorUnits(0, 'INR')).toBe(0)
    expect(() => fromMinorUnits(10.5, 'INR')).toThrow(RazorpayAmountError)
  })

  it('round-trips every paise value in a range exactly', () => {
    for (let paise = 0; paise <= 10_000; paise += 7) {
      expect(toMinorUnits(fromMinorUnits(paise, 'INR'), 'INR')).toBe(paise)
    }
  })

  it('enforces the Razorpay order minimum of INR 1.00', () => {
    expect(toOrderAmountMinor(1, 'INR')).toBe(100)
    expect(() => toOrderAmountMinor(0.99, 'INR')).toThrow(/at least 100/)
    expect(() => toOrderAmountMinor(0, 'INR')).toThrow(RazorpayAmountError)
  })
})
