import { createHmac } from 'node:crypto'
import { describe, expect, it } from '@jest/globals'
import {
  safeCompareHexSignature,
  verifyRazorpayPaymentSignature,
  verifyRazorpayWebhookSignature,
} from '../lib/signature'

const KEY_SECRET = 'test_key_secret_value'
const WEBHOOK_SECRET = 'test_webhook_secret_value'

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex')
}

describe('gateway_razorpay payment signature (Checkout.js handler)', () => {
  const orderId = 'order_IluGWxBm9U8zJ8'
  const paymentId = 'pay_IluGWxBm9U8zJ9'
  const valid = sign(`${orderId}|${paymentId}`, KEY_SECRET)

  it('accepts HMAC-SHA256(order_id|payment_id, key_secret)', () => {
    expect(verifyRazorpayPaymentSignature({ orderId, paymentId, signature: valid, keySecret: KEY_SECRET })).toBe(true)
  })

  it('accepts upper-case hex and surrounding whitespace', () => {
    expect(verifyRazorpayPaymentSignature({ orderId, paymentId, signature: ` ${valid.toUpperCase()} `, keySecret: KEY_SECRET })).toBe(true)
  })

  it('rejects a signature made with another secret', () => {
    const forged = sign(`${orderId}|${paymentId}`, 'other_secret')
    expect(verifyRazorpayPaymentSignature({ orderId, paymentId, signature: forged, keySecret: KEY_SECRET })).toBe(false)
  })

  it('rejects a signature for a different payment on the same order', () => {
    expect(verifyRazorpayPaymentSignature({ orderId, paymentId: 'pay_other', signature: valid, keySecret: KEY_SECRET })).toBe(false)
  })

  it('rejects swapped order/payment ids', () => {
    const swapped = sign(`${paymentId}|${orderId}`, KEY_SECRET)
    expect(verifyRazorpayPaymentSignature({ orderId, paymentId, signature: swapped, keySecret: KEY_SECRET })).toBe(false)
  })

  it('rejects malformed, truncated, and empty inputs without throwing', () => {
    expect(verifyRazorpayPaymentSignature({ orderId, paymentId, signature: valid.slice(0, 63), keySecret: KEY_SECRET })).toBe(false)
    expect(verifyRazorpayPaymentSignature({ orderId, paymentId, signature: 'z'.repeat(64), keySecret: KEY_SECRET })).toBe(false)
    expect(verifyRazorpayPaymentSignature({ orderId, paymentId, signature: '', keySecret: KEY_SECRET })).toBe(false)
    expect(verifyRazorpayPaymentSignature({ orderId, paymentId, signature: valid, keySecret: '' })).toBe(false)
    expect(verifyRazorpayPaymentSignature({ orderId: '', paymentId, signature: valid, keySecret: KEY_SECRET })).toBe(false)
  })
})

describe('gateway_razorpay webhook signature', () => {
  const body = JSON.stringify({ event: 'payment.captured', payload: {} })

  it('accepts HMAC-SHA256(raw body, webhook_secret) for string and Buffer bodies', () => {
    const signature = sign(body, WEBHOOK_SECRET)
    expect(verifyRazorpayWebhookSignature({ rawBody: body, signature, webhookSecret: WEBHOOK_SECRET })).toBe(true)
    expect(verifyRazorpayWebhookSignature({ rawBody: Buffer.from(body), signature, webhookSecret: WEBHOOK_SECRET })).toBe(true)
  })

  it('rejects a body that was re-serialized or tampered with', () => {
    const signature = sign(body, WEBHOOK_SECRET)
    const reserialized = JSON.stringify(JSON.parse(body), null, 2)
    expect(verifyRazorpayWebhookSignature({ rawBody: reserialized, signature, webhookSecret: WEBHOOK_SECRET })).toBe(false)
  })

  it('rejects the key secret used as webhook secret and missing signatures', () => {
    expect(verifyRazorpayWebhookSignature({ rawBody: body, signature: sign(body, KEY_SECRET), webhookSecret: WEBHOOK_SECRET })).toBe(false)
    expect(verifyRazorpayWebhookSignature({ rawBody: body, signature: undefined, webhookSecret: WEBHOOK_SECRET })).toBe(false)
    expect(verifyRazorpayWebhookSignature({ rawBody: body, signature: sign(body, WEBHOOK_SECRET), webhookSecret: '' })).toBe(false)
  })
})

describe('safeCompareHexSignature', () => {
  it('only compares well-formed sha256 hex strings', () => {
    const hex = 'a'.repeat(64)
    expect(safeCompareHexSignature(hex, hex)).toBe(true)
    expect(safeCompareHexSignature(hex, 'b'.repeat(64))).toBe(false)
    expect(safeCompareHexSignature(hex, null)).toBe(false)
    expect(safeCompareHexSignature(hex, `${hex}00`)).toBe(false)
  })
})
