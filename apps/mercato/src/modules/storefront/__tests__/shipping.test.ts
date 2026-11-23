import { beforeEach, describe, expect, it, jest } from '@jest/globals'

/**
 * Shipping (FEAT-004 req. 1): delivery options come from the shop's native
 * sales shipping methods; a provider-less method charges its base rate as an
 * explicit order adjustment, a provider-backed one is quoted by the native
 * sales calculator so checkout charges exactly what the option showed.
 */

type Row = Record<string, unknown>

class MockShippingMethod {}
const getShippingProvider = jest.fn<(key: string) => unknown>()

jest.mock('@open-mercato/core/modules/sales/data/entities', () => ({ SalesShippingMethod: MockShippingMethod }))
jest.mock('@open-mercato/core/modules/sales/lib/providers/registry', () => ({
  getShippingProvider: (key: string) => getShippingProvider(key),
}))

import { listShippingMethods, manualShippingAdjustment, quoteShipping, type ShippingMethodRecord } from '../lib/shipping'

const TENANT = '11111111-1111-4111-8111-111111111111'
const ORG = '22222222-2222-4222-8222-222222222222'
const SCOPE = { tenantId: TENANT, organizationId: ORG }

function method(overrides: Partial<ShippingMethodRecord> = {}): ShippingMethodRecord {
  return {
    id: 'm-standard',
    code: 'standard',
    name: 'Standard',
    description: null,
    providerKey: null,
    carrierCode: null,
    serviceLevel: null,
    estimatedTransitDays: 5,
    baseRateNet: 49,
    baseRateGross: 49,
    currencyCode: 'INR',
    metadata: null,
    ...overrides,
  }
}

const quoteLines = [
  { productId: 'p1', productVariantId: null, quantity: 2, unitPriceNet: 422.88, unitPriceGross: 499, taxRate: 18, taxAmount: 152.24, totalGrossAmount: 998 },
]

beforeEach(() => {
  getShippingProvider.mockReset()
  getShippingProvider.mockReturnValue(undefined)
})

describe('listShippingMethods', () => {
  it('reads active INR (or currency-less) methods of this shop only and maps decimal strings', async () => {
    const em = {
      find: jest.fn(async (_entity: unknown, _where: Row) => [
        { id: 'm1', code: 'standard', name: 'Standard', baseRateNet: '41.5254', baseRateGross: '49.0000', currencyCode: 'INR', estimatedTransitDays: 5 },
        { id: 'm2', code: 'express', name: 'Express', baseRateNet: '149.0000', baseRateGross: null, currencyCode: null },
      ]),
    }
    const methods = await listShippingMethods(em as never, SCOPE)
    expect(em.find).toHaveBeenCalledWith(
      MockShippingMethod,
      expect.objectContaining({ tenantId: TENANT, organizationId: ORG, deletedAt: null, isActive: true, $or: [{ currencyCode: null }, { currencyCode: 'INR' }] }),
      expect.anything(),
    )
    expect(methods.map((entry) => [entry.code, entry.baseRateNet, entry.baseRateGross])).toEqual([
      ['standard', 41.5254, 49],
      ['express', 149, 149],
    ])
  })
})

describe('manualShippingAdjustment', () => {
  it('charges the base rate of a provider-less method as an order-level shipping adjustment', () => {
    expect(manualShippingAdjustment(method({ baseRateGross: 149, baseRateNet: 126.27, code: 'express', name: 'Express' }))).toMatchObject({
      scope: 'order',
      kind: 'shipping',
      code: 'express',
      label: 'Express',
      amountGross: 149,
      amountNet: 126.27,
      currencyCode: 'INR',
    })
  })

  it('rounds to paise, never lets net exceed gross, and skips free / negative rates', () => {
    expect(manualShippingAdjustment(method({ baseRateGross: 49.999, baseRateNet: 60 }))).toMatchObject({ amountGross: 50, amountNet: 50 })
    expect(manualShippingAdjustment(method({ baseRateGross: 0, baseRateNet: 0 }))).toBeNull()
    expect(manualShippingAdjustment(method({ baseRateGross: -10, baseRateNet: -10 }))).toBeNull()
  })

  it('defers to the provider when the method has a calculating provider', () => {
    getShippingProvider.mockReturnValue({ calculate: () => undefined })
    expect(manualShippingAdjustment(method({ providerKey: 'flat-rate' }))).toBeNull()
  })

  it('treats an unknown provider key as provider-less (charges the base rate)', () => {
    expect(manualShippingAdjustment(method({ providerKey: 'missing-provider' }))?.amountGross).toBe(49)
  })
})

describe('quoteShipping', () => {
  it('quotes the base rate without the calculator for provider-less methods', async () => {
    const container = { resolve: jest.fn() }
    expect(await quoteShipping(container as never, SCOPE, method(), quoteLines)).toBe(49)
    expect(await quoteShipping(container as never, SCOPE, method({ baseRateGross: 0 }), quoteLines)).toBe(0)
    expect(container.resolve).not.toHaveBeenCalled()
  })

  it('quotes provider methods through the native calculator with the shop scope, in INR', async () => {
    getShippingProvider.mockReturnValue({ calculate: () => undefined })
    const calculateDocumentTotals = jest.fn(async (_input: Row) => ({ totals: { shippingGrossAmount: 79.0049 } }))
    const container = { resolve: jest.fn(() => ({ calculateDocumentTotals })) }
    const amount = await quoteShipping(
      container as never,
      SCOPE,
      method({ providerKey: 'flat-rate', metadata: { providerSettings: { rates: [] } } }),
      quoteLines,
    )
    expect(amount).toBe(79)
    expect(container.resolve).toHaveBeenCalledWith('salesCalculationService')
    const input = calculateDocumentTotals.mock.calls[0]![0] as Row
    expect(input).toMatchObject({
      documentKind: 'order',
      context: {
        tenantId: TENANT,
        organizationId: ORG,
        currencyCode: 'INR',
        metadata: { shippingMethod: expect.objectContaining({ providerKey: 'flat-rate', providerSettings: { rates: [] } }), paymentMethod: null },
      },
    })
    expect((input.lines as Row[])[0]).toMatchObject({ kind: 'product', currencyCode: 'INR', quantity: 2, totalGrossAmount: 998, taxAmount: 152.24 })
  })
})
