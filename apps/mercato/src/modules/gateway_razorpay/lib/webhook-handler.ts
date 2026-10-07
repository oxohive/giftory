import { createHash } from 'node:crypto'
import type { VerifyWebhookInput, WebhookEvent } from '@open-mercato/shared/modules/payment_gateways/types'
import { requireRazorpayWebhookSecret, resolveRazorpayCredentials } from './credentials'
import { verifyRazorpayWebhookSignature } from './signature'

/**
 * Razorpay retries failed webhook deliveries for up to 24 hours. Events older than this window
 * are rejected as replays even when the signature is valid; duplicates inside the window are
 * absorbed by the host's atomic `claimWebhookProcessing` on the `x-razorpay-event-id` key.
 */
export const RAZORPAY_WEBHOOK_MAX_AGE_SECONDS = 72 * 60 * 60
/** Allowed clock skew for events that claim to be from the future. */
const RAZORPAY_WEBHOOK_FUTURE_SKEW_SECONDS = 5 * 60

export class RazorpayWebhookVerificationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RazorpayWebhookVerificationError'
  }
}

type JsonRecord = Record<string, unknown>

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null
}

function readEntity(payload: JsonRecord | null, key: 'payment' | 'order' | 'refund'): JsonRecord | null {
  const inner = asRecord(payload?.payload)
  const wrapper = asRecord(inner?.[key])
  return asRecord(wrapper?.entity)
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function readInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : null
}

function readHeader(headers: VerifyWebhookInput['headers'], name: string): string | null {
  const direct = headers[name] ?? headers[name.toLowerCase()]
  const value = Array.isArray(direct) ? direct[0] : direct
  if (typeof value === 'string' && value.trim().length > 0) return value.trim()
  // Header maps from some runtimes keep original casing.
  for (const [key, candidate] of Object.entries(headers)) {
    if (key.toLowerCase() !== name.toLowerCase()) continue
    const resolved = Array.isArray(candidate) ? candidate[0] : candidate
    if (typeof resolved === 'string' && resolved.trim().length > 0) return resolved.trim()
  }
  return null
}

/**
 * Locate the Razorpay order id (our provider session id) in a raw webhook payload.
 * payment.* and refund.* events carry `payload.payment.entity.order_id`;
 * order.paid carries `payload.order.entity.id`.
 */
export function readRazorpaySessionIdHint(payload: JsonRecord | null): string | null {
  if (!payload) return null
  const payment = readEntity(payload, 'payment')
  const fromPayment = readNonEmptyString(payment?.order_id)
  if (fromPayment) return fromPayment
  const order = readEntity(payload, 'order')
  return readNonEmptyString(order?.id)
}

/**
 * Build the provider-status string the host hands to `mapStatus(providerStatus, eventType)`.
 * For refunds it is the payment's `refund_status` (`partial` | `full`). When unknown we assume
 * `partial`: partially_refunded -> refunded is a valid later transition, the reverse is not.
 */
function resolveProviderStatus(eventType: string, payment: JsonRecord | null, order: JsonRecord | null): string {
  if (eventType === 'refund.processed') {
    const refundStatus = readNonEmptyString(payment?.refund_status)
    if (refundStatus === 'full' || refundStatus === 'partial') return refundStatus
    const amount = readInteger(payment?.amount)
    const refunded = readInteger(payment?.amount_refunded)
    if (amount !== null && refunded !== null && refunded >= amount) return 'full'
    return 'partial'
  }
  if (eventType.startsWith('order.')) return readNonEmptyString(order?.status) ?? ''
  return readNonEmptyString(payment?.status) ?? ''
}

/**
 * Whitelisted, PII-minimal snapshot of the event. This becomes `providerData` and is merged
 * into the transaction's gateway metadata, so it deliberately excludes card details, email,
 * contact and VPA fields that Razorpay includes in payment entities.
 */
function buildEventData(eventType: string, payload: JsonRecord): JsonRecord {
  const payment = readEntity(payload, 'payment')
  const order = readEntity(payload, 'order')
  const refund = readEntity(payload, 'refund')
  const orderId = readNonEmptyString(payment?.order_id) ?? readNonEmptyString(order?.id)

  return {
    // `id` is the provider session id (Razorpay order id) so generic processors can locate the transaction.
    id: orderId,
    status: resolveProviderStatus(eventType, payment, order),
    razorpayOrderId: orderId,
    razorpayPaymentId: readNonEmptyString(payment?.id),
    razorpayRefundId: readNonEmptyString(refund?.id),
    paymentStatus: readNonEmptyString(payment?.status),
    orderStatus: readNonEmptyString(order?.status),
    refundStatus: readNonEmptyString(refund?.status),
    paymentRefundStatus: readNonEmptyString(payment?.refund_status),
    method: readNonEmptyString(payment?.method),
    amountMinor: readInteger(payment?.amount) ?? readInteger(order?.amount),
    amountRefundedMinor: readInteger(payment?.amount_refunded),
    refundAmountMinor: readInteger(refund?.amount),
    currency: readNonEmptyString(payment?.currency) ?? readNonEmptyString(order?.currency),
    errorCode: readNonEmptyString(payment?.error_code),
    errorReason: readNonEmptyString(payment?.error_reason),
    errorDescription: readNonEmptyString(payment?.error_description),
  }
}

export async function verifyRazorpayWebhook(
  input: VerifyWebhookInput,
  nowMs: number = Date.now(),
): Promise<WebhookEvent> {
  const credentials = resolveRazorpayCredentials(input.credentials)
  const webhookSecret = requireRazorpayWebhookSecret(credentials)

  const signature = readHeader(input.headers, 'x-razorpay-signature')
  if (!signature) {
    throw new RazorpayWebhookVerificationError('Missing x-razorpay-signature header')
  }
  if (!verifyRazorpayWebhookSignature({ rawBody: input.rawBody, signature, webhookSecret })) {
    throw new RazorpayWebhookVerificationError('Invalid Razorpay webhook signature')
  }

  const rawText = typeof input.rawBody === 'string' ? input.rawBody : input.rawBody.toString('utf-8')
  let payload: JsonRecord | null
  try {
    payload = asRecord(JSON.parse(rawText))
  } catch {
    payload = null
  }
  if (!payload) throw new RazorpayWebhookVerificationError('Razorpay webhook body is not a JSON object')

  const eventType = readNonEmptyString(payload.event)
  if (!eventType) throw new RazorpayWebhookVerificationError('Razorpay webhook is missing the event type')

  const createdAt = readInteger(payload.created_at)
  const nowSeconds = Math.floor(nowMs / 1000)
  if (createdAt !== null) {
    if (nowSeconds - createdAt > RAZORPAY_WEBHOOK_MAX_AGE_SECONDS) {
      throw new RazorpayWebhookVerificationError('Razorpay webhook is outside the replay window')
    }
    if (createdAt - nowSeconds > RAZORPAY_WEBHOOK_FUTURE_SKEW_SECONDS) {
      throw new RazorpayWebhookVerificationError('Razorpay webhook timestamp is in the future')
    }
  }

  // Razorpay sends a unique, retry-stable event id header. Fall back to a body digest so
  // redeliveries of the same signed body still collapse onto one idempotency key.
  const eventId = readHeader(input.headers, 'x-razorpay-event-id')
    ?? `sha256:${createHash('sha256').update(rawText).digest('hex')}`

  return {
    eventType,
    eventId,
    data: buildEventData(eventType, payload),
    idempotencyKey: eventId,
    timestamp: new Date((createdAt ?? nowSeconds) * 1000),
  }
}
