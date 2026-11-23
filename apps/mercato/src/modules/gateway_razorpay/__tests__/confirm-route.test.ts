import { createHmac } from 'node:crypto'
import { afterAll, beforeEach, describe, expect, it, jest } from '@jest/globals'

/**
 * `POST /api/gateway_razorpay/confirm` — the public Checkout.js success
 * callback. Trust comes only from razorpay_signature = HMAC_SHA256(order|payment,
 * key_secret) verified against the key secret of the tenant that owns the
 * transaction; the payment status is then re-read from Razorpay through the
 * host gateway service, never taken from the browser.
 */

type Row = Record<string, unknown>

class MockGatewayTransaction {}

const findWithDecryption = jest.fn<(em: unknown, entity: unknown, where: Row, options: Row) => Promise<Row[]>>()
const resolveCredentials = jest.fn<(integrationId: string, scope: Row) => Promise<Row | null>>()
const getPaymentStatus = jest.fn<(transactionId: string, scope: Row) => Promise<{ status: string }>>()
const em = {}
const container = {
  resolve: (name: string) => {
    if (name === 'em') return em
    if (name === 'integrationCredentialsService') return { resolve: resolveCredentials }
    if (name === 'paymentGatewayService') return { getPaymentStatus }
    throw new Error(`unexpected ${name}`)
  },
}

jest.mock('@open-mercato/shared/lib/di/container', () => ({ createRequestContainer: async () => container }))
jest.mock('@open-mercato/core/modules/payment_gateways/data/entities', () => ({ GatewayTransaction: MockGatewayTransaction }))
jest.mock('@open-mercato/shared/lib/encryption/find', () => ({
  findWithDecryption: (...args: [unknown, unknown, Row, Row]) => findWithDecryption(...args),
}))

import { POST, metadata } from '../api/confirm/route'
import { RAZORPAY_ENV_KEYS } from '../lib/credentials'

const TENANT_A = '11111111-1111-4111-8111-111111111111'
const ORG_A = '22222222-2222-4222-8222-222222222222'
const TENANT_B = '33333333-3333-4333-8333-333333333333'
const ORG_B = '44444444-4444-4444-8444-444444444444'
const SECRET_A = 'key_secret_tenant_a'
const SECRET_B = 'key_secret_tenant_b'
const ORDER = 'order_Nx1234567890'
const PAYMENT = 'pay_Nx0987654321'

const savedEnv: Record<string, string | undefined> = {}
const envKeys = Object.values(RAZORPAY_ENV_KEYS).flat()

function sign(secret: string, order = ORDER, payment = PAYMENT) {
  return createHmac('sha256', secret).update(`${order}|${payment}`).digest('hex')
}

function confirm(body: unknown) {
  return POST(
    new Request('http://localhost:3000/api/gateway_razorpay/confirm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  )
}

function txn(overrides: Row = {}): Row {
  return {
    id: 'txn-a',
    paymentId: 'pay-local-a',
    providerKey: 'razorpay',
    providerSessionId: ORDER,
    tenantId: TENANT_A,
    organizationId: ORG_A,
    unifiedStatus: 'pending',
    ...overrides,
  }
}

beforeEach(() => {
  for (const key of envKeys) {
    if (!(key in savedEnv)) savedEnv[key] = process.env[key]
    delete process.env[key]
  }
  findWithDecryption.mockReset()
  resolveCredentials.mockReset()
  getPaymentStatus.mockReset()
  resolveCredentials.mockImplementation(async (_id, scope) => {
    if (scope.tenantId === TENANT_A) return { keyId: 'rzp_test_A', keySecret: SECRET_A }
    if (scope.tenantId === TENANT_B) return { keyId: 'rzp_test_B', keySecret: SECRET_B }
    return null
  })
  getPaymentStatus.mockResolvedValue({ status: 'captured' })
})

afterAll(() => {
  for (const key of envKeys) {
    if (savedEnv[key] === undefined) delete process.env[key]
    else process.env[key] = savedEnv[key]
  }
})

describe('POST /api/gateway_razorpay/confirm', () => {
  it('is a public, rate-limited route', () => {
    expect(metadata.POST).toMatchObject({ requireAuth: false, rateLimit: expect.objectContaining({ points: 30, duration: 60 }) })
  })

  it.each([
    ['malformed JSON', '{oops'],
    ['missing signature', { razorpay_order_id: ORDER, razorpay_payment_id: PAYMENT }],
    ['non-hex signature', { razorpay_order_id: ORDER, razorpay_payment_id: PAYMENT, razorpay_signature: 'z'.repeat(64) }],
    ['injected order id', { razorpay_order_id: "order_1' OR 1=1", razorpay_payment_id: PAYMENT, razorpay_signature: sign(SECRET_A) }],
  ])('rejects %s with 422 before any lookup', async (_label, body) => {
    const response = await confirm(body)
    expect(response.status).toBe(422)
    expect(findWithDecryption).not.toHaveBeenCalled()
  })

  it('looks up only live Razorpay transactions for the given Razorpay order id', async () => {
    findWithDecryption.mockResolvedValue([])
    await confirm({ razorpay_order_id: ORDER, razorpay_payment_id: PAYMENT, razorpay_signature: sign(SECRET_A) })
    expect(findWithDecryption).toHaveBeenCalledWith(em, MockGatewayTransaction, { providerKey: 'razorpay', providerSessionId: ORDER, deletedAt: null }, expect.objectContaining({ limit: 10 }))
  })

  it('returns 401 when no transaction matches the order id', async () => {
    findWithDecryption.mockResolvedValue([])
    const response = await confirm({ razorpay_order_id: ORDER, razorpay_payment_id: PAYMENT, razorpay_signature: sign(SECRET_A) })
    expect(response.status).toBe(401)
    expect(getPaymentStatus).not.toHaveBeenCalled()
  })

  it('verifies the signature with the owning tenant secret and syncs status from Razorpay in that scope', async () => {
    findWithDecryption.mockResolvedValue([txn()])
    const response = await confirm({ razorpay_order_id: ORDER, razorpay_payment_id: PAYMENT, razorpay_signature: sign(SECRET_A) })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ transactionId: 'txn-a', paymentId: 'pay-local-a', status: 'captured', synced: true })
    expect(resolveCredentials).toHaveBeenCalledWith('gateway_razorpay', { organizationId: ORG_A, tenantId: TENANT_A })
    expect(getPaymentStatus).toHaveBeenCalledWith('txn-a', { organizationId: ORG_A, tenantId: TENANT_A })
  })

  it('rejects a forged signature (wrong secret, swapped ids, other payment)', async () => {
    findWithDecryption.mockResolvedValue([txn()])
    for (const signature of [sign('guessed-secret'), sign(SECRET_A, PAYMENT, ORDER), sign(SECRET_A, ORDER, 'pay_other123')]) {
      const response = await confirm({ razorpay_order_id: ORDER, razorpay_payment_id: PAYMENT, razorpay_signature: signature })
      expect(response.status).toBe(401)
      const body = await response.json()
      expect(JSON.stringify(body)).not.toContain(SECRET_A)
      expect(JSON.stringify(body)).not.toContain(TENANT_A)
    }
    expect(getPaymentStatus).not.toHaveBeenCalled()
  })

  it("a signature made with tenant B's secret only ever confirms tenant B's transaction", async () => {
    findWithDecryption.mockResolvedValue([txn(), txn({ id: 'txn-b', paymentId: 'pay-local-b', tenantId: TENANT_B, organizationId: ORG_B })])
    const response = await confirm({ razorpay_order_id: ORDER, razorpay_payment_id: PAYMENT, razorpay_signature: sign(SECRET_B) })
    expect(response.status).toBe(200)
    expect((await response.json()).transactionId).toBe('txn-b')
    expect(getPaymentStatus).toHaveBeenCalledWith('txn-b', { organizationId: ORG_B, tenantId: TENANT_B })
  })

  it('treats a candidate with missing or misconfigured credentials as non-matching', async () => {
    findWithDecryption.mockResolvedValue([txn({ tenantId: 'no-creds' }), txn()])
    resolveCredentials.mockImplementationOnce(async () => {
      throw new Error('decrypt failed')
    })
    const ok = await confirm({ razorpay_order_id: ORDER, razorpay_payment_id: PAYMENT, razorpay_signature: sign(SECRET_A) })
    expect(ok.status).toBe(200)

    findWithDecryption.mockResolvedValue([txn({ tenantId: 'no-creds' })])
    resolveCredentials.mockResolvedValue(null)
    // Without a key secret no signature can verify — not even an HMAC with an empty key.
    const denied = await confirm({ razorpay_order_id: ORDER, razorpay_payment_id: PAYMENT, razorpay_signature: sign('') })
    expect(denied.status).toBe(401)
  })

  it('answers 202 (synced=false) when the signature is valid but Razorpay cannot be reached', async () => {
    findWithDecryption.mockResolvedValue([txn({ unifiedStatus: 'pending' })])
    getPaymentStatus.mockRejectedValue(new Error('ETIMEDOUT api.razorpay.com'))
    const response = await confirm({ razorpay_order_id: ORDER, razorpay_payment_id: PAYMENT, razorpay_signature: sign(SECRET_A) })
    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ transactionId: 'txn-a', paymentId: 'pay-local-a', status: 'pending', synced: false })
  })

  it('replaying the same confirmation converges on the gateway status instead of double-applying it', async () => {
    findWithDecryption.mockResolvedValue([txn()])
    const body = { razorpay_order_id: ORDER, razorpay_payment_id: PAYMENT, razorpay_signature: sign(SECRET_A) }
    await confirm(body)
    await confirm(body)
    // The route never writes state itself; each call only asks the host service to re-read Razorpay.
    expect(getPaymentStatus).toHaveBeenCalledTimes(2)
    expect(getPaymentStatus.mock.calls.every(([id]) => id === 'txn-a')).toBe(true)
  })
})
