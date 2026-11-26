import { createHmac } from 'node:crypto'
import { beforeEach, describe, expect, it, jest } from '@jest/globals'

/**
 * Wiring of the Razorpay gateway into the payment_gateways host:
 *  - the webhook handler registered for `razorpay` verifies signatures with the
 *    tenant's webhook secret and caps the body size;
 *  - verified jobs go to the dedicated `razorpay-webhook` queue, whose worker
 *    delegates to the host processor (which enforces dispatch origin, scope
 *    from the verified transaction and the atomic event-id claim).
 */

const processPaymentGatewayWebhookJob = jest.fn<(deps: unknown, payload: unknown) => Promise<void>>()

jest.mock('@open-mercato/core/modules/payment_gateways/lib/webhook-processor', () => ({
  processPaymentGatewayWebhookJob: (deps: unknown, payload: unknown) => processPaymentGatewayWebhookJob(deps, payload),
}))

import {
  clearGatewayAdapters,
  clearPaymentGatewayDescriptors,
  clearWebhookHandlers,
  getGatewayAdapter,
  getPaymentGatewayDescriptor,
  getWebhookHandler,
} from '@open-mercato/shared/modules/payment_gateways/types'
import { register } from '../di'
import handleWebhookJob, { metadata as workerMetadata } from '../workers/webhook-processor'
import { RAZORPAY_WEBHOOK_QUEUE } from '../lib/queue'

const WEBHOOK_SECRET = 'whsec_registration_test'

beforeEach(() => {
  clearGatewayAdapters()
  clearWebhookHandlers()
  clearPaymentGatewayDescriptors()
  processPaymentGatewayWebhookJob.mockReset()
})

describe('gateway_razorpay DI registration', () => {
  function registerAll() {
    const registered: Record<string, unknown> = {}
    register({ register: (values: Record<string, unknown>) => Object.assign(registered, values) } as never)
    return registered
  }

  it('registers the adapter, the INR-only descriptor and the health check', () => {
    const registered = registerAll()
    expect(getGatewayAdapter('razorpay')).toBeDefined()
    expect(getPaymentGatewayDescriptor('razorpay')).toMatchObject({ providerKey: 'razorpay', sessionConfig: { supportedCurrencies: ['INR'] } })
    expect(registered).toHaveProperty('razorpayHealthCheck')
  })

  it('routes verified webhooks to the dedicated queue with a small body limit', () => {
    registerAll()
    const entry = getWebhookHandler('razorpay')!
    expect(entry.queue).toBe(RAZORPAY_WEBHOOK_QUEUE)
    expect(entry.maxBodyBytes).toBe(256 * 1024)
    expect(entry.readSessionIdHint?.({ payload: { payment: { entity: { order_id: 'order_1' } } } })).toBe('order_1')
  })

  it('the registered handler rejects unsigned/forged bodies and accepts a correctly signed one', async () => {
    registerAll()
    const { handler } = getWebhookHandler('razorpay')!
    const rawBody = JSON.stringify({ event: 'payment.captured', created_at: Math.floor(Date.now() / 1000), payload: { payment: { entity: { id: 'pay_1', order_id: 'order_1', status: 'captured', amount: 49900, currency: 'INR' } } } })
    const credentials = { keyId: 'rzp_test_x', keySecret: 'ks', webhookSecret: WEBHOOK_SECRET }

    await expect(handler({ rawBody, headers: {}, credentials } as never)).rejects.toThrow(/signature/i)
    await expect(
      handler({ rawBody, headers: { 'x-razorpay-signature': createHmac('sha256', 'wrong').update(rawBody).digest('hex') }, credentials } as never),
    ).rejects.toThrow(/signature/i)

    const signature = createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex')
    const event = await handler({ rawBody, headers: { 'x-razorpay-signature': signature, 'x-razorpay-event-id': 'evt_9' }, credentials } as never)
    expect(event).toMatchObject({ eventType: 'payment.captured', idempotencyKey: 'evt_9', data: { id: 'order_1', status: 'captured' } })
  })
})

describe('Razorpay webhook worker', () => {
  it('listens on the razorpay-webhook queue with bounded concurrency', () => {
    expect(workerMetadata).toMatchObject({ queue: 'razorpay-webhook', id: 'gateway-razorpay:webhook-processor' })
    expect(workerMetadata.concurrency).toBeGreaterThan(0)
    expect(workerMetadata.concurrency).toBeLessThanOrEqual(10)
  })

  it('delegates each job to the host processor with services resolved from the job container', async () => {
    const services: Record<string, unknown> = { em: { id: 'em' }, paymentGatewayService: { id: 'pgs' }, integrationLogService: { id: 'logs' } }
    const ctx = { resolve: jest.fn((name: string) => services[name]) }
    const payload = { providerKey: 'razorpay', event: { eventType: 'payment.captured', idempotencyKey: 'evt_1' } }
    await handleWebhookJob({ payload } as never, ctx as never)
    expect(processPaymentGatewayWebhookJob).toHaveBeenCalledWith(
      { em: services.em, paymentGatewayService: services.paymentGatewayService, integrationLogService: services.integrationLogService },
      payload,
    )
  })

  it('propagates processor failures so the queue retries the job', async () => {
    processPaymentGatewayWebhookJob.mockRejectedValueOnce(new Error('db down'))
    await expect(handleWebhookJob({ payload: {} } as never, { resolve: () => ({}) } as never)).rejects.toThrow('db down')
  })
})
