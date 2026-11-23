import { beforeEach, describe, expect, it, jest } from '@jest/globals'

/**
 * Order reads (FEAT-006): an order is visible only to the customer who placed
 * it, the customer whose linked CRM person owns it, or a guest holding the
 * order's access token. Everything else is "not found" — including orders of
 * another tenant/organization.
 */

type Row = Record<string, unknown>

class MockStorefrontCheckout {}
class MockSalesOrder {}
class MockSalesOrderLine {}

const readLinkedPersonId = jest.fn<(...args: unknown[]) => Promise<string | null>>()

jest.mock('../data/entities', () => ({ StorefrontCheckout: MockStorefrontCheckout }))
jest.mock('@open-mercato/core/modules/sales/data/entities', () => ({ SalesOrder: MockSalesOrder, SalesOrderLine: MockSalesOrderLine }))
jest.mock('../lib/customerLink', () => ({ readLinkedPersonId: (...args: unknown[]) => readLinkedPersonId(...args) }))
jest.mock('@open-mercato/shared/lib/encryption/find', () => ({
  findOneWithDecryption: async (em: FakeEm, entity: unknown, where: Row) => em.query(entity, where)[0] ?? null,
  findWithDecryption: async (em: FakeEm, entity: unknown, where: Row) => em.query(entity, where),
}))

import { listCustomerOrders, loadAccessibleOrder, resolveRequester, serializeOrderDetail } from '../lib/orders'
import { ORDER_ACCESS_COOKIE } from '../lib/constants'
import { generateToken, hashToken, serializeOrderAccess } from '../lib/tokens'

const TENANT = '11111111-1111-4111-8111-111111111111'
const ORG = '22222222-2222-4222-8222-222222222222'
const OTHER_ORG = '44444444-4444-4444-8444-444444444444'
const SCOPE = { tenantId: TENANT, organizationId: ORG }
const ORDER_ID = 'dddddddd-0000-4000-8000-000000000001'
const OTHER_ORDER_ID = 'dddddddd-0000-4000-8000-000000000002'
const CUSTOMER_ID = 'cccccccc-0000-4000-8000-000000000001'
const OTHER_CUSTOMER_ID = 'cccccccc-0000-4000-8000-000000000002'

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, expected]) => {
    if (key === '$or' || key === 'fields') return true
    if (expected && typeof expected === 'object') {
      const op = expected as Row
      if (Array.isArray(op.$in)) return (op.$in as unknown[]).includes(row[key])
      if ('$ne' in op) return (row[key] ?? null) !== op.$ne
      return true
    }
    return (row[key] ?? null) === expected
  })
}

class FakeEm {
  orders: Row[] = []
  checkouts: Row[] = []
  lines: Row[] = []
  calls: Array<{ entity: unknown; where: Row }> = []

  store(entity: unknown) {
    if (entity === MockSalesOrder) return this.orders
    if (entity === MockStorefrontCheckout) return this.checkouts
    if (entity === MockSalesOrderLine) return this.lines
    return []
  }

  query(entity: unknown, where: Row): Row[] {
    this.calls.push({ entity, where })
    let rows = this.store(entity).filter((row) => matches(row, where))
    const or = where.$or as Row[] | undefined
    if (or) rows = rows.filter((row) => or.some((clause) => matches(row, clause)))
    return rows
  }

  find = jest.fn(async (entity: unknown, where: Row) => this.query(entity, where))
  count = jest.fn(async (entity: unknown, where: Row) => this.query(entity, where).length)
}

let em: FakeEm

function order(overrides: Row = {}): Row {
  return {
    id: ORDER_ID,
    tenantId: TENANT,
    organizationId: ORG,
    deletedAt: null,
    orderNumber: 'SO-1001',
    status: null,
    paymentStatus: 'pending',
    currencyCode: 'INR',
    customerEntityId: 'person-1',
    subtotalGrossAmount: '1047.0000',
    shippingGrossAmount: '49.0000',
    taxTotalAmount: '152.2400',
    discountTotalAmount: '0',
    grandTotalGrossAmount: '1047.0000',
    paidTotalAmount: '0',
    outstandingAmount: '1047.0000',
    shippingMethodCode: 'standard',
    placedAt: new Date('2026-10-05T10:00:00Z'),
    lineItemCount: 1,
    shippingAddressSnapshot: { name: 'Asha Rao', phone: '+919876543210', addressLine1: '12 MG Road', city: 'Bengaluru', region: 'Karnataka', postalCode: '560001', country: 'IN' },
    billingAddressSnapshot: null,
    ...overrides,
  }
}

function checkout(overrides: Row = {}): Row {
  return {
    id: `checkout-${Math.random()}`,
    tenantId: TENANT,
    organizationId: ORG,
    orderId: ORDER_ID,
    customerUserId: null,
    guestAccessTokenHash: null,
    paymentStatus: 'pending',
    gatewayTransactionId: null,
    providerKey: 'razorpay',
    ...overrides,
  }
}

const anonymous = { customerUserId: null, personEntityId: null, guestTokens: new Map<string, string>() }

beforeEach(() => {
  em = new FakeEm()
  readLinkedPersonId.mockReset()
  readLinkedPersonId.mockResolvedValue(null)
})

describe('loadAccessibleOrder', () => {
  it('lets the customer who placed the order read it', async () => {
    em.orders.push(order())
    em.checkouts.push(checkout({ customerUserId: CUSTOMER_ID }))
    const result = await loadAccessibleOrder(em as never, SCOPE, ORDER_ID, { ...anonymous, customerUserId: CUSTOMER_ID })
    expect(result?.order.id).toBe(ORDER_ID)
  })

  it('hides the order from a different signed-in customer', async () => {
    em.orders.push(order())
    em.checkouts.push(checkout({ customerUserId: CUSTOMER_ID }))
    expect(await loadAccessibleOrder(em as never, SCOPE, ORDER_ID, { ...anonymous, customerUserId: OTHER_CUSTOMER_ID })).toBeNull()
  })

  it("lets a customer read orders of their linked CRM person (e.g. placed as guest before signing up)", async () => {
    em.orders.push(order({ customerEntityId: 'person-7' }))
    em.checkouts.push(checkout())
    expect(await loadAccessibleOrder(em as never, SCOPE, ORDER_ID, { ...anonymous, customerUserId: CUSTOMER_ID, personEntityId: 'person-7' })).not.toBeNull()
    expect(await loadAccessibleOrder(em as never, SCOPE, ORDER_ID, { ...anonymous, customerUserId: CUSTOMER_ID, personEntityId: 'person-8' })).toBeNull()
  })

  it('lets a guest read the order with the matching access token only', async () => {
    const token = generateToken()
    em.orders.push(order())
    em.checkouts.push(checkout({ guestAccessTokenHash: hashToken(token) }))
    expect(await loadAccessibleOrder(em as never, SCOPE, ORDER_ID, { ...anonymous, guestTokens: new Map([[ORDER_ID, token]]) })).not.toBeNull()
    expect(await loadAccessibleOrder(em as never, SCOPE, ORDER_ID, { ...anonymous, guestTokens: new Map([[ORDER_ID, generateToken()]]) })).toBeNull()
    expect(await loadAccessibleOrder(em as never, SCOPE, ORDER_ID, anonymous)).toBeNull()
  })

  it("a guest token for one order never opens another order", async () => {
    const token = generateToken()
    em.orders.push(order(), order({ id: OTHER_ORDER_ID }))
    em.checkouts.push(checkout({ guestAccessTokenHash: hashToken(token) }), checkout({ orderId: OTHER_ORDER_ID, guestAccessTokenHash: hashToken(generateToken()) }))
    expect(await loadAccessibleOrder(em as never, SCOPE, OTHER_ORDER_ID, { ...anonymous, guestTokens: new Map([[OTHER_ORDER_ID, token]]) })).toBeNull()
  })

  it('accepts an upper-case order id in the URL for a guest token stored lower-case', async () => {
    const token = generateToken()
    const upper = ORDER_ID.toUpperCase()
    em.orders.push(order({ id: upper }))
    em.checkouts.push(checkout({ orderId: upper, guestAccessTokenHash: hashToken(token) }))
    expect(await loadAccessibleOrder(em as never, SCOPE, upper, { ...anonymous, guestTokens: new Map([[ORDER_ID, token]]) })).not.toBeNull()
  })

  it("never returns an order of another organization, even to its owner", async () => {
    em.orders.push(order({ organizationId: OTHER_ORG }))
    em.checkouts.push(checkout({ organizationId: OTHER_ORG, customerUserId: CUSTOMER_ID }))
    expect(await loadAccessibleOrder(em as never, SCOPE, ORDER_ID, { ...anonymous, customerUserId: CUSTOMER_ID })).toBeNull()
    expect(em.calls[0]!.where).toMatchObject({ id: ORDER_ID, tenantId: TENANT, organizationId: ORG, deletedAt: null })
  })

  it('ignores ledger rows of another organization when deciding ownership', async () => {
    em.orders.push(order())
    em.checkouts.push(checkout({ organizationId: OTHER_ORG, customerUserId: CUSTOMER_ID }))
    expect(await loadAccessibleOrder(em as never, SCOPE, ORDER_ID, { ...anonymous, customerUserId: CUSTOMER_ID })).toBeNull()
  })

  it('treats soft-deleted orders as not found', async () => {
    em.orders.push(order({ deletedAt: new Date() }))
    em.checkouts.push(checkout({ customerUserId: CUSTOMER_ID }))
    expect(await loadAccessibleOrder(em as never, SCOPE, ORDER_ID, { ...anonymous, customerUserId: CUSTOMER_ID })).toBeNull()
  })
})

describe('resolveRequester', () => {
  it('reads guest tokens from the access cookie and skips the CRM lookup for guests', async () => {
    const token = generateToken()
    const cookie = serializeOrderAccess([], { orderId: ORDER_ID, token })
    const req = new Request('http://x', { headers: { cookie: `${ORDER_ACCESS_COOKIE}=${encodeURIComponent(cookie)}` } })
    const requester = await resolveRequester(em as never, req, { scope: SCOPE, customer: null, source: 'shop' })
    expect(requester.guestTokens.get(ORDER_ID)).toBe(token)
    expect(requester.customerUserId).toBeNull()
    expect(readLinkedPersonId).not.toHaveBeenCalled()
  })

  it('resolves the linked CRM person of a signed-in customer within the shop scope', async () => {
    readLinkedPersonId.mockResolvedValue('person-1')
    const requester = await resolveRequester(em as never, new Request('http://x'), {
      scope: SCOPE,
      customer: { sub: CUSTOMER_ID } as never,
      source: 'customer',
    })
    expect(requester).toMatchObject({ customerUserId: CUSTOMER_ID, personEntityId: 'person-1' })
    expect(readLinkedPersonId).toHaveBeenCalledWith(em, SCOPE, CUSTOMER_ID)
  })
})

describe('serializeOrderDetail', () => {
  it('shows product subtotal, shipping and totals, gift options per line and the mirrored payment status', async () => {
    const placed = order()
    em.lines.push(
      {
        id: 'line-1',
        order: ORDER_ID,
        tenantId: TENANT,
        organizationId: ORG,
        deletedAt: null,
        kind: 'product',
        productId: 'p1',
        productVariantId: null,
        name: 'Photo Mug',
        quantity: '2',
        unitPriceGross: '499.0000',
        totalGrossAmount: '998.0000',
        catalogSnapshot: { sku: 'MUG', handle: 'photo-mug', imageUrl: '/mug.png' },
        metadata: { source: 'storefront', gift: { giftWrap: true, giftMessage: 'Happy birthday' } },
      },
      { id: 'line-ship', order: ORDER_ID, tenantId: TENANT, organizationId: ORG, deletedAt: null, kind: 'shipping', name: 'Shipping', quantity: 1 },
    )
    const detail = await serializeOrderDetail(em as never, SCOPE, placed as never, [
      checkout({ paymentStatus: 'captured', gatewayTransactionId: 'txn-1' }) as never,
    ])
    expect(detail).toMatchObject({
      id: ORDER_ID,
      orderNumber: 'SO-1001',
      status: null,
      paymentStatus: 'captured',
      subtotal: 998,
      shippingTotal: 49,
      taxTotal: 152.24,
      grandTotal: 1047,
      shippingMethod: 'standard',
      payment: { providerKey: 'razorpay', transactionId: 'txn-1', status: 'captured' },
      shippingAddress: { fullName: 'Asha Rao', line1: '12 MG Road', postalCode: '560001', state: 'Karnataka' },
      billingAddress: null,
    })
    expect(detail.lines).toEqual([
      expect.objectContaining({ id: 'line-1', quantity: 2, unitPriceGross: 499, totalGross: 998, giftWrap: true, giftMessage: 'Happy birthday', slug: 'photo-mug', sku: 'MUG' }),
    ])
  })

  it('reports pending_payment / payment_failed while the order has no workflow status', async () => {
    const pending = await serializeOrderDetail(em as never, SCOPE, order() as never, [checkout() as never])
    expect(pending.status).toBe('pending_payment')
    const failed = await serializeOrderDetail(em as never, SCOPE, order() as never, [checkout({ paymentStatus: 'failed', gatewayTransactionId: 't' }) as never])
    expect(failed.status).toBe('payment_failed')
  })
})

describe('listCustomerOrders', () => {
  it('returns nothing for guests (order history requires sign-in)', async () => {
    em.orders.push(order())
    expect(await listCustomerOrders(em as never, SCOPE, anonymous, 1, 20)).toEqual({ items: [], total: 0, page: 1, pageSize: 20 })
    expect(em.find).not.toHaveBeenCalled()
  })

  it("lists the customer's own orders and their CRM person's orders, never other customers'", async () => {
    em.orders.push(order(), order({ id: OTHER_ORDER_ID, customerEntityId: 'someone-else', orderNumber: 'SO-1002' }), order({ id: 'p-order', customerEntityId: 'person-7', orderNumber: 'SO-1003' }))
    em.checkouts.push(checkout({ customerUserId: CUSTOMER_ID }), checkout({ orderId: OTHER_ORDER_ID, customerUserId: OTHER_CUSTOMER_ID }))
    const result = await listCustomerOrders(em as never, SCOPE, { ...anonymous, customerUserId: CUSTOMER_ID, personEntityId: 'person-7' }, 1, 20)
    expect(result.items.map((item) => item.orderNumber).sort()).toEqual(['SO-1001', 'SO-1003'])
    expect(result.total).toBe(2)
    expect(result.items[0]).toMatchObject({ currencyCode: 'INR', grandTotalGrossAmount: 1047, paymentStatus: 'pending', status: 'pending_payment' })
  })

  it('scopes every query to the shop', async () => {
    em.checkouts.push(checkout({ customerUserId: CUSTOMER_ID }))
    em.orders.push(order())
    await listCustomerOrders(em as never, SCOPE, { ...anonymous, customerUserId: CUSTOMER_ID }, 1, 20)
    for (const call of em.calls) expect(call.where).toMatchObject({ tenantId: TENANT, organizationId: ORG })
  })
})
