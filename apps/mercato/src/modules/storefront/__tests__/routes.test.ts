import { beforeEach, describe, expect, it, jest } from '@jest/globals'

/**
 * HTTP layer of the storefront facade: shop resolution, error mapping,
 * Idempotency-Key enforcement, authentication for account routes, and the
 * rule that owner/scope always comes from the server — never from the body.
 */

type Row = Record<string, unknown>

class MockStorefrontAddress {}

const resolveShopper = jest.fn<(...args: unknown[]) => Promise<unknown>>()
const placeOrder = jest.fn<(args: Row) => Promise<unknown>>()
const retryOrderPayment = jest.fn<(args: Row) => Promise<unknown>>()
const executeCommand = jest.fn<(container: unknown, id: string, input: Row, ctx: Row) => Promise<unknown>>()
const loadAccessibleOrder = jest.fn<(...args: unknown[]) => Promise<unknown>>()
const resolveRequester = jest.fn<(...args: unknown[]) => Promise<unknown>>()
const listCustomerOrders = jest.fn<(...args: unknown[]) => Promise<unknown>>()
const serializeOrderDetail = jest.fn<(...args: unknown[]) => Promise<unknown>>()
const resolveCart = jest.fn<(...args: unknown[]) => Promise<{ cart: Row | null; cookies: Row[] }>>()
const updateCartLine = jest.fn<(...args: unknown[]) => Promise<void>>()
const removeCartLine = jest.fn<(...args: unknown[]) => Promise<void>>()
const buildCartView = jest.fn<(...args: unknown[]) => Promise<unknown>>()
const findWithDecryption = jest.fn<(...args: unknown[]) => Promise<Row[]>>()
const em = { fork: () => em }
const container = { resolve: (name: string) => (name === 'em' ? em : null) }

jest.mock('@open-mercato/shared/lib/di/container', () => ({ createRequestContainer: async () => container }))
jest.mock('@open-mercato/shared/lib/i18n/server', () => ({
  resolveTranslations: async () => ({ translate: (_key: string, fallback: string) => fallback }),
}))
jest.mock('../lib/scope', () => ({ resolveShopper: (...args: unknown[]) => resolveShopper(...args) }))
jest.mock('../lib/checkout', () => ({
  placeOrder: (args: Row) => placeOrder(args),
  retryOrderPayment: (args: Row) => retryOrderPayment(args),
}))
jest.mock('../lib/system', () => ({
  executeCommand: (...args: [unknown, string, Row, Row]) => executeCommand(...args),
  systemCommandContext: (_container: unknown, scope: Row, request?: Request) => ({
    systemActor: true,
    auth: null,
    selectedOrganizationId: scope.organizationId,
    organizationIds: [scope.organizationId],
    request,
  }),
}))
jest.mock('../lib/orders', () => ({
  loadAccessibleOrder: (...args: unknown[]) => loadAccessibleOrder(...args),
  resolveRequester: (...args: unknown[]) => resolveRequester(...args),
  listCustomerOrders: (...args: unknown[]) => listCustomerOrders(...args),
  serializeOrderDetail: (...args: unknown[]) => serializeOrderDetail(...args),
}))
jest.mock('../lib/cart', () => ({
  resolveCart: (...args: unknown[]) => resolveCart(...args),
  readCartOwner: (_req: unknown, customer: unknown) => ({ customer, token: null }),
  updateCartLine: (...args: unknown[]) => updateCartLine(...args),
  removeCartLine: (...args: unknown[]) => removeCartLine(...args),
  buildCartView: (...args: unknown[]) => buildCartView(...args),
}))
jest.mock('../data/entities', () => ({ StorefrontAddress: MockStorefrontAddress }))
jest.mock('@open-mercato/shared/lib/encryption/find', () => ({
  findWithDecryption: (...args: unknown[]) => findWithDecryption(...args),
}))

import { z } from 'zod'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { POST as placeOrderRoute } from '../api/checkout/orders/route'
import { POST as paymentSessionRoute } from '../api/orders/[id]/payment-session/route'
import { GET as orderDetailRoute } from '../api/orders/[id]/route'
import { GET as ordersRoute } from '../api/orders/route'
import { GET as listAddressesRoute, POST as createAddressRoute } from '../api/account/addresses/route'
import { DELETE as deleteAddressRoute, PUT as updateAddressRoute } from '../api/account/addresses/[id]/route'
import { DELETE as removeLineRoute, PUT as updateLineRoute } from '../api/cart/lines/[lineId]/route'
import { StorefrontError, storefrontHandler } from '../lib/http'

const TENANT = '11111111-1111-4111-8111-111111111111'
const ORG = '22222222-2222-4222-8222-222222222222'
const EVIL = '99999999-9999-4999-8999-999999999999'
const SCOPE = { tenantId: TENANT, organizationId: ORG }
const ORDER_ID = 'dddddddd-0000-4000-8000-000000000001'
const ADDRESS_ID = 'aaaaaaaa-0000-4000-8000-000000000001'
const CUSTOMER = { sub: 'cccccccc-0000-4000-8000-000000000001', tenantId: TENANT, orgId: ORG }
const GUEST_SHOPPER = { scope: SCOPE, customer: null, source: 'shop' }
const CUSTOMER_SHOPPER = { scope: SCOPE, customer: CUSTOMER, source: 'customer' }
const KEY = 'idem-key-0123456789abcdef'

const address = {
  fullName: 'Asha Rao',
  phone: '9876543210',
  line1: '12 MG Road',
  city: 'Bengaluru',
  state: 'Karnataka',
  postalCode: '560001',
  country: 'IN',
}

const orderBody = {
  email: 'asha@example.com',
  lines: [{ productId: '6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b', quantity: 1 }],
  shippingAddress: address,
  shippingMethodCode: 'standard',
  paymentProvider: 'razorpay',
  successUrl: 'http://localhost:3001/order/{orderId}/confirmation',
  cancelUrl: 'http://localhost:3001/checkout',
}

function req(path: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  return new Request(`http://localhost:3000/api/storefront${path}?organizationId=${ORG}`, {
    method: init.method ?? 'GET',
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    body: init.body === undefined ? undefined : typeof init.body === 'string' ? init.body : JSON.stringify(init.body),
  })
}

const params = (values: Record<string, string>) => ({ params: values })

beforeEach(() => {
  for (const mock of [
    resolveShopper,
    placeOrder,
    retryOrderPayment,
    executeCommand,
    loadAccessibleOrder,
    resolveRequester,
    listCustomerOrders,
    serializeOrderDetail,
    resolveCart,
    updateCartLine,
    removeCartLine,
    buildCartView,
    findWithDecryption,
  ]) {
    mock.mockReset()
  }
  resolveShopper.mockResolvedValue({ ok: true, shopper: GUEST_SHOPPER })
  resolveRequester.mockResolvedValue({ customerUserId: null, personEntityId: null, guestTokens: new Map() })
  buildCartView.mockResolvedValue({ id: 'cart-1', lines: [] })
})

describe('storefrontHandler error mapping', () => {
  it('maps an unresolvable shop to 400 shop_required / 404 shop_not_found without running the handler', async () => {
    const handler = jest.fn(async () => new Response('ok'))
    const route = storefrontHandler('t', handler)
    resolveShopper.mockResolvedValueOnce({ ok: false, status: 400, code: 'shop_required' })
    const missing = await route(req('/cart'))
    expect(missing.status).toBe(400)
    expect(await missing.json()).toMatchObject({ code: 'shop_required' })
    resolveShopper.mockResolvedValueOnce({ ok: false, status: 404, code: 'shop_not_found' })
    expect((await route(req('/cart'))).status).toBe(404)
    expect(handler).not.toHaveBeenCalled()
  })

  it('maps StorefrontError to its status/code and still sets attached cookies (httpOnly)', async () => {
    const route = storefrontHandler('t', async () => {
      const error = new StorefrontError(502, 'payment_session_failed', 'Payment failed', { orderId: ORDER_ID }, { 'retry-after': '2' })
      error.cookies.push({ name: 'sf_order_access', value: 'abc', maxAge: 60 })
      throw error
    })
    const response = await route(req('/x'))
    expect(response.status).toBe(502)
    expect(response.headers.get('retry-after')).toBe('2')
    expect(await response.json()).toEqual({ error: 'Payment failed', code: 'payment_session_failed', orderId: ORDER_ID })
    const cookie = response.headers.get('set-cookie') ?? ''
    expect(cookie).toContain('sf_order_access=abc')
    expect(cookie.toLowerCase()).toContain('httponly')
  })

  it('maps Zod and CrudHttpError failures', async () => {
    const zodRoute = storefrontHandler('t', async () => {
      z.object({ a: z.string() }).parse({})
      return new Response('unreachable')
    })
    const zodResponse = await zodRoute(req('/x'))
    expect(zodResponse.status).toBe(422)
    expect(await zodResponse.json()).toMatchObject({ code: 'invalid_request', details: [expect.objectContaining({ path: 'a' })] })

    const crudRoute = storefrontHandler('t', async () => {
      throw new CrudHttpError(409, { error: 'Address book is full', code: 'conflict' })
    })
    const crudResponse = await crudRoute(req('/x'))
    expect(crudResponse.status).toBe(409)
    expect(await crudResponse.json()).toEqual({ error: 'Address book is full', code: 'conflict' })
  })

  it('never leaks internals (message, stack, scope) on unexpected failures', async () => {
    const route = storefrontHandler('t', async () => {
      throw new Error(`relation "secret_table" does not exist for tenant ${TENANT}`)
    })
    const response = await route(req('/x'))
    expect(response.status).toBe(500)
    const text = await response.text()
    expect(JSON.parse(text)).toEqual({ error: 'Something went wrong. Please try again.', code: 'internal_error' })
    expect(text).not.toContain('secret_table')
    expect(text).not.toContain(TENANT)
  })
})

describe('POST /checkout/orders', () => {
  it('requires an Idempotency-Key header', async () => {
    const response = await placeOrderRoute(req('/checkout/orders', { method: 'POST', body: orderBody }))
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: 'idempotency_key_required' })
    expect(placeOrder).not.toHaveBeenCalled()
  })

  it.each([['short'], ['has spaces in the key 123'], ['x'.repeat(129)], ['quote"injection-123456']])(
    'rejects a malformed Idempotency-Key (%s)',
    async (key) => {
      const response = await placeOrderRoute(req('/checkout/orders', { method: 'POST', body: orderBody, headers: { 'idempotency-key': key } }))
      expect(response.status).toBe(400)
      expect(placeOrder).not.toHaveBeenCalled()
    },
  )

  it('rejects malformed JSON and invalid bodies with 422 before placing anything', async () => {
    const malformed = await placeOrderRoute(req('/checkout/orders', { method: 'POST', body: '{not json', headers: { 'idempotency-key': KEY } }))
    expect(malformed.status).toBe(422)
    const badPin = await placeOrderRoute(
      req('/checkout/orders', { method: 'POST', body: { ...orderBody, shippingAddress: { ...address, postalCode: '012345' } }, headers: { 'idempotency-key': KEY } }),
    )
    expect(badPin.status).toBe(422)
    const badPhone = await placeOrderRoute(
      req('/checkout/orders', { method: 'POST', body: { ...orderBody, shippingAddress: { ...address, phone: '+14155550100' } }, headers: { 'idempotency-key': KEY } }),
    )
    expect(badPhone.status).toBe(422)
    expect(await badPhone.json()).toMatchObject({ code: 'invalid_request', details: [expect.objectContaining({ path: 'shippingAddress.phone' })] })
    expect(placeOrder).not.toHaveBeenCalled()
  })

  it('places the order with the server-resolved shopper and a trimmed key, dropping payload scope', async () => {
    placeOrder.mockResolvedValue({ status: 201, body: { orderId: ORDER_ID }, cookies: [{ name: 'sf_order_access', value: 'v', maxAge: 10 }] })
    const response = await placeOrderRoute(
      req('/checkout/orders', {
        method: 'POST',
        body: { ...orderBody, tenantId: EVIL, organizationId: EVIL, customerUserId: EVIL },
        headers: { 'idempotency-key': `  ${KEY}  ` },
      }),
    )
    expect(response.status).toBe(201)
    expect(response.headers.get('set-cookie')).toContain('sf_order_access=v')
    const args = placeOrder.mock.calls[0]![0]
    expect(args.idempotencyKey).toBe(KEY)
    expect(args.shopper).toBe(GUEST_SHOPPER)
    expect(args.input).not.toHaveProperty('tenantId')
    expect(args.input).not.toHaveProperty('organizationId')
    expect(args.input).not.toHaveProperty('customerUserId')
  })

  it('returns 200 for an idempotent replay', async () => {
    placeOrder.mockResolvedValue({ status: 200, body: { orderId: ORDER_ID }, cookies: [] })
    const response = await placeOrderRoute(req('/checkout/orders', { method: 'POST', body: orderBody, headers: { 'idempotency-key': KEY } }))
    expect(response.status).toBe(200)
  })
})

describe('POST /orders/{id}/payment-session', () => {
  const body = { paymentProvider: 'stripe', successUrl: orderBody.successUrl, cancelUrl: orderBody.cancelUrl }

  it('answers 404 for a malformed order id (no lookup)', async () => {
    const response = await paymentSessionRoute(req('/orders/x/payment-session', { method: 'POST', body, headers: { 'idempotency-key': KEY } }), params({ id: 'not-a-uuid' }))
    expect(response.status).toBe(404)
    expect(retryOrderPayment).not.toHaveBeenCalled()
  })

  it('requires an Idempotency-Key', async () => {
    const response = await paymentSessionRoute(req('/orders/x/payment-session', { method: 'POST', body }), params({ id: ORDER_ID }))
    expect(response.status).toBe(400)
    expect(retryOrderPayment).not.toHaveBeenCalled()
  })

  it('rejects unknown providers and delegates valid requests', async () => {
    const bad = await paymentSessionRoute(
      req('/orders/x/payment-session', { method: 'POST', body: { ...body, paymentProvider: 'paypal' }, headers: { 'idempotency-key': KEY } }),
      params({ id: ORDER_ID }),
    )
    expect(bad.status).toBe(422)
    retryOrderPayment.mockResolvedValue({ status: 201, body: { orderId: ORDER_ID }, cookies: [] })
    const ok = await paymentSessionRoute(req('/orders/x/payment-session', { method: 'POST', body, headers: { 'idempotency-key': KEY } }), params({ id: ORDER_ID }))
    expect(ok.status).toBe(201)
    expect(retryOrderPayment.mock.calls[0]![0]).toMatchObject({ orderId: ORDER_ID, idempotencyKey: KEY, shopper: GUEST_SHOPPER })
  })
})

describe('order reads', () => {
  it('GET /orders requires a signed-in customer', async () => {
    const response = await ordersRoute(req('/orders'))
    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ code: 'authentication_required' })
    expect(listCustomerOrders).not.toHaveBeenCalled()
  })

  it('GET /orders lists for the signed-in customer within the shop scope', async () => {
    resolveShopper.mockResolvedValue({ ok: true, shopper: CUSTOMER_SHOPPER })
    listCustomerOrders.mockResolvedValue({ items: [], total: 0, page: 2, pageSize: 5 })
    const response = await ordersRoute(new Request(`http://localhost:3000/api/storefront/orders?page=2&pageSize=5&tenantId=${EVIL}`))
    expect(response.status).toBe(200)
    expect(listCustomerOrders).toHaveBeenCalledWith(em, SCOPE, expect.anything(), 2, 5)
  })

  it('GET /orders/{id} answers the same 404 for malformed, unknown and inaccessible orders', async () => {
    const malformed = await orderDetailRoute(req('/orders/x'), params({ id: '1 OR 1=1' }))
    loadAccessibleOrder.mockResolvedValue(null)
    const hidden = await orderDetailRoute(req(`/orders/${ORDER_ID}`), params({ id: ORDER_ID }))
    expect(malformed.status).toBe(404)
    expect(hidden.status).toBe(404)
    expect(await malformed.json()).toEqual(await hidden.json())
    expect(loadAccessibleOrder).toHaveBeenCalledTimes(1)
    expect(loadAccessibleOrder).toHaveBeenCalledWith(em, SCOPE, ORDER_ID, expect.anything())
  })
})

describe('address book', () => {
  it('requires a signed-in customer for every method', async () => {
    expect((await listAddressesRoute(req('/account/addresses'))).status).toBe(401)
    expect((await createAddressRoute(req('/account/addresses', { method: 'POST', body: address }))).status).toBe(401)
    expect((await updateAddressRoute(req('/account/addresses/x', { method: 'PUT', body: address }), params({ id: ADDRESS_ID }))).status).toBe(401)
    expect((await deleteAddressRoute(req('/account/addresses/x', { method: 'DELETE' }), params({ id: ADDRESS_ID }))).status).toBe(401)
    expect(executeCommand).not.toHaveBeenCalled()
  })

  it('lists only the session customer’s addresses in this shop', async () => {
    resolveShopper.mockResolvedValue({ ok: true, shopper: CUSTOMER_SHOPPER })
    findWithDecryption.mockResolvedValue([])
    await listAddressesRoute(req(`/account/addresses?customerUserId=${EVIL}`))
    expect(findWithDecryption).toHaveBeenCalledWith(
      em,
      MockStorefrontAddress,
      { tenantId: TENANT, organizationId: ORG, customerUserId: CUSTOMER.sub, deletedAt: null },
      expect.anything(),
      SCOPE,
    )
  })

  it('creates addresses for the session owner, ignoring owner/scope in the body', async () => {
    resolveShopper.mockResolvedValue({ ok: true, shopper: CUSTOMER_SHOPPER })
    executeCommand.mockResolvedValue({ id: ADDRESS_ID })
    const response = await createAddressRoute(
      req('/account/addresses', { method: 'POST', body: { ...address, tenantId: EVIL, organizationId: EVIL, customerUserId: EVIL } }),
    )
    expect(response.status).toBe(201)
    const [, commandId, input, ctx] = executeCommand.mock.calls[0]!
    expect(commandId).toBe('storefront.addresses.create')
    expect(input).toMatchObject({ tenantId: TENANT, organizationId: ORG, customerUserId: CUSTOMER.sub, fullName: 'Asha Rao' })
    expect(ctx).toMatchObject({ systemActor: true, selectedOrganizationId: ORG, organizationIds: [ORG] })
  })

  it('rejects an invalid Indian PIN code / mobile number', async () => {
    resolveShopper.mockResolvedValue({ ok: true, shopper: CUSTOMER_SHOPPER })
    expect((await createAddressRoute(req('/account/addresses', { method: 'POST', body: { ...address, postalCode: '56001' } }))).status).toBe(422)
    expect((await createAddressRoute(req('/account/addresses', { method: 'POST', body: { ...address, phone: '5876543210' } }))).status).toBe(422)
    expect((await createAddressRoute(req('/account/addresses', { method: 'POST', body: { ...address, country: 'US' } }))).status).toBe(422)
    expect(executeCommand).not.toHaveBeenCalled()
  })

  it('updates/deletes by id for the session owner and 404s malformed ids', async () => {
    resolveShopper.mockResolvedValue({ ok: true, shopper: CUSTOMER_SHOPPER })
    expect((await updateAddressRoute(req('/account/addresses/x', { method: 'PUT', body: { city: 'Mysuru' } }), params({ id: 'abc' }))).status).toBe(404)
    executeCommand.mockResolvedValue({ id: ADDRESS_ID })
    await updateAddressRoute(req('/account/addresses/x', { method: 'PUT', body: { city: 'Mysuru', customerUserId: EVIL } }), params({ id: ADDRESS_ID }))
    await deleteAddressRoute(req('/account/addresses/x', { method: 'DELETE' }), params({ id: ADDRESS_ID }))
    expect(executeCommand.mock.calls.map(([, id, input]) => [id, input.customerUserId, input.id])).toEqual([
      ['storefront.addresses.update', CUSTOMER.sub, ADDRESS_ID],
      ['storefront.addresses.delete', CUSTOMER.sub, ADDRESS_ID],
    ])
  })
})

describe('cart line routes', () => {
  it('answer 404 for malformed line ids and when there is no cart', async () => {
    expect((await updateLineRoute(req('/cart/lines/x', { method: 'PUT', body: { quantity: 2 } }), params({ lineId: 'x' }))).status).toBe(404)
    resolveCart.mockResolvedValue({ cart: null, cookies: [] })
    expect((await removeLineRoute(req('/cart/lines/x', { method: 'DELETE' }), params({ lineId: ADDRESS_ID }))).status).toBe(404)
    expect(removeCartLine).not.toHaveBeenCalled()
  })

  it('rejects an empty update and out-of-range quantities', async () => {
    resolveCart.mockResolvedValue({ cart: { id: 'cart-1' }, cookies: [] })
    expect((await updateLineRoute(req('/cart/lines/x', { method: 'PUT', body: {} }), params({ lineId: ADDRESS_ID }))).status).toBe(422)
    expect((await updateLineRoute(req('/cart/lines/x', { method: 'PUT', body: { quantity: 0 } }), params({ lineId: ADDRESS_ID }))).status).toBe(422)
    expect((await updateLineRoute(req('/cart/lines/x', { method: 'PUT', body: { quantity: 21 } }), params({ lineId: ADDRESS_ID }))).status).toBe(422)
    expect(updateCartLine).not.toHaveBeenCalled()
  })

  it('updates within the resolved cart and scope', async () => {
    const cart = { id: 'cart-1' }
    resolveCart.mockResolvedValue({ cart, cookies: [] })
    const response = await updateLineRoute(req('/cart/lines/x', { method: 'PUT', body: { quantity: 3, giftWrap: true } }), params({ lineId: ADDRESS_ID }))
    expect(response.status).toBe(200)
    expect(updateCartLine).toHaveBeenCalledWith(em, SCOPE, cart, ADDRESS_ID, { quantity: 3, giftWrap: true }, expect.any(Function))
  })
})
