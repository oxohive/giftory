import { createHmac } from 'node:crypto'
import { describe, expect, it } from '@jest/globals'
import {
  RAZORPAY_WEBHOOK_MAX_AGE_SECONDS,
  readRazorpaySessionIdHint,
  verifyRazorpayWebhook,
} from '../lib/webhook-handler'
import { razorpayAdapter } from '../lib/adapter'

const WEBHOOK_SECRET = 'whsec_test_razorpay'
const NOW_MS = Date.UTC(2026, 9, 5, 12, 0, 0)
const NOW_S = Math.floor(NOW_MS / 1000)

const credentials = { keyId: 'rzp_test_abc', keySecret: 'key_secret', webhookSecret: WEBHOOK_SECRET }

function paymentEvent(event: string, payment: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return {
    entity: 'event',
    account_id: 'acc_1',
    event,
    contains: ['payment'],
    created_at: NOW_S - 10,
    payload: {
      payment: {
        entity: {
          id: 'pay_1',
          entity: 'payment',
          amount: 49900,
          currency: 'INR',
          status: 'captured',
          order_id: 'order_1',
          method: 'upi',
          email: 'buyer@example.com',
          contact: '+919999999999',
          vpa: 'buyer@okbank',
          card: { last4: '1111' },
          ...payment,
        },
      },
      ...extra,
    },
  }
}

function signedInput(body: unknown, headers: Record<string, string> = {}, secret = WEBHOOK_SECRET) {
  const rawBody = typeof body === 'string' ? body : JSON.stringify(body)
  const signature = createHmac('sha256', secret).update(rawBody).digest('hex')
  return {
    rawBody,
    headers: { 'x-razorpay-signature': signature, 'x-razorpay-event-id': 'evt_123', ...headers },
    credentials,
  }
}

describe('verifyRazorpayWebhook', () => {
  it('verifies the signature and uses x-razorpay-event-id as the idempotency key', async () => {
    const event = await verifyRazorpayWebhook(signedInput(paymentEvent('payment.captured', {})), NOW_MS)
    expect(event.eventType).toBe('payment.captured')
    expect(event.eventId).toBe('evt_123')
    expect(event.idempotencyKey).toBe('evt_123')
    expect(event.timestamp.getTime()).toBe((NOW_S - 10) * 1000)
    expect(event.data).toMatchObject({
      id: 'order_1',
      status: 'captured',
      razorpayOrderId: 'order_1',
      razorpayPaymentId: 'pay_1',
      amountMinor: 49900,
      currency: 'INR',
      method: 'upi',
    })
  })

  it('never copies customer PII (email, contact, VPA, card) into event data', async () => {
    const event = await verifyRazorpayWebhook(signedInput(paymentEvent('payment.captured', {})), NOW_MS)
    const serialized = JSON.stringify(event.data)
    expect(serialized).not.toContain('buyer@example.com')
    expect(serialized).not.toContain('+919999999999')
    expect(serialized).not.toContain('buyer@okbank')
    expect(serialized).not.toContain('1111')
  })

  it('accepts a Buffer body and header arrays', async () => {
    const input = signedInput(paymentEvent('payment.authorized', { status: 'authorized' }))
    const event = await verifyRazorpayWebhook({
      rawBody: Buffer.from(input.rawBody),
      headers: { ...input.headers, 'x-razorpay-signature': [input.headers['x-razorpay-signature']] },
      credentials,
    }, NOW_MS)
    expect(razorpayAdapter.mapStatus(String(event.data.status), event.eventType)).toBe('authorized')
  })

  it('rejects missing, invalid, or wrong-secret signatures', async () => {
    const body = paymentEvent('payment.captured', {})
    const input = signedInput(body)
    await expect(verifyRazorpayWebhook({ ...input, headers: { 'x-razorpay-event-id': 'evt_1' } }, NOW_MS))
      .rejects.toThrow(/Missing x-razorpay-signature/)
    await expect(verifyRazorpayWebhook(signedInput(body, {}, 'another_secret'), NOW_MS))
      .rejects.toThrow(/Invalid Razorpay webhook signature/)
    await expect(verifyRazorpayWebhook({ ...input, rawBody: `${input.rawBody} ` }, NOW_MS))
      .rejects.toThrow(/Invalid Razorpay webhook signature/)
  })

  it('fails closed when no webhook secret is configured', async () => {
    const previous = { a: process.env.RAZORPAY_WEBHOOK_SECRET, b: process.env.OM_INTEGRATION_RAZORPAY_WEBHOOK_SECRET }
    delete process.env.RAZORPAY_WEBHOOK_SECRET
    delete process.env.OM_INTEGRATION_RAZORPAY_WEBHOOK_SECRET
    try {
      const input = signedInput(paymentEvent('payment.captured', {}))
      await expect(verifyRazorpayWebhook({ ...input, credentials: { keyId: 'rzp_test_x', keySecret: 's' } }, NOW_MS))
        .rejects.toThrow(/webhook secret is required/)
    } finally {
      if (previous.a !== undefined) process.env.RAZORPAY_WEBHOOK_SECRET = previous.a
      if (previous.b !== undefined) process.env.OM_INTEGRATION_RAZORPAY_WEBHOOK_SECRET = previous.b
    }
  })

  it('rejects events outside the replay window or from the future', async () => {
    const stale = { ...paymentEvent('payment.captured', {}), created_at: NOW_S - RAZORPAY_WEBHOOK_MAX_AGE_SECONDS - 1 }
    await expect(verifyRazorpayWebhook(signedInput(stale), NOW_MS)).rejects.toThrow(/replay window/)
    const future = { ...paymentEvent('payment.captured', {}), created_at: NOW_S + 3600 }
    await expect(verifyRazorpayWebhook(signedInput(future), NOW_MS)).rejects.toThrow(/future/)
  })

  it('rejects signed bodies that are not Razorpay events', async () => {
    await expect(verifyRazorpayWebhook(signedInput('not json'), NOW_MS)).rejects.toThrow(/not a JSON object/)
    await expect(verifyRazorpayWebhook(signedInput({ payload: {} }), NOW_MS)).rejects.toThrow(/missing the event type/)
  })

  it('derives a stable idempotency key from the body when the event id header is absent', async () => {
    const body = paymentEvent('payment.captured', {})
    const input = signedInput(body)
    const headers = { 'x-razorpay-signature': input.headers['x-razorpay-signature'] }
    const first = await verifyRazorpayWebhook({ ...input, headers }, NOW_MS)
    const second = await verifyRazorpayWebhook({ ...input, headers }, NOW_MS)
    expect(first.idempotencyKey).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(first.idempotencyKey).toBe(second.idempotencyKey)
  })

  it('maps payment.failed to a non-terminal status and keeps the error details', async () => {
    const event = await verifyRazorpayWebhook(signedInput(paymentEvent('payment.failed', {
      status: 'failed',
      error_code: 'BAD_REQUEST_ERROR',
      error_reason: 'payment_failed',
      error_description: 'Payment failed',
    })), NOW_MS)
    expect(razorpayAdapter.mapStatus(String(event.data.status), event.eventType)).toBe('pending')
    expect(event.data).toMatchObject({ errorCode: 'BAD_REQUEST_ERROR', errorReason: 'payment_failed' })
  })

  it('resolves order.paid from the order entity', async () => {
    const body = {
      event: 'order.paid',
      created_at: NOW_S,
      payload: {
        payment: { entity: { id: 'pay_9', status: 'captured', order_id: 'order_9', amount: 100, currency: 'INR' } },
        order: { entity: { id: 'order_9', status: 'paid', amount: 100, currency: 'INR' } },
      },
    }
    const event = await verifyRazorpayWebhook(signedInput(body), NOW_MS)
    expect(event.data).toMatchObject({ id: 'order_9', status: 'paid', orderStatus: 'paid' })
    expect(razorpayAdapter.mapStatus(String(event.data.status), event.eventType)).toBe('captured')
  })

  it('resolves refund.processed to full or partial refund', async () => {
    const refund = { refund: { entity: { id: 'rfnd_1', amount: 10000, status: 'processed', payment_id: 'pay_1' } } }
    const partial = await verifyRazorpayWebhook(signedInput(paymentEvent('refund.processed', {
      amount: 49900, amount_refunded: 10000, refund_status: 'partial',
    }, refund)), NOW_MS)
    expect(razorpayAdapter.mapStatus(String(partial.data.status), partial.eventType)).toBe('partially_refunded')
    expect(partial.data).toMatchObject({ razorpayRefundId: 'rfnd_1', refundAmountMinor: 10000 })

    const full = await verifyRazorpayWebhook(signedInput(paymentEvent('refund.processed', {
      status: 'refunded', amount: 49900, amount_refunded: 49900, refund_status: 'full',
    }, refund)), NOW_MS)
    expect(razorpayAdapter.mapStatus(String(full.data.status), full.eventType)).toBe('refunded')

    const unknown = await verifyRazorpayWebhook(signedInput(paymentEvent('refund.processed', {
      amount_refunded: null, refund_status: null,
    }, refund)), NOW_MS)
    expect(razorpayAdapter.mapStatus(String(unknown.data.status), unknown.eventType)).toBe('partially_refunded')
  })
})

describe('readRazorpaySessionIdHint', () => {
  it('reads the order id from payment, refund, and order events', () => {
    expect(readRazorpaySessionIdHint(paymentEvent('payment.captured', {}))).toBe('order_1')
    expect(readRazorpaySessionIdHint({ payload: { order: { entity: { id: 'order_2' } } } })).toBe('order_2')
    expect(readRazorpaySessionIdHint({ payload: { payment: { entity: { id: 'pay_x', order_id: null } } } })).toBeNull()
    expect(readRazorpaySessionIdHint(null)).toBeNull()
    expect(readRazorpaySessionIdHint({})).toBeNull()
  })
})
