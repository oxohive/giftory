import { describe, expect, it } from '@jest/globals'
import { fromMinor, priceLine, round2, summarizeTotals, toMinor, toNumberOrNull } from '../lib/pricing'
import { orderTotals } from '../lib/paymentState'

/**
 * Money convention (CLAUDE.md): app-owned columns store integer paise and all
 * arithmetic goes through toMinor()/fromMinor(). These tests pin the
 * conversion helpers themselves — every other money path builds on them.
 */
describe('toMinor / fromMinor', () => {
  it('converts every 2-decimal rupee value to the exact paise integer (0 .. ₹20,000)', () => {
    for (let paise = 0; paise <= 2_000_000; paise += 1) {
      if (toMinor(paise / 100) !== paise) throw new Error(`toMinor(${paise / 100}) drifted`)
    }
  })

  it('round-trips paise -> rupees -> paise without drift for large order values', () => {
    for (const paise of [1, 99, 100, 999_999, 12_345_678, 99_999_999_99]) {
      expect(toMinor(fromMinor(paise))).toBe(paise)
    }
  })

  it('absorbs binary floating point noise from earlier arithmetic', () => {
    expect(0.1 + 0.2).not.toBe(0.3)
    expect(toMinor(0.1 + 0.2)).toBe(30)
    expect(toMinor(1078.0000000000002)).toBe(107800)
    expect(toMinor(1077.9999999999998)).toBe(107800)
  })

  it('rounds half a paisa up for positive amounts (1.005 -> 101 paise)', () => {
    expect(toMinor(1.005)).toBe(101)
    expect(toMinor(2.675)).toBe(268)
    expect(toMinor(0.285)).toBe(29)
  })

  it('always returns integers', () => {
    for (const value of [0.333333, 12.3456, 999.995, 1e-9]) {
      expect(Number.isInteger(toMinor(value))).toBe(true)
    }
  })

  it('fromMinor rounds fractional paise before dividing', () => {
    expect(fromMinor(12345)).toBe(123.45)
    expect(fromMinor(12345.4)).toBe(123.45)
    expect(fromMinor(12345.6)).toBe(123.46)
    expect(fromMinor(0)).toBe(0)
  })

  it('round2 is toMinor followed by fromMinor', () => {
    expect(round2(152.3949)).toBe(152.39)
    expect(round2(152.395)).toBe(152.4)
    expect(round2(0.1 + 0.2)).toBe(0.3)
  })
})

describe('toNumberOrNull (DB numeric strings)', () => {
  it('parses numeric strings as stored by Postgres numeric columns', () => {
    expect(toNumberOrNull('1078.0000')).toBe(1078)
    expect(toNumberOrNull(12)).toBe(12)
  })

  it('maps empty, missing and non-numeric values to null instead of NaN/0', () => {
    expect(toNumberOrNull('')).toBeNull()
    expect(toNumberOrNull(null)).toBeNull()
    expect(toNumberOrNull(undefined)).toBeNull()
    expect(toNumberOrNull('abc')).toBeNull()
    expect(toNumberOrNull(Number.NaN)).toBeNull()
    expect(toNumberOrNull(Number.POSITIVE_INFINITY)).toBeNull()
  })
})

describe('totals stay in whole paise', () => {
  it('sums many small lines without floating point drift', () => {
    const lines = Array.from({ length: 50 }, (_, index) =>
      priceLine({ priceId: `p${index}`, unitGross: 0.1, unitNet: 0.1, taxRate: 0 }, 1),
    )
    const totals = summarizeTotals(lines, 0.2)
    expect(totals.subtotal).toBe(5)
    expect(totals.grandTotal).toBe(5.2)
  })

  it('caps net at gross so tax can never go negative', () => {
    // A net price that rounds above gross (bad catalog data) must not produce negative tax.
    const line = priceLine({ priceId: 'x', unitGross: 100, unitNet: 100.004, taxRate: 0 }, 3)
    expect(line.totalNet).toBe(300)
    expect(line.taxAmount).toBe(0)
  })

  it('grand total = subtotal + shipping exactly, in paise', () => {
    const line = priceLine({ priceId: 'x', unitGross: 333.33, unitNet: 282.48, taxRate: 18 }, 3)
    const totals = summarizeTotals([line], 49)
    expect(toMinor(totals.grandTotal)).toBe(toMinor(totals.subtotal) + toMinor(totals.shipping))
    expect(totals).toMatchObject({ subtotal: 999.99, shipping: 49, grandTotal: 1048.99 })
  })

  it('reads 4-decimal sales order amounts and never reports a negative subtotal', () => {
    expect(orderTotals({ subtotalGrossAmount: '49.0000', shippingGrossAmount: '79.0000', grandTotalGrossAmount: '79' }).subtotal).toBe(0)
    expect(orderTotals({}).grandTotal).toBe(0)
    expect(orderTotals({ subtotalGrossAmount: '1048.9900', shippingGrossAmount: '49.0000', taxTotalAmount: '152.5400', grandTotalGrossAmount: '1048.9900' })).toEqual({
      subtotal: 999.99,
      shipping: 49,
      tax: 152.54,
      grandTotal: 1048.99,
    })
  })
})
