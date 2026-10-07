import { describe, expect, it, jest } from '@jest/globals'
import { createRazorpayAdapter } from '../lib/adapter'
import { createRazorpayClient, RazorpayApiError } from '../lib/client'
import { createRazorpayHealthCheck } from '../lib/health'
import { resolveRazorpayCredentials } from '../lib/credentials'

const credentials = { keyId: 'rzp_test_KEY123', keySecret: 'super_secret_value', webhookSecret: 'wh_secret' }

type Call = { url: string; method: string; body: unknown; authorization: string | null }

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/** Mock Razorpay: routes "METHOD path" to queued responses and records calls. */
function mockRazorpay(routes: Record<string, Array<{ status: number; body: unknown } | Error>>) {
  const calls: Call[] = []
  const fetchMock = jest.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const path = url.replace('https://api.razorpay.com/v1', '')
    const headers = (init?.headers ?? {}) as Record<string, string>
    calls.push({
      url,
      method,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      authorization: headers.Authorization ?? null,
    })
    const queue = routes[`${method} ${path}`]
    const next = queue?.shift()
    if (!next) throw new Error(`Unexpected request ${method} ${path}`)
    if (next instanceof Error) throw next
    return jsonResponse(next.status, next.body)
  })
  return { fetch: fetchMock as unknown as (input: string, init?: RequestInit) => Promise<Response>, calls }
}

const noSleep = async () => {}

describe('Razorpay adapter createSession', () => {
  it('creates an order in paise and returns what Checkout.js needs', async () => {
    const mock = mockRazorpay({
      'POST /orders': [{ status: 200, body: { id: 'order_1', entity: 'order', amount: 49950, amount_paid: 0, amount_due: 49950, currency: 'INR', receipt: 'x', status: 'created' } }],
    })
    const adapter = createRazorpayAdapter({ fetch: mock.fetch, sleep: noSleep })
    const result = await adapter.createSession({
      paymentId: '6f1c2f4e-1111-4222-8333-944455556666',
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      orderId: 'sales-order-1',
      idempotencyKey: 'idem-1',
      amount: 499.5,
      currencyCode: 'INR',
      credentials,
    })

    expect(mock.calls).toHaveLength(1)
    const call = mock.calls[0]
    expect(call.authorization).toBe(`Basic ${Buffer.from('rzp_test_KEY123:super_secret_value').toString('base64')}`)
    expect(call.body).toEqual({
      amount: 49950,
      currency: 'INR',
      receipt: '6f1c2f4e-1111-4222-8333-944455556666',
      notes: {
        paymentId: '6f1c2f4e-1111-4222-8333-944455556666',
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        orderId: 'sales-order-1',
        idempotencyKey: 'idem-1',
      },
      payment_capture: 1,
    })
    expect(result.sessionId).toBe('order_1')
    expect(result.status).toBe('pending')
    expect(result.clientSession).toEqual({
      type: 'embedded',
      rendererKey: 'razorpay.checkout',
      payload: { keyId: 'rzp_test_KEY123', orderId: 'order_1', amount: 49950, currency: 'INR', description: null },
    })
    // Secrets must never leave the server.
    expect(JSON.stringify(result)).not.toContain('super_secret_value')
    expect(JSON.stringify(result)).not.toContain('wh_secret')
  })

  it('requests manual capture when asked', async () => {
    const mock = mockRazorpay({
      'POST /orders': [{ status: 200, body: { id: 'order_2', amount: 100, amount_paid: 0, amount_due: 100, currency: 'INR', status: 'created' } }],
    })
    const adapter = createRazorpayAdapter({ fetch: mock.fetch })
    await adapter.createSession({ paymentId: 'p', tenantId: 't', organizationId: 'o', amount: 1, currencyCode: 'INR', captureMethod: 'manual', credentials })
    expect((mock.calls[0].body as Record<string, unknown>).payment_capture).toBe(0)
  })

  it('rejects unsupported currency and sub-minimum amounts with 422 before calling Razorpay', async () => {
    const mock = mockRazorpay({})
    const adapter = createRazorpayAdapter({ fetch: mock.fetch })
    const base = { paymentId: 'p', tenantId: 't', organizationId: 'o', credentials }
    await expect(adapter.createSession({ ...base, amount: 10, currencyCode: 'USD' })).rejects.toMatchObject({ status: 422 })
    await expect(adapter.createSession({ ...base, amount: 0.5, currencyCode: 'INR' })).rejects.toMatchObject({ status: 422 })
    expect(mock.calls).toHaveLength(0)
  })

  it('fails with 422 when credentials are missing', async () => {
    const saved = { ...process.env }
    delete process.env.RAZORPAY_KEY_ID
    delete process.env.RAZORPAY_KEY_SECRET
    delete process.env.OM_INTEGRATION_RAZORPAY_KEY_ID
    delete process.env.OM_INTEGRATION_RAZORPAY_KEY_SECRET
    try {
      const adapter = createRazorpayAdapter({ fetch: mockRazorpay({}).fetch })
      await expect(adapter.createSession({ paymentId: 'p', tenantId: 't', organizationId: 'o', amount: 10, currencyCode: 'INR', credentials: {} }))
        .rejects.toMatchObject({ status: 422 })
    } finally {
      process.env = saved
    }
  })
})

describe('Razorpay adapter capture/refund/cancel/getStatus', () => {
  const authorized = { id: 'pay_1', amount: 49900, currency: 'INR', status: 'authorized', order_id: 'order_1' }
  const captured = { ...authorized, status: 'captured', amount_refunded: 0 }

  it('captures the authorized payment for the order', async () => {
    const mock = mockRazorpay({
      'GET /orders/order_1/payments': [{ status: 200, body: { entity: 'collection', count: 1, items: [authorized] } }],
      'POST /payments/pay_1/capture': [{ status: 200, body: captured }],
    })
    const adapter = createRazorpayAdapter({ fetch: mock.fetch })
    const result = await adapter.capture({ sessionId: 'order_1', credentials })
    expect(mock.calls[1].body).toEqual({ amount: 49900, currency: 'INR' })
    expect(result).toEqual({ status: 'captured', capturedAmount: 499, providerData: { razorpayPaymentId: 'pay_1' } })
  })

  it('is idempotent when the payment was already captured', async () => {
    const mock = mockRazorpay({
      'GET /orders/order_1/payments': [{ status: 200, body: { items: [captured] } }],
    })
    const result = await createRazorpayAdapter({ fetch: mock.fetch }).capture({ sessionId: 'order_1', credentials })
    expect(result.status).toBe('captured')
    expect(mock.calls).toHaveLength(1)
  })

  it('rejects partial capture', async () => {
    const mock = mockRazorpay({
      'GET /orders/order_1/payments': [{ status: 200, body: { items: [authorized] } }],
    })
    await expect(createRazorpayAdapter({ fetch: mock.fetch }).capture({ sessionId: 'order_1', amount: 100, credentials }))
      .rejects.toMatchObject({ status: 422 })
  })

  it('refunds part of the captured payment in paise', async () => {
    const mock = mockRazorpay({
      'GET /orders/order_1/payments': [{ status: 200, body: { items: [captured] } }],
      'POST /payments/pay_1/refund': [{ status: 200, body: { id: 'rfnd_1', amount: 10050, currency: 'INR', payment_id: 'pay_1', status: 'processed' } }],
    })
    const result = await createRazorpayAdapter({ fetch: mock.fetch }).refund({
      sessionId: 'order_1', amount: 100.5, reason: 'customer_request', idempotencyKey: 'refund-op-1', credentials,
    })
    expect(mock.calls[1].body).toEqual({
      amount: 10050,
      speed: 'normal',
      receipt: 'refund-op-1',
      notes: { reason: 'customer_request', idempotencyKey: 'refund-op-1' },
    })
    expect(result).toMatchObject({ refundId: 'rfnd_1', status: 'partially_refunded', refundedAmount: 100.5 })
  })

  it('refunds the remaining balance when no amount is given', async () => {
    const mock = mockRazorpay({
      'GET /orders/order_1/payments': [{ status: 200, body: { items: [{ ...captured, amount_refunded: 9900 }] } }],
      'POST /payments/pay_1/refund': [{ status: 200, body: { id: 'rfnd_2', amount: 40000, currency: 'INR', payment_id: 'pay_1', status: 'processed' } }],
    })
    const result = await createRazorpayAdapter({ fetch: mock.fetch }).refund({ sessionId: 'order_1', credentials })
    expect((mock.calls[1].body as Record<string, unknown>).amount).toBe(40000)
    expect(result.status).toBe('refunded')
  })

  it('rejects refunds above the refundable balance', async () => {
    const mock = mockRazorpay({
      'GET /orders/order_1/payments': [{ status: 200, body: { items: [captured] } }],
    })
    await expect(createRazorpayAdapter({ fetch: mock.fetch }).refund({ sessionId: 'order_1', amount: 500, credentials }))
      .rejects.toMatchObject({ status: 422 })
  })

  it('cancels locally when nothing was captured and refuses after capture', async () => {
    const pendingMock = mockRazorpay({ 'GET /orders/order_1/payments': [{ status: 200, body: { items: [authorized] } }] })
    const result = await createRazorpayAdapter({ fetch: pendingMock.fetch }).cancel({ sessionId: 'order_1', credentials })
    expect(result.status).toBe('cancelled')
    expect(pendingMock.calls.every((call) => call.method === 'GET')).toBe(true)

    const capturedMock = mockRazorpay({ 'GET /orders/order_1/payments': [{ status: 200, body: { items: [captured] } }] })
    await expect(createRazorpayAdapter({ fetch: capturedMock.fetch }).cancel({ sessionId: 'order_1', credentials }))
      .rejects.toMatchObject({ status: 409 })
  })

  it('derives status from the order and its payments', async () => {
    const mock = mockRazorpay({
      'GET /orders/order_1': [{ status: 200, body: { id: 'order_1', amount: 49900, amount_paid: 49900, amount_due: 0, currency: 'INR', status: 'paid', attempts: 2 } }],
      'GET /orders/order_1/payments': [{ status: 200, body: { items: [{ ...authorized, id: 'pay_0', status: 'failed', error_code: 'BAD_REQUEST_ERROR' }, captured] } }],
    })
    const status = await createRazorpayAdapter({ fetch: mock.fetch }).getStatus({ sessionId: 'order_1', credentials })
    expect(status).toMatchObject({ status: 'captured', amount: 499, amountReceived: 499, currencyCode: 'INR' })
    expect(status.providerData).toMatchObject({ razorpayPaymentId: 'pay_1', lastFailedErrorCode: 'BAD_REQUEST_ERROR' })
  })
})

describe('Razorpay client transport', () => {
  const resolved = resolveRazorpayCredentials(credentials)

  it('retries GETs on 5xx and surfaces Razorpay error codes without secrets', async () => {
    const mock = mockRazorpay({
      'GET /orders/order_1': [
        { status: 503, body: {} },
        { status: 200, body: { id: 'order_1', amount: 100, amount_paid: 0, amount_due: 100, currency: 'INR', status: 'created' } },
      ],
      'GET /orders/order_x': [{ status: 400, body: { error: { code: 'BAD_REQUEST_ERROR', description: 'The id provided does not exist' } } }],
    })
    const client = createRazorpayClient(resolved, { fetch: mock.fetch, sleep: noSleep })
    await expect(client.fetchOrder('order_1')).resolves.toMatchObject({ id: 'order_1' })

    const error = await client.fetchOrder('order_x').catch((err) => err)
    expect(error).toBeInstanceOf(RazorpayApiError)
    expect(error).toMatchObject({ status: 400, code: 'BAD_REQUEST_ERROR', retryable: false })
    expect(String(error.message)).not.toContain('super_secret_value')
  })

  it('never retries POSTs', async () => {
    const mock = mockRazorpay({ 'POST /orders': [{ status: 500, body: {} }] })
    const client = createRazorpayClient(resolved, { fetch: mock.fetch, sleep: noSleep })
    await expect(client.createOrder({ amount: 100, currency: 'INR' })).rejects.toMatchObject({ status: 500 })
    expect(mock.calls).toHaveLength(1)
  })
})

describe('Razorpay health check', () => {
  it('reports healthy without exposing secrets', async () => {
    const mock = mockRazorpay({ 'GET /orders?count=1': [{ status: 200, body: { entity: 'collection', count: 0, items: [] } }] })
    const result = await createRazorpayHealthCheck({ fetch: mock.fetch }).check(credentials)
    expect(result.status).toBe('healthy')
    expect(result.details).toMatchObject({ mode: 'test', keyIdSuffix: 'Y123', webhookSecretConfigured: true })
    expect(JSON.stringify(result)).not.toContain('super_secret_value')
  })

  it('reports unhealthy on authentication failure', async () => {
    const mock = mockRazorpay({ 'GET /orders?count=1': [{ status: 401, body: { error: { code: 'BAD_REQUEST_ERROR', description: 'Authentication failed' } } }] })
    const result = await createRazorpayHealthCheck({ fetch: mock.fetch, sleep: noSleep }).check(credentials)
    expect(result.status).toBe('unhealthy')
    expect(result.message).toContain('rejected the Key ID / Key Secret')
    expect(JSON.stringify(result)).not.toContain('super_secret_value')
  })
})
