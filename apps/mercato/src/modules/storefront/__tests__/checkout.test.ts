import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'
import { randomUUID } from 'node:crypto'

/**
 * Order placement and payment retry (FEAT-004):
 *  - totals are computed on the server and stored in integer paise;
 *  - the Idempotency-Key ledger never lets one key create two orders, replays
 *    return the same order + payment session, and a different body is a 409;
 *  - a failed/declined payment keeps the order and can be retried on it;
 *  - the gateway receives decimal major units and a stable idempotency key;
 *  - every read/write is scoped to the shop resolved server-side.
 *
 * Collaborators (cart, catalog, shipping, CRM link, command bus, gateway) are
 * mocked; the checkout ledger lives in an in-memory fake EntityManager.
 */

type Row = Record<string, unknown>

class MockStorefrontCheckout {}
class MockSalesOrder {}
class MockSalesPaymentMethod {}

const resolveCart = jest.fn<(...args: unknown[]) => Promise<{ cart: Row | null; cookies: unknown[] }>>()
const cartLineInputs = jest.fn<(...args: unknown[]) => Promise<Row[]>>()
const markCartConverted = jest.fn<(...args: unknown[]) => Promise<void>>()
const repriceLines = jest.fn<(...args: unknown[]) => Promise<{ lines: Row[]; issues: Row[] }>>()
const listShippingMethods = jest.fn<(...args: unknown[]) => Promise<Row[]>>()
const quoteShipping = jest.fn<(...args: unknown[]) => Promise<number>>()
const ensureCustomerPerson = jest.fn<(...args: unknown[]) => Promise<string | null>>()
const findOrCreatePerson = jest.fn<(...args: unknown[]) => Promise<string | null>>()
const executeCommand = jest.fn<(container: unknown, id: string, input: Row, ctx: unknown) => Promise<unknown>>()
const findSalesDictionaryEntryId = jest.fn<(...args: unknown[]) => Promise<string | null>>()
const loadAccessibleOrder = jest.fn<(...args: unknown[]) => Promise<{ order: Row; checkouts: Row[] } | null>>()
const resolveRequester = jest.fn<(...args: unknown[]) => Promise<unknown>>()
const syncCheckoutPayment = jest.fn<(...args: unknown[]) => Promise<void>>()
const emitStorefrontEvent = jest.fn<(...args: unknown[]) => Promise<void>>()

jest.mock('@open-mercato/shared/lib/di/container', () => ({ createRequestContainer: jest.fn() }))
jest.mock('../data/entities', () => ({ StorefrontCheckout: MockStorefrontCheckout }))
jest.mock('@open-mercato/core/modules/sales/data/entities', () => ({ SalesOrder: MockSalesOrder, SalesPaymentMethod: MockSalesPaymentMethod }))
jest.mock('../lib/cart', () => ({
  resolveCart: (...args: unknown[]) => resolveCart(...args),
  readCartOwner: (_req: unknown, customer: unknown) => ({ customer, token: null }),
  cartLineInputs: (...args: unknown[]) => cartLineInputs(...args),
  markCartConverted: (...args: unknown[]) => markCartConverted(...args),
}))
jest.mock('../lib/catalog', () => ({ repriceLines: (...args: unknown[]) => repriceLines(...args) }))
jest.mock('../lib/shipping', () => ({
  listShippingMethods: (...args: unknown[]) => listShippingMethods(...args),
  quoteShipping: (...args: unknown[]) => quoteShipping(...args),
  manualShippingAdjustment: (method: Row) => ({ code: method.code, label: method.name, amountNet: 49, amountGross: 49, metadata: null }),
}))
jest.mock('../lib/customerLink', () => ({
  ensureCustomerPerson: (...args: unknown[]) => ensureCustomerPerson(...args),
  findOrCreatePerson: (...args: unknown[]) => findOrCreatePerson(...args),
  normalizeIndianPhone: (phone: string) => `+91${phone.slice(-10)}`,
}))
jest.mock('../lib/system', () => ({
  executeCommand: (...args: [unknown, string, Row, unknown]) => executeCommand(...args),
  findSalesDictionaryEntryId: (...args: unknown[]) => findSalesDictionaryEntryId(...args),
  systemCommandContext: (_container: unknown, scope: Row) => ({ systemActor: true, selectedOrganizationId: scope.organizationId }),
}))
jest.mock('../lib/orders', () => ({
  loadAccessibleOrder: (...args: unknown[]) => loadAccessibleOrder(...args),
  resolveRequester: (...args: unknown[]) => resolveRequester(...args),
}))
jest.mock('../lib/paymentSync', () => ({ syncCheckoutPayment: (...args: unknown[]) => syncCheckoutPayment(...args) }))
jest.mock('../events', () => ({ emitStorefrontEvent: (...args: unknown[]) => emitStorefrontEvent(...args) }))
jest.mock('@open-mercato/shared/lib/encryption/find', () => ({
  findOneWithDecryption: async (em: FakeEm, entity: unknown, where: Row) => em.findOneSync(entity, where),
}))

import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { placeOrder, retryOrderPayment } from '../lib/checkout'
import { CHECKOUT_CLAIM_STALE_MS, ORDER_ACCESS_COOKIE } from '../lib/constants'
import { StorefrontError } from '../lib/http'
import { hashToken, parseOrderAccess } from '../lib/tokens'
import { placeOrderSchema } from '../data/validators'

const TENANT = '11111111-1111-4111-8111-111111111111'
const ORG = '22222222-2222-4222-8222-222222222222'
const OTHER_ORG = '44444444-4444-4444-8444-444444444444'
const SCOPE = { tenantId: TENANT, organizationId: ORG }
const PRODUCT = '6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b'
const ORDER_ID = 'dddddddd-0000-4000-8000-000000000001'
const SHIPPING_METHOD_ID = 'eeeeeeee-0000-4000-8000-000000000001'
const KEY = 'checkout-key-0001-abcdef'
const translate = (_key: string, fallback: string, vars?: Record<string, string | number>) =>
  vars ? fallback.replace(/\{(\w+)\}/g, (_m, name: string) => String(vars[name] ?? '')) : fallback

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, expected]) => {
    if (key === '$or') return true
    if (expected !== null && typeof expected === 'object' && !(expected instanceof Date)) return true
    const actual = row[key] ?? null
    if (expected instanceof Date) return actual instanceof Date && actual.getTime() === expected.getTime()
    return actual === expected
  })
}

class FakeEm {
  checkouts: Row[] = []
  orders: Row[] = []
  flush = jest.fn(async () => undefined)
  clear = jest.fn(() => undefined)
  refresh = jest.fn(async () => undefined)
  fork = () => this

  store(entity: unknown): Row[] {
    if (entity === MockStorefrontCheckout) return this.checkouts
    if (entity === MockSalesOrder) return this.orders
    return []
  }

  findOneSync(entity: unknown, where: Row): Row | null {
    return this.store(entity).find((row) => matches(row, where)) ?? null
  }

  findOne = jest.fn(async (entity: unknown, where: Row) => this.findOneSync(entity, where))

  create = jest.fn((entity: unknown, data: Row) => {
    const row = { id: randomUUID(), ...data }
    this.store(entity).push(row)
    return row
  })

  nativeUpdate = jest.fn(async (entity: unknown, where: Row, data: Row) => {
    const rows = this.store(entity).filter((row) => matches(row, where))
    for (const row of rows) Object.assign(row, data)
    return rows.length
  })

  nativeDelete = jest.fn(async (entity: unknown, where: Row) => {
    const store = this.store(entity)
    const doomed = store.filter((row) => matches(row, where))
    for (const row of doomed) store.splice(store.indexOf(row), 1)
    return doomed.length
  })
}

type Gateway = {
  createPaymentSession: jest.Mock<(input: Row) => Promise<{ transaction: Row; session: Row }>>
  findTransaction: jest.Mock<(id: string, scope: unknown) => Promise<Row | null>>
  transactions: Map<string, Row>
}

function makeGateway(): Gateway {
  const transactions = new Map<string, Row>()
  const gateway: Gateway = {
    transactions,
    createPaymentSession: jest.fn(async (input: Row) => {
      const id = `txn-${transactions.size + 1}`
      const transaction = {
        id,
        providerKey: input.providerKey,
        paymentId: input.paymentId,
        unifiedStatus: 'pending',
        providerSessionId: `order_rzp_${transactions.size + 1}`,
        gatewayMetadata: { clientSession: { type: 'embedded', keyId: 'rzp_test_x', orderId: `order_rzp_${transactions.size + 1}` } },
      }
      transactions.set(id, transaction)
      return {
        transaction,
        session: { sessionId: transaction.providerSessionId, status: 'pending', clientSession: transaction.gatewayMetadata.clientSession },
      }
    }),
    findTransaction: jest.fn(async (id: string) => transactions.get(id) ?? null),
  }
  return gateway
}

let em: FakeEm
let gateway: Gateway
let container: { resolve: (name: string) => unknown }

const shippingAddress = {
  fullName: 'Asha Rao',
  phone: '9876543210',
  line1: '12 MG Road',
  line2: '',
  city: 'Bengaluru',
  state: 'Karnataka',
  postalCode: '560001',
  country: 'IN',
}

function input(overrides: Row = {}) {
  return placeOrderSchema.parse({
    email: 'asha@example.com',
    lines: [{ productId: PRODUCT, variantId: null, quantity: 2, giftWrap: true, giftMessage: 'Happy birthday' }],
    shippingAddress,
    billingSameAsShipping: true,
    shippingMethodCode: 'standard',
    paymentProvider: 'razorpay',
    successUrl: 'http://localhost:3001/order/{orderId}/confirmation',
    cancelUrl: 'http://localhost:3001/checkout',
    ...overrides,
  })
}

const GUEST = { scope: SCOPE, customer: null, source: 'shop' as const }
const CUSTOMER = {
  scope: SCOPE,
  customer: { sub: 'cccccccc-0000-4000-8000-000000000001', email: 'asha@example.com', displayName: 'Asha Rao', tenantId: TENANT, orgId: ORG },
  source: 'customer' as const,
}

function request(cookie?: string) {
  return new Request('http://localhost:3000/api/storefront/checkout/orders', { method: 'POST', headers: cookie ? { cookie } : {} })
}

function pricedLine(request: Row, index: number): Row {
  return {
    index,
    productId: request.productId,
    variantId: null,
    quantity: request.quantity,
    giftWrap: request.giftWrap === true,
    giftMessage: request.giftMessage ?? null,
    title: 'Photo Mug',
    variantName: null,
    sku: 'MUG',
    handle: 'photo-mug',
    imageUrl: null,
    isCustomizable: false,
    maxQuantity: 20,
    amounts: {
      priceId: 'price-1',
      unitNet: 422.8814,
      unitGross: 499,
      taxRate: 18,
      quantity: request.quantity,
      totalGross: 499 * (request.quantity as number),
      totalNet: 845.76,
      taxAmount: 152.24,
    },
  }
}

function salesOrder(overrides: Row = {}): Row {
  return {
    id: ORDER_ID,
    tenantId: TENANT,
    organizationId: ORG,
    deletedAt: null,
    orderNumber: 'SO-1001',
    currencyCode: 'INR',
    subtotalGrossAmount: '1047.0000',
    shippingGrossAmount: '49.0000',
    taxTotalAmount: '152.2400',
    grandTotalGrossAmount: '1047.0000',
    outstandingAmount: '1047.0000',
    paidTotalAmount: '0',
    refundedTotalAmount: '0',
    customerEntityId: 'person-1',
    ...overrides,
  }
}

async function place(shopper: typeof GUEST | typeof CUSTOMER = GUEST, overrides: Row = {}, key = KEY, req = request()) {
  return placeOrder({ req, container: container as never, shopper: shopper as never, input: input(overrides), idempotencyKey: key, translate })
}

const ORIGINAL_ENV = process.env.NODE_ENV

beforeEach(() => {
  em = new FakeEm()
  gateway = makeGateway()
  container = {
    resolve: (name: string) => {
      if (name === 'em') return em
      if (name === 'paymentGatewayService') return gateway
      throw new Error(`unexpected service ${name}`)
    },
  }
  for (const mock of [
    resolveCart,
    cartLineInputs,
    markCartConverted,
    repriceLines,
    listShippingMethods,
    quoteShipping,
    ensureCustomerPerson,
    findOrCreatePerson,
    executeCommand,
    findSalesDictionaryEntryId,
    loadAccessibleOrder,
    resolveRequester,
    syncCheckoutPayment,
    emitStorefrontEvent,
  ]) {
    mock.mockReset()
  }
  resolveCart.mockResolvedValue({ cart: null, cookies: [] })
  repriceLines.mockImplementation(async (_em, _scope, requests) => ({ lines: (requests as Row[]).map(pricedLine), issues: [] }))
  listShippingMethods.mockResolvedValue([
    { id: SHIPPING_METHOD_ID, code: 'standard', name: 'Standard', baseRateGross: 49, baseRateNet: 49, providerKey: null },
  ])
  quoteShipping.mockResolvedValue(49)
  findOrCreatePerson.mockResolvedValue('person-1')
  ensureCustomerPerson.mockResolvedValue('person-2')
  findSalesDictionaryEntryId.mockResolvedValue('dict-pending')
  emitStorefrontEvent.mockResolvedValue(undefined)
  syncCheckoutPayment.mockResolvedValue(undefined)
  markCartConverted.mockResolvedValue(undefined)
  executeCommand.mockImplementation(async (_container, id, commandInput) => {
    if (id === 'sales.orders.create') {
      em.orders.push(salesOrder({ externalReference: commandInput.externalReference }))
      return { orderId: ORDER_ID }
    }
    return {}
  })
  process.env.NODE_ENV = 'test'
})

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_ENV
})

function orderCreateCalls() {
  return executeCommand.mock.calls.filter(([, id]) => id === 'sales.orders.create')
}

describe('placeOrder — validation before anything is written', () => {
  it('rejects return URLs outside the allowed storefront origins (no open redirect)', async () => {
    await expect(place(GUEST, { successUrl: 'https://evil.test/{orderId}' })).rejects.toMatchObject({ status: 422, code: 'return_url_not_allowed' })
    expect(em.checkouts).toHaveLength(0)
    expect(orderCreateCalls()).toHaveLength(0)
  })

  it('rejects an empty cart', async () => {
    await expect(place(GUEST, { lines: undefined })).rejects.toMatchObject({ status: 422, code: 'cart_empty' })
    expect(em.checkouts).toHaveLength(0)
  })

  it('rejects lines with catalog issues and reports them', async () => {
    repriceLines.mockResolvedValueOnce({ lines: [], issues: [{ index: 0, productId: PRODUCT, variantId: null, code: 'price_unavailable' }] })
    const error = await place().catch((err: unknown) => err)
    expect(error).toMatchObject({ status: 422, code: 'cart_invalid' })
    expect((error as StorefrontError).extra).toEqual({ details: [{ index: 0, productId: PRODUCT, variantId: null, code: 'price_unavailable' }] })
    expect(em.checkouts).toHaveLength(0)
  })

  it('rejects an unknown delivery option', async () => {
    await expect(place(GUEST, { shippingMethodCode: 'teleport' })).rejects.toMatchObject({ status: 422, code: 'shipping_method_unavailable' })
    expect(em.checkouts).toHaveLength(0)
  })

  it('checks out the server cart when the body has no lines', async () => {
    const cart = { id: 'cart-1' }
    resolveCart.mockResolvedValue({ cart, cookies: [] })
    cartLineInputs.mockResolvedValue([{ productId: PRODUCT, variantId: null, quantity: 1, giftWrap: false, giftMessage: null }])
    const result = await place(GUEST, { lines: undefined })
    expect(result.status).toBe(201)
    expect(repriceLines).toHaveBeenCalledWith(em, SCOPE, [expect.objectContaining({ productId: PRODUCT, quantity: 1 })])
    expect(markCartConverted).toHaveBeenCalledWith(em, cart, ORDER_ID)
  })
})

describe('placeOrder — happy path (guest, Razorpay)', () => {
  it('creates the sales order with server prices inside the resolved shop', async () => {
    await place()
    const [[, , orderInput, ctx]] = orderCreateCalls()
    expect(orderInput).toMatchObject({
      tenantId: TENANT,
      organizationId: ORG,
      currencyCode: 'INR',
      customerEntityId: 'person-1',
      shippingMethodId: SHIPPING_METHOD_ID,
      paymentStatusEntryId: 'dict-pending',
      externalReference: `storefront:${em.checkouts[0]!.id}`,
      metadata: expect.objectContaining({ source: 'storefront', paymentProvider: 'razorpay', customerUserId: null, contactEmail: 'asha@example.com' }),
      adjustments: [expect.objectContaining({ kind: 'shipping', amountGross: 49, currencyCode: 'INR' })],
    })
    const lines = (orderInput as Row).lines as Row[]
    expect(lines).toEqual([
      expect.objectContaining({
        lineNumber: 1,
        productId: PRODUCT,
        quantity: 2,
        priceMode: 'gross',
        unitPriceGross: 499,
        totalGrossAmount: 998,
        metadata: { source: 'storefront', gift: { giftWrap: true, giftMessage: 'Happy birthday' } },
      }),
    ])
    expect((orderInput as Row).shippingAddressSnapshot).toMatchObject({ name: 'Asha Rao', phone: '+919876543210', postalCode: '560001', country: 'IN' })
    expect(ctx).toMatchObject({ systemActor: true, selectedOrganizationId: ORG })
  })

  it('stores order totals in integer paise on the checkout ledger', async () => {
    await place()
    expect(em.checkouts[0]).toMatchObject({
      orderId: ORDER_ID,
      orderNumber: 'SO-1001',
      status: 'completed',
      subtotalAmount: '99800',
      shippingAmount: '4900',
      taxAmount: '15224',
      grandTotalAmount: '104700',
      tenantId: TENANT,
      organizationId: ORG,
      idempotencyKey: KEY,
      customerUserId: null,
    })
  })

  it('opens the payment session in decimal major units with a stable idempotency key', async () => {
    const result = await place()
    const checkout = em.checkouts[0]!
    expect(gateway.createPaymentSession).toHaveBeenCalledTimes(1)
    expect(gateway.createPaymentSession.mock.calls[0]![0]).toMatchObject({
      providerKey: 'razorpay',
      paymentId: checkout.paymentId,
      idempotencyKey: `storefront-checkout:${checkout.id}`,
      orderId: ORDER_ID,
      amount: 1047,
      currencyCode: 'INR',
      successUrl: `http://localhost:3001/order/${ORDER_ID}/confirmation`,
      cancelUrl: 'http://localhost:3001/checkout',
      tenantId: TENANT,
      organizationId: ORG,
      description: 'Order SO-1001',
    })
    expect(result.status).toBe(201)
    expect(result.body).toMatchObject({
      orderId: ORDER_ID,
      orderNumber: 'SO-1001',
      currencyCode: 'INR',
      totals: { subtotal: 998, shipping: 49, tax: 152.24, grandTotal: 1047 },
      payment: { transactionId: 'txn-1', providerKey: 'razorpay', status: 'pending', sessionId: 'order_rzp_1' },
    })
    expect(checkout).toMatchObject({ gatewayTransactionId: 'txn-1', paymentStatus: 'pending' })
  })

  it('gives guests an order access cookie and stores only its hash', async () => {
    const result = await place(GUEST, {}, KEY, request(`${ORDER_ACCESS_COOKIE}=`))
    expect(result.cookies).toHaveLength(1)
    expect(result.cookies[0]!.name).toBe(ORDER_ACCESS_COOKIE)
    const [entry] = parseOrderAccess(result.cookies[0]!.value)
    expect(entry!.orderId).toBe(ORDER_ID)
    expect(em.checkouts[0]!.guestAccessTokenHash).toBe(hashToken(entry!.token))
  })

  it('emits storefront.order.placed with the shop scope', async () => {
    await place()
    expect(emitStorefrontEvent).toHaveBeenCalledWith('storefront.order.placed', expect.objectContaining({ orderId: ORDER_ID, tenantId: TENANT, organizationId: ORG }))
  })

  it('still places the order when CRM linking fails', async () => {
    findOrCreatePerson.mockRejectedValueOnce(new Error('crm down'))
    const result = await place()
    expect(result.status).toBe(201)
    expect((orderCreateCalls()[0]![2] as Row).customerEntityId).toBeUndefined()
  })
})

describe('placeOrder — Stripe and signed-in customers', () => {
  it('passes the Stripe provider through and surfaces a redirect URL', async () => {
    gateway.createPaymentSession.mockImplementationOnce(async (sessionInput: Row) => ({
      transaction: { id: 'txn-stripe', providerKey: 'stripe', paymentId: sessionInput.paymentId, unifiedStatus: 'pending' },
      session: { sessionId: 'cs_test_1', status: 'pending', clientSession: { type: 'redirect', redirectUrl: 'https://checkout.stripe.com/c/pay/cs_test_1' } },
    }))
    const result = await place(GUEST, { paymentProvider: 'stripe' })
    expect(gateway.createPaymentSession.mock.calls[0]![0]).toMatchObject({ providerKey: 'stripe', amount: 1047, currencyCode: 'INR' })
    expect(result.body.payment).toMatchObject({ providerKey: 'stripe', redirectUrl: 'https://checkout.stripe.com/c/pay/cs_test_1', transactionId: 'txn-stripe' })
    expect(em.checkouts[0]!.providerKey).toBe('stripe')
  })

  it('links signed-in customers through their account and sets no guest cookie', async () => {
    const result = await place(CUSTOMER)
    expect(result.cookies).toEqual([])
    expect(ensureCustomerPerson).toHaveBeenCalledWith(container, SCOPE, expect.objectContaining({ customerUserId: CUSTOMER.customer.sub }))
    expect(em.checkouts[0]!.customerUserId).toBe(CUSTOMER.customer.sub)
    expect(em.checkouts[0]!.guestAccessTokenHash).toBeUndefined()
    expect((orderCreateCalls()[0]![2] as Row).metadata).toMatchObject({ customerUserId: CUSTOMER.customer.sub })
  })

  it('runs an inline payment sync when the session comes back already captured', async () => {
    gateway.createPaymentSession.mockImplementationOnce(async (sessionInput: Row) => ({
      transaction: { id: 'txn-paid', providerKey: 'razorpay', paymentId: sessionInput.paymentId, unifiedStatus: 'captured' },
      session: { sessionId: 's', status: 'captured' },
    }))
    await place()
    expect(syncCheckoutPayment).toHaveBeenCalledWith(container, { transactionId: 'txn-paid', tenantId: TENANT, organizationId: ORG })
  })
})

describe('placeOrder — Idempotency-Key ledger', () => {
  it('a retry with the same key and body returns the same order and payment session (200)', async () => {
    const first = await place()
    const second = await place()
    expect(second.status).toBe(200)
    expect(second.body.orderId).toBe(first.body.orderId)
    expect(second.body.payment.transactionId).toBe(first.body.payment.transactionId)
    expect(orderCreateCalls()).toHaveLength(1)
    expect(gateway.createPaymentSession).toHaveBeenCalledTimes(1)
    expect(em.checkouts).toHaveLength(1)
  })

  it('a replay does not depend on the catalog any more (prices of the placed order stand)', async () => {
    await place()
    repriceLines.mockResolvedValue({ lines: [], issues: [{ index: 0, productId: PRODUCT, variantId: null, code: 'product_unavailable' }] })
    const replay = await place()
    expect(replay.status).toBe(200)
    expect(replay.body.orderId).toBe(ORDER_ID)
  })

  it('rejects the same key with a different body (409 idempotency_key_reused)', async () => {
    await place()
    await expect(place(GUEST, { email: 'someone-else@example.com' })).rejects.toMatchObject({ status: 409, code: 'idempotency_key_reused' })
    expect(orderCreateCalls()).toHaveLength(1)
  })

  it("rejects the same key from a different customer (the key is bound to the shopper)", async () => {
    await place(CUSTOMER)
    const otherCustomer = { ...CUSTOMER, customer: { ...CUSTOMER.customer, sub: 'cccccccc-0000-4000-8000-000000000099' } }
    await expect(place(otherCustomer)).rejects.toMatchObject({ status: 409, code: 'idempotency_key_reused' })
  })

  it('tells a concurrent duplicate to retry later while the first attempt is still running', async () => {
    em.checkouts.push({
      id: randomUUID(),
      tenantId: TENANT,
      organizationId: ORG,
      kind: 'order',
      idempotencyKey: KEY,
      requestHash: 'whatever',
      status: 'processing',
      claimedAt: new Date(),
      orderId: null,
    })
    const error = await place().catch((err: unknown) => err)
    expect(error).toMatchObject({ status: 409, code: 'checkout_in_progress', headers: { 'retry-after': '2' } })
    expect(orderCreateCalls()).toHaveLength(0)
  })

  it('takes over a stalled claim that never produced an order', async () => {
    const stalled = {
      id: randomUUID(),
      tenantId: TENANT,
      organizationId: ORG,
      kind: 'order',
      idempotencyKey: KEY,
      requestHash: 'older-body',
      status: 'processing',
      claimedAt: new Date(Date.now() - CHECKOUT_CLAIM_STALE_MS - 1000),
      orderId: null,
      providerKey: 'stripe',
      paymentId: randomUUID(),
    }
    em.checkouts.push(stalled)
    const result = await place()
    expect(result.status).toBe(201)
    expect(em.checkouts).toHaveLength(1)
    expect(stalled).toMatchObject({ providerKey: 'razorpay', orderId: ORDER_ID })
    expect(orderCreateCalls()).toHaveLength(1)
  })

  it('treats the same key in another organization as a different request', async () => {
    em.checkouts.push({ id: randomUUID(), tenantId: TENANT, organizationId: OTHER_ORG, kind: 'order', idempotencyKey: KEY, requestHash: 'x', status: 'completed', orderId: 'foreign-order' })
    const result = await place()
    expect(result.status).toBe(201)
    expect(result.body.orderId).toBe(ORDER_ID)
    expect(em.findOne).toHaveBeenCalledWith(MockStorefrontCheckout, expect.objectContaining({ tenantId: TENANT, organizationId: ORG, idempotencyKey: KEY }))
  })

  it('releases the claim when the order cannot be created, so the key can be retried', async () => {
    executeCommand.mockImplementationOnce(async () => {
      throw new CrudHttpError(400, { error: 'invalid order' })
    })
    await expect(place()).rejects.toMatchObject({ status: 400 })
    expect(em.checkouts).toHaveLength(0)
    expect(em.nativeDelete).toHaveBeenCalledWith(MockStorefrontCheckout, expect.objectContaining({ orderId: null }))
    const retry = await place()
    expect(retry.status).toBe(201)
  })

  it('reuses an order created by a crashed earlier attempt instead of creating a duplicate', async () => {
    const claimId = randomUUID()
    em.checkouts.push({
      id: claimId,
      tenantId: TENANT,
      organizationId: ORG,
      kind: 'order',
      idempotencyKey: KEY,
      requestHash: 'h',
      status: 'processing',
      claimedAt: new Date(0),
      orderId: null,
      providerKey: 'razorpay',
      paymentId: randomUUID(),
    })
    em.orders.push(salesOrder({ externalReference: `storefront:${claimId}` }))
    const result = await place()
    expect(result.body.orderId).toBe(ORDER_ID)
    expect(orderCreateCalls()).toHaveLength(0)
  })
})

describe('placeOrder — payment failures keep the order', () => {
  it('returns 502 payment_session_failed with the order id, records the error and keeps the guest cookie', async () => {
    gateway.createPaymentSession.mockRejectedValueOnce(new Error('ECONNRESET to provider'))
    const error = (await place().catch((err: unknown) => err)) as StorefrontError
    expect(error).toBeInstanceOf(StorefrontError)
    expect(error).toMatchObject({ status: 502, code: 'payment_session_failed' })
    expect(error.extra).toMatchObject({ orderId: ORDER_ID, orderNumber: 'SO-1001' })
    expect(error.cookies.map((cookie) => cookie.name)).toEqual([ORDER_ACCESS_COOKIE])
    expect(em.checkouts[0]).toMatchObject({ orderId: ORDER_ID, status: 'order_created', lastError: 'ECONNRESET to provider' })
  })

  it('maps provider 4xx (e.g. missing keys / invalid amount) to 422 and exposes only the provider message', async () => {
    gateway.createPaymentSession.mockRejectedValueOnce(new CrudHttpError(422, { error: 'Razorpay requires an order amount of at least 100 minor units' }))
    const error = (await place().catch((err: unknown) => err)) as StorefrontError
    expect(error.status).toBe(422)
    expect(error.extra).toMatchObject({ providerError: 'Razorpay requires an order amount of at least 100 minor units' })
  })

  it('retrying the same key after a payment failure reuses the order and opens a new session', async () => {
    gateway.createPaymentSession.mockRejectedValueOnce(new Error('timeout'))
    await place().catch(() => undefined)
    const retry = await place()
    expect(retry.status).toBe(200)
    expect(retry.body.orderId).toBe(ORDER_ID)
    expect(orderCreateCalls()).toHaveLength(1)
    expect(gateway.createPaymentSession).toHaveBeenCalledTimes(2)
    expect(em.checkouts[0]).toMatchObject({ status: 'completed', lastError: null, gatewayTransactionId: 'txn-1' })
  })

  it('refuses to open a payment session for an order that is already paid', async () => {
    executeCommand.mockImplementation(async (_c, id, commandInput) => {
      if (id === 'sales.orders.create') {
        em.orders.push(salesOrder({ externalReference: commandInput.externalReference, outstandingAmount: '0', paidTotalAmount: '1047' }))
        return { orderId: ORDER_ID }
      }
      return {}
    })
    await expect(place()).rejects.toMatchObject({ status: 409, code: 'order_already_paid' })
    expect(gateway.createPaymentSession).not.toHaveBeenCalled()
  })
})

describe('retryOrderPayment (declined / abandoned payment)', () => {
  const retryInput = { paymentProvider: 'razorpay' as const, successUrl: 'http://localhost:3001/order/{orderId}/confirmation', cancelUrl: 'http://localhost:3001/checkout' }

  function retry(key = 'retry-key-0001-abcdef', shopper: typeof GUEST | typeof CUSTOMER = GUEST, overrides: Row = {}) {
    return retryOrderPayment({
      req: request(),
      container: container as never,
      shopper: shopper as never,
      orderId: ORDER_ID,
      input: { ...retryInput, ...overrides } as never,
      idempotencyKey: key,
      translate,
    })
  }

  beforeEach(() => {
    resolveRequester.mockResolvedValue({ customerUserId: null, personEntityId: null, guestTokens: new Map() })
  })

  it('returns 404 when the shopper may not access the order (no existence oracle)', async () => {
    loadAccessibleOrder.mockResolvedValue(null)
    await expect(retry()).rejects.toMatchObject({ status: 404, code: 'order_not_found' })
    expect(loadAccessibleOrder).toHaveBeenCalledWith(em, SCOPE, ORDER_ID, expect.anything())
    expect(gateway.createPaymentSession).not.toHaveBeenCalled()
  })

  it('refuses when money was already taken on an earlier attempt', async () => {
    loadAccessibleOrder.mockResolvedValue({ order: salesOrder(), checkouts: [{ paymentStatus: 'captured' }] })
    await expect(retry()).rejects.toMatchObject({ status: 409, code: 'order_already_paid' })
  })

  it('opens a new session on the same order for the amount due, storing paise and keeping guest access', async () => {
    loadAccessibleOrder.mockResolvedValue({
      order: salesOrder({ outstandingAmount: '1047.0000' }),
      checkouts: [{ paymentStatus: 'failed', guestAccessTokenHash: 'guest-hash' }],
    })
    const result = await retry()
    expect(result.status).toBe(201)
    expect(orderCreateCalls()).toHaveLength(0)
    expect(gateway.createPaymentSession.mock.calls[0]![0]).toMatchObject({ amount: 1047, orderId: ORDER_ID, tenantId: TENANT, organizationId: ORG })
    expect(em.checkouts[0]).toMatchObject({
      kind: 'payment_retry',
      orderId: ORDER_ID,
      grandTotalAmount: '104700',
      subtotalAmount: '99800',
      guestAccessTokenHash: 'guest-hash',
      customerEntityId: 'person-1',
    })
  })

  it('replays the same retry key without opening another session', async () => {
    loadAccessibleOrder.mockResolvedValue({ order: salesOrder(), checkouts: [] })
    const first = await retry()
    const second = await retry()
    expect(second.status).toBe(200)
    expect(second.body.payment.transactionId).toBe(first.body.payment.transactionId)
    expect(gateway.createPaymentSession).toHaveBeenCalledTimes(1)
  })

  it('cannot reuse an order-placement key for a payment retry', async () => {
    await place()
    loadAccessibleOrder.mockResolvedValue({ order: salesOrder(), checkouts: [] })
    await expect(retry(KEY)).rejects.toMatchObject({ status: 409, code: 'idempotency_key_reused' })
  })

  it('switching provider on retry is allowed (Razorpay -> Stripe)', async () => {
    loadAccessibleOrder.mockResolvedValue({ order: salesOrder(), checkouts: [{ paymentStatus: 'failed' }] })
    await retry('retry-key-stripe-0001', GUEST, { paymentProvider: 'stripe' })
    expect(gateway.createPaymentSession.mock.calls[0]![0]).toMatchObject({ providerKey: 'stripe' })
  })

  it('rejects disallowed return URLs before any lookup', async () => {
    await expect(retry('retry-key-0002-abcdef', GUEST, { cancelUrl: 'https://evil.test/' })).rejects.toMatchObject({ code: 'return_url_not_allowed' })
    expect(loadAccessibleOrder).not.toHaveBeenCalled()
  })
})
