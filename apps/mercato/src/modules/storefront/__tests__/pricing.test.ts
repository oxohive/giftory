import { describe, expect, it } from '@jest/globals'
import {
  checkQuantity,
  isPublicStorefrontPrice,
  lowestUnitPrice,
  priceLine,
  resolveUnitPrice,
  selectStorefrontPrice,
  summarizeTotals,
  type StorefrontPriceRow,
} from '../lib/pricing'

const PRODUCT = '6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b'
const VARIANT_A = '11111111-1111-4111-8111-111111111111'
const VARIANT_B = '22222222-2222-4222-8222-222222222222'
const NOW = new Date('2026-10-05T10:00:00Z')
const CTX = { currencyCode: 'INR', priceKindCode: 'regular', now: NOW }

function row(overrides: Partial<StorefrontPriceRow>): StorefrontPriceRow {
  return {
    id: overrides.id ?? `price-${Math.random().toString(36).slice(2)}`,
    productId: PRODUCT,
    variantId: null,
    offerId: null,
    currencyCode: 'INR',
    kindCode: 'regular',
    minQuantity: 1,
    maxQuantity: null,
    unitPriceNet: null,
    unitPriceGross: 999,
    taxRate: 18,
    channelId: null,
    customerId: null,
    customerGroupId: null,
    userId: null,
    userGroupId: null,
    startsAt: null,
    endsAt: null,
    ...overrides,
  }
}

describe('public price filtering', () => {
  it('accepts only INR regular list prices without targeting', () => {
    expect(isPublicStorefrontPrice(row({}), CTX)).toBe(true)
    expect(isPublicStorefrontPrice(row({ currencyCode: 'USD' }), CTX)).toBe(false)
    expect(isPublicStorefrontPrice(row({ kindCode: 'promotion' }), CTX)).toBe(false)
    expect(isPublicStorefrontPrice(row({ customerId: 'c' }), CTX)).toBe(false)
    expect(isPublicStorefrontPrice(row({ customerGroupId: 'g' }), CTX)).toBe(false)
    expect(isPublicStorefrontPrice(row({ userId: 'u' }), CTX)).toBe(false)
    expect(isPublicStorefrontPrice(row({ channelId: 'ch' }), CTX)).toBe(false)
    expect(isPublicStorefrontPrice(row({ offerId: 'o' }), CTX)).toBe(false)
  })

  it('respects the validity window', () => {
    expect(isPublicStorefrontPrice(row({ startsAt: new Date('2026-11-01') }), CTX)).toBe(false)
    expect(isPublicStorefrontPrice(row({ endsAt: new Date('2026-10-01') }), CTX)).toBe(false)
    expect(isPublicStorefrontPrice(row({ startsAt: new Date('2026-10-01'), endsAt: new Date('2026-10-31') }), CTX)).toBe(true)
  })

  it('ignores rows without any amount', () => {
    expect(isPublicStorefrontPrice(row({ unitPriceGross: null, unitPriceNet: null }), CTX)).toBe(false)
  })
})

describe('price selection', () => {
  const productLevel = row({ id: 'p-product', unitPriceGross: 1200 })
  const variantA = row({ id: 'p-a', variantId: VARIANT_A, unitPriceGross: 999 })
  const variantATier = row({ id: 'p-a-tier', variantId: VARIANT_A, unitPriceGross: 899, minQuantity: 5 })
  const variantB = row({ id: 'p-b', variantId: VARIANT_B, unitPriceGross: 1499 })
  const rows = [productLevel, variantA, variantATier, variantB]

  it('prefers the variant-specific price over the product-level price', () => {
    expect(selectStorefrontPrice(rows, { productId: PRODUCT, variantId: VARIANT_A }, { ...CTX, quantity: 1 })?.id).toBe('p-a')
  })

  it('never picks another variant price', () => {
    const selected = selectStorefrontPrice([productLevel, variantB], { productId: PRODUCT, variantId: VARIANT_A }, { ...CTX, quantity: 1 })
    expect(selected?.id).toBe('p-product')
  })

  it('applies the highest reachable quantity tier', () => {
    expect(selectStorefrontPrice(rows, { productId: PRODUCT, variantId: VARIANT_A }, { ...CTX, quantity: 4 })?.id).toBe('p-a')
    expect(selectStorefrontPrice(rows, { productId: PRODUCT, variantId: VARIANT_A }, { ...CTX, quantity: 5 })?.id).toBe('p-a-tier')
  })

  it('returns null when no public price applies', () => {
    const selected = selectStorefrontPrice([row({ kindCode: 'wholesale' })], { productId: PRODUCT, variantId: null }, { ...CTX, quantity: 1 })
    expect(selected).toBeNull()
  })

  it('reports the cheapest variant as the listing price', () => {
    expect(lowestUnitPrice(rows, PRODUCT, [VARIANT_A, VARIANT_B], CTX)?.unitGross).toBe(999)
    expect(lowestUnitPrice([productLevel], PRODUCT, [], CTX)?.unitGross).toBe(1200)
  })
})

describe('unit price normalization', () => {
  it('derives net from a tax-inclusive gross price', () => {
    const unit = resolveUnitPrice(row({ unitPriceGross: 1180, taxRate: 18 }))!
    expect(unit.unitGross).toBe(1180)
    expect(unit.unitNet).toBe(1000)
    expect(unit.taxRate).toBe(18)
  })

  it('derives gross from net and rounds to paise', () => {
    const unit = resolveUnitPrice(row({ unitPriceGross: null, unitPriceNet: 846.61, taxRate: 18 }))!
    expect(unit.unitGross).toBe(999)
  })

  it('falls back to the product tax rate and to zero', () => {
    expect(resolveUnitPrice(row({ unitPriceGross: null, unitPriceNet: 100, taxRate: null }), 5)!.unitGross).toBe(105)
    expect(resolveUnitPrice(row({ unitPriceGross: 100, taxRate: null }))!.unitNet).toBe(100)
  })
})

describe('line and order totals', () => {
  it('multiplies in paise and never produces fractional paise', () => {
    const line = priceLine({ priceId: 'x', unitGross: 333.33, unitNet: 282.4831, taxRate: 18 }, 3)
    expect(line.totalGross).toBe(999.99)
    expect(line.totalNet).toBe(847.45)
    expect(line.taxAmount).toBe(152.54)
  })

  it('adds shipping to the grand total and keeps 2 decimals', () => {
    const a = priceLine({ priceId: 'a', unitGross: 0.1, unitNet: 0.1, taxRate: 0 }, 3)
    const b = priceLine({ priceId: 'b', unitGross: 0.2, unitNet: 0.2, taxRate: 0 }, 1)
    const totals = summarizeTotals([a, b], 79)
    expect(totals).toEqual({ subtotal: 0.5, shipping: 79, tax: 0, grandTotal: 79.5 })
  })

  it('ignores negative shipping', () => {
    expect(summarizeTotals([], -10).grandTotal).toBe(0)
  })

  it('re-pricing ignores whatever price the client believed', () => {
    // The pricing API has no input for a client price: totals only depend on catalog rows.
    const unit = resolveUnitPrice(row({ unitPriceGross: 2499 }))!
    expect(priceLine(unit, 2).totalGross).toBe(4998)
  })
})

describe('quantity rules', () => {
  const rules = { minOrderQty: 2, maxOrderQty: 10, orderQtyIncrement: 2 }
  it('enforces minimum, maximum, step and the hard cap', () => {
    expect(checkQuantity(1, rules, 20)).toBe('quantity_below_minimum')
    expect(checkQuantity(12, rules, 20)).toBe('quantity_above_maximum')
    expect(checkQuantity(3, rules, 20)).toBe('quantity_increment')
    expect(checkQuantity(4, rules, 20)).toBeNull()
    expect(checkQuantity(25, { minOrderQty: null, maxOrderQty: null, orderQtyIncrement: null }, 20)).toBe('quantity_above_maximum')
  })
})
