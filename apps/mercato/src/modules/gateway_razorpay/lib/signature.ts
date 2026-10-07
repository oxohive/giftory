import { createHmac, timingSafeEqual } from 'node:crypto'

const HEX_SHA256 = /^[0-9a-f]{64}$/i

export function hmacSha256Hex(payload: string | Buffer, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex')
}

/**
 * Constant-time comparison of a provider-supplied hex signature against the expected one.
 * Malformed or wrong-length input returns false without throwing or short-circuiting on content.
 */
export function safeCompareHexSignature(expectedHex: string, receivedHex: string | null | undefined): boolean {
  if (typeof receivedHex !== 'string') return false
  const received = receivedHex.trim()
  if (!HEX_SHA256.test(received) || !HEX_SHA256.test(expectedHex)) return false
  const expectedBuffer = Buffer.from(expectedHex.toLowerCase(), 'hex')
  const receivedBuffer = Buffer.from(received.toLowerCase(), 'hex')
  if (expectedBuffer.length !== receivedBuffer.length) return false
  return timingSafeEqual(expectedBuffer, receivedBuffer)
}

/**
 * Checkout.js success handler verification:
 * razorpay_signature == HMAC_SHA256(`${razorpay_order_id}|${razorpay_payment_id}`, key_secret)
 */
export function verifyRazorpayPaymentSignature(input: {
  orderId: string
  paymentId: string
  signature: string
  keySecret: string
}): boolean {
  if (!input.keySecret || !input.orderId || !input.paymentId) return false
  const expected = hmacSha256Hex(`${input.orderId}|${input.paymentId}`, input.keySecret)
  return safeCompareHexSignature(expected, input.signature)
}

/**
 * Webhook verification:
 * X-Razorpay-Signature == HMAC_SHA256(raw request body, webhook_secret)
 * The raw body must be the exact bytes received; never re-serialize parsed JSON.
 */
export function verifyRazorpayWebhookSignature(input: {
  rawBody: string | Buffer
  signature: string | null | undefined
  webhookSecret: string
}): boolean {
  if (!input.webhookSecret) return false
  const expected = hmacSha256Hex(input.rawBody, input.webhookSecret)
  return safeCompareHexSignature(expected, input.signature)
}
